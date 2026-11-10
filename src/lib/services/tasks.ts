import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifacts, employees, taskEvents, tasks, type Task, type TaskStatus } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/authz";
import { enqueueJob } from "@/lib/jobs/queue";
import { WORKFLOWS, type WorkflowKey } from "@/lib/workflows/runner";
import { proposeAction } from "./approvals";
import { assertMeetingSourceEvidenceCurrent } from "./workflow-evidence";
import { startContentTask } from "./content";
import { summaryToMarkdown, type DraftStatusSummary } from "@/lib/workflows/weekly-summary";
import type { DraftActionList } from "@/lib/workflows/meeting-actions";

export function getTask(db: Db, workspaceId: string, taskId: string) {
  return db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)),
    with: {
      employee: true,
      department: true,
      owner: true,
      steps: { orderBy: (s, { asc }) => [asc(s.seq)] },
      events: { orderBy: (e, { desc }) => [desc(e.createdAt)] },
      artifacts: { orderBy: (a, { desc }) => [desc(a.createdAt)] },
      approvals: { orderBy: (a, { desc }) => [desc(a.requestedAt)] },
    },
  }).sync();
}

export function listTasks(db: Db, workspaceId: string) {
  return db.query.tasks.findMany({ where: eq(tasks.workspaceId, workspaceId), with: { employee: true, department: true, owner: true }, orderBy: [desc(tasks.updatedAt)] }).sync();
}

export function createTask(db: Db, input: { workspaceId: string; title: string; objective: string; employeeId?: string | null; departmentId?: string | null; ownerUserId?: string | null; requestedByUserId: string; priority?: Task["priority"]; dueAt?: string | null; status?: TaskStatus }): Task {
  const now = nowIso();
  const task: Task = {
    id: newId("tsk"),
    workspaceId: input.workspaceId,
    employeeId: input.employeeId ?? null,
    departmentId: input.departmentId ?? null,
    title: input.title,
    objective: input.objective,
    status: input.status ?? "queued",
    priority: input.priority ?? "normal",
    ownerUserId: input.ownerUserId ?? input.requestedByUserId,
    requestedByUserId: input.requestedByUserId,
    workflowKey: null,
    input: {},
    progressPct: 0,
    nextAction: input.employeeId ? "Waiting for the assigned employee to pick this up." : "Assign an owner or employee.",
    blockedReason: null,
    dueAt: input.dueAt ?? null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  db.insert(tasks).values(task).run();
  db.insert(taskEvents).values({ id: newId("tev"), workspaceId: input.workspaceId, taskId: task.id, actorType: "user", actorId: input.requestedByUserId, kind: "status_change", message: "Task created.", data: null, createdAt: now }).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.requestedByUserId, action: "task.create", entityType: "task", entityId: task.id });
  return task;
}

/** Creates a workflow-backed task and queues it for the worker. */
export function startWorkflowTask(db: Db, input: { workspaceId: string; employeeId: string; workflowKey: WorkflowKey; input: Record<string, unknown>; requestedByUserId: string; ownerUserId?: string | null; title?: string }): Task {
  if (input.workflowKey === "content_draft") return startContentTask(db, { ...input });
  const employee = db.select().from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.workspaceId, input.workspaceId))).get();
  if (!employee) throw new NotFoundError("Employee not found.");
  const wf = WORKFLOWS[input.workflowKey];
  const now = nowIso();
  const task: Task = {
    id: newId("tsk"),
    workspaceId: input.workspaceId,
    employeeId: employee.id,
    departmentId: employee.departmentId,
    title: input.title ?? wf.name,
    objective: wf.description,
    status: "queued",
    priority: "normal",
    ownerUserId: input.ownerUserId ?? employee.managerUserId ?? input.requestedByUserId,
    requestedByUserId: input.requestedByUserId,
    workflowKey: input.workflowKey,
    input: input.input,
    progressPct: 0,
    nextAction: "Queued for the AI employee.",
    blockedReason: null,
    dueAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  db.insert(tasks).values(task).run();
  db.insert(taskEvents).values({ id: newId("tev"), workspaceId: input.workspaceId, taskId: task.id, actorType: "user", actorId: input.requestedByUserId, kind: "status_change", message: `Workflow "${wf.name}" requested.`, data: { input: input.input }, createdAt: now }).run();
  enqueueJob(db, { workspaceId: input.workspaceId, kind: "task.run", payload: { taskId: task.id } });
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.requestedByUserId, action: "task.run_workflow", entityType: "task", entityId: task.id, data: { workflow: input.workflowKey } });
  return task;
}

