import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { employeeSkills, employees, memoryProposals, messages, skillVersions, skills, workspaces } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { resolveProvider, type ChatMessage } from "@/lib/providers";
import { approvedMemories, approvedSourcesForEmployee, retrieveSnippets } from "./retrieval";
import { buildEmployeeSystemPrompt } from "./prompt";
import { checkBudgets, monthToDate, recordUsage } from "./usage";
import { enqueueJob } from "@/lib/jobs/queue";
import { recordAudit } from "@/lib/audit";

/** Persists a user message and queues the employee's reply as a durable job. */
export function postUserMessage(db: Db, input: { workspaceId: string; employeeId: string; userId: string; content: string; taskId?: string | null }) {
  const employee = db.select().from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.workspaceId, input.workspaceId))).get();
  if (!employee) throw new Error("Employee not found.");
  const id = newId("msg");
  db.insert(messages).values({ id, workspaceId: input.workspaceId, employeeId: employee.id, taskId: input.taskId ?? null, authorType: "user", authorId: input.userId, content: input.content, metadata: null, createdAt: nowIso() }).run();
  const job = enqueueJob(db, { workspaceId: input.workspaceId, kind: "employee.reply", payload: { employeeId: employee.id, messageId: id } });
  return { messageId: id, jobId: job.id };
}

const MEMORY_TRIGGER = /^(please )?(remember|note that|from now on|going forward|in future|always|never)\b/i;

/** Generates the reply. Runs inside the job worker so it survives restarts and respects pause/stop. */
export async function generateEmployeeReply(db: Db, input: { workspaceId: string; employeeId: string; messageId: string }) {
  const employee = db.select().from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.workspaceId, input.workspaceId))).get();
  if (!employee) throw new Error("Employee not found.");
  const workspace = db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).get()!;
  if (workspace.settings.emergencyStop) throw new Error("Emergency stop is active; replies are paused.");
  if (employee.status !== "active") throw new Error(`Employee is ${employee.status}; replies are paused.`);

  const userMessage = db.select().from(messages).where(eq(messages.id, input.messageId)).get();
  if (!userMessage) throw new Error("Message not found.");
  const alreadyReplied = db.select().from(messages).where(and(eq(messages.employeeId, employee.id), eq(messages.authorType, "employee"))).all().some((m) => m.metadata?.inReplyTo === input.messageId);
  if (alreadyReplied) return; // idempotent: a retried job never double-posts

  const history = db.select().from(messages).where(eq(messages.employeeId, employee.id)).orderBy(desc(messages.createdAt)).limit(12).all().reverse();
  const skillRows = db
    .select({ skill: skills })
    .from(employeeSkills)
    .innerJoin(skills, eq(skills.id, employeeSkills.skillId))
    .where(and(eq(employeeSkills.employeeId, employee.id), eq(skills.status, "approved")))
    .all();
  const versionRows = skillRows.length
    ? db.select().from(skillVersions).where(inArray(skillVersions.skillId, skillRows.map((r) => r.skill.id))).all()
    : [];
  const skillSummaries = skillRows.map((r) => ({ name: r.skill.name, version: versionRows.find((v) => v.skillId === r.skill.id && v.version === r.skill.currentVersion) ?? null }));
  const sources = approvedSourcesForEmployee(db, input.workspaceId, employee.id);
  const snippets = retrieveSnippets(sources, userMessage.content, 3);
  const mems = approvedMemories(db, input.workspaceId, employee.id);

  const system = buildEmployeeSystemPrompt({ employee, skills: skillSummaries, memories: mems, snippets, productName: workspace.settings.productName });
  const chat: ChatMessage[] = history.filter((m) => m.authorType !== "system").map((m) => ({ role: m.authorType === "user" ? "user" : "assistant", content: m.content }));

  const resolved = resolveProvider(employee.modelConfig);
  if (resolved.adapter.key !== "demo") {
    const problems = checkBudgets(db, input.workspaceId, employee.id, employee.modelConfig.perTaskBudgetCents, monthToDate(db, input.workspaceId, employee.id).costCents);
    if (problems.length) throw new Error(problems.join(" "));
  }
  const result = await resolved.adapter.complete({
    model: resolved.model,
    system,
    messages: chat,
    maxOutputTokens: employee.modelConfig.maxOutputTokens,
    temperature: employee.modelConfig.temperature,
    purpose: "chat",
    demoContext: { employeeName: employee.name, roleTitle: employee.roleTitle, snippets: snippets.map((s) => ({ title: s.title, excerpt: s.excerpt })) },
  });
  recordUsage(db, { workspaceId: input.workspaceId, employeeId: employee.id, taskId: userMessage.taskId, provider: result.provider, model: result.model, meter: "model_tokens", inputUnits: result.usage.inputTokens, outputUnits: result.usage.outputTokens, unit: "tokens", eventKey: `reply:${input.messageId}` });

  let proposalId: string | null = null;
  if (MEMORY_TRIGGER.test(userMessage.content.trim())) {
    proposalId = newId("mpr");
    db.insert(memoryProposals)
      .values({ id: proposalId, workspaceId: input.workspaceId, employeeId: employee.id, taskId: userMessage.taskId, kind: /always|never|from now on|going forward|in future/i.test(userMessage.content) ? "preference" : "fact", content: userMessage.content.replace(/^(please )?(remember( that)?|note that)\s*/i, "").trim(), sourceRef: `conversation message ${input.messageId}`, status: "proposed", reviewedByUserId: null, reviewNote: null, createdAt: nowIso(), reviewedAt: null })
      .run();
  }

  const reply = proposalId ? `${result.text}\n\n_I have proposed this as a memory for review — it will only be kept once a manager approves it in Skills & Knowledge → Memory review._` : result.text;
  db.insert(messages)
    .values({ id: newId("msg"), workspaceId: input.workspaceId, employeeId: employee.id, taskId: userMessage.taskId, authorType: "employee", authorId: employee.id, content: reply, metadata: { inReplyTo: input.messageId, provider: result.provider, model: result.model, degraded: resolved.degraded, note: resolved.note, usage: result.usage, sources: snippets.map((s) => ({ id: s.sourceId, title: s.title })), proposalId }, createdAt: nowIso() })
    .run();
  recordAudit(db, { workspaceId: input.workspaceId, actorEmployeeId: employee.id, action: "employee.reply", entityType: "message", entityId: input.messageId, data: { provider: result.provider, model: result.model, memoryProposal: proposalId } });
}