export function setTaskStatus(db: Db, input: { workspaceId: string; taskId: string; status: TaskStatus; userId: string; reason?: string }) {
  const task = db.select().from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.workspaceId, input.workspaceId))).get();
  if (!task) throw new NotFoundError("Task not found.");
  if (task.workflowKey === "content_draft" && (input.status === "completed" || input.status === "queued")) throw new Error("Content drafts complete through human review. Use Generate revision to restart blocked work.");
  const now = nowIso();
  db.update(tasks)
    .set({
      status: input.status,
      updatedAt: now,
      completedAt: input.status === "completed" ? now : null,
      blockedReason: input.status === "blocked" ? input.reason ?? "Blocked by a human." : null,
      nextAction: input.status === "paused" ? "Paused by a human." : input.status === "queued" ? "Re-queued." : task.nextAction,
    })
    .where(eq(tasks.id, task.id))
    .run();
  db.insert(taskEvents).values({ id: newId("tev"), workspaceId: input.workspaceId, taskId: task.id, actorType: "user", actorId: input.userId, kind: "status_change", message: `Status set to ${input.status}${input.reason ? ` — ${input.reason}` : ""}.`, data: null, createdAt: now }).run();
  if (input.status === "queued" && task.workflowKey) enqueueJob(db, { workspaceId: input.workspaceId, kind: "task.run", payload: { taskId: task.id } });
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "task.status", entityType: "task", entityId: task.id, data: { status: input.status, reason: input.reason ?? null } });
}

export function addTaskComment(db: Db, input: { workspaceId: string; taskId: string; userId: string; message: string }) {
  db.insert(taskEvents).values({ id: newId("tev"), workspaceId: input.workspaceId, taskId: input.taskId, actorType: "user", actorId: input.userId, kind: "comment", message: input.message, data: { internal: true }, createdAt: nowIso() }).run();
}

/**
 * Turns a *reviewed* draft into a concrete external proposal. Enforces the rule that a reviewed
 * draft is not an authorization to send: this creates a brand-new approval with the exact payload.
 */
export function proposeFollowUp(db: Db, input: { workspaceId: string; taskId: string; artifactId: string; userId: string; kind: "create_external_tasks" | "send_message"; connectorKey: string; destination: string }) {
  const task = db.select().from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.workspaceId, input.workspaceId))).get();
  if (!task || !task.employeeId) throw new NotFoundError("Task or employee not found.");
  const artifact = db.select().from(artifacts).where(and(eq(artifacts.workspaceId, input.workspaceId), eq(artifacts.id, input.artifactId), eq(artifacts.taskId, task.id))).get();
  if (!artifact) throw new NotFoundError("Artifact not found.");
  if (artifact.kind === "content_draft") throw new Error("Content delivery is not enabled in this slice. Teams is the next integration.");
  if (artifact.status !== "reviewed") throw new Error("The draft must be reviewed by a human before an external action can be proposed from it.");

  if (artifact.kind === "draft_action_list") {
    assertMeetingSourceEvidenceCurrent(db, { workspaceId: input.workspaceId, employeeId: task.employeeId, sourceId: artifact.content.sourceId, evidence: artifact.content.sourceEvidence });
  }
  if (input.kind === "create_external_tasks" && artifact.kind !== "draft_action_list") throw new Error("Only a reviewed action list can be used to propose external tasks.");

  let payload: Record<string, unknown>;
  let title: string;
  if (input.kind === "create_external_tasks") {
    const draft = artifact.content as unknown as DraftActionList;
    const items = draft.items.map((i) => ({ title: i.title, owner: i.ownerStatus === "identified" ? i.proposedOwner : null, ownerStatus: i.ownerStatus, due: i.dueStatus === "stated" ? i.dueText : null, source: `${draft.sourceTitle} line ${i.sourceLine}` }));
    payload = { items, sourceArtifactId: artifact.id, sourceArtifactVersion: artifact.version };
    title = `Create ${items.length} task(s) in ${input.destination}`;
  } else {
    // Preserve the original draft message; internal provenance is not a request to send the full record.
    const messageContent = { ...artifact.content };
    delete messageContent.sourceEvidence;
    const text = artifact.kind === "draft_status_summary" ? summaryToMarkdown(artifact.content as unknown as DraftStatusSummary) : JSON.stringify(messageContent, null, 2);
    payload = { to: input.destination, text, sourceArtifactId: artifact.id, sourceArtifactVersion: artifact.version };
    title = `Post "${artifact.title}" to ${input.destination}`;
  }
  const { approval, created } = proposeAction(db, {
    workspaceId: input.workspaceId,
    taskId: task.id,
    employeeId: task.employeeId,
    artifactId: artifact.id,
    actionType: input.kind,
    title,
    destination: input.destination,
    connectorKey: input.connectorKey,
    payload,
    context: { proposedByUserId: input.userId, artifactTitle: artifact.title, note: "Executing this action happens only after an authorized manager approves it. Demo connectors simulate the result; nothing leaves the platform." },
  });
  return { approval, created };
}
