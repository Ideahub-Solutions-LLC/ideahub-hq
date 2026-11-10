import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvals, artifacts, departments, employeeKnowledge, employees, jobs, knowledgeSources, taskEvents, taskSteps, tasks, workflowRuns, workspaceMembers, workspaces, type Approval } from "@/db/schema";
import { assertCan, can, NotFoundError } from "@/lib/authz";
import { newId, nowIso, hashPayload, sha256 } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { enqueueJob } from "@/lib/jobs/queue";
import { listApprovedEmployeeSkills } from "./employee-development";
import { ContentBriefSchema, type ContentBrief, type ContentDraft, type ContentSource } from "@/lib/workflows/content-contract";

export class ContentBlocked extends Error {}
export { isContentEmployee } from "./content-role";
import { isContentEmployee } from "./content-role";

export function contentReadiness(db: Db, workspaceId: string, employeeId: string) {
  const employee = db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId))).get();
  if (!employee) throw new NotFoundError("Employee not found.");
  const manager = employee.managerUserId ? db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, employee.managerUserId))).get() : null;
  const skill = listApprovedEmployeeSkills(db, workspaceId, employeeId).find((s) => s.skill.workflowKey === "content_draft");
  const department = employee.departmentId ? db.select().from(departments).where(and(eq(departments.id, employee.departmentId), eq(departments.workspaceId, workspaceId))).get() : null;
  const sources = db.select({ source: knowledgeSources }).from(employeeKnowledge).innerJoin(knowledgeSources, and(eq(knowledgeSources.id, employeeKnowledge.knowledgeSourceId), eq(knowledgeSources.workspaceId, workspaceId))).where(and(eq(employeeKnowledge.employeeId, employeeId), eq(employeeKnowledge.workspaceId, workspaceId))).all().map((r) => r.source).filter((s) => s.reviewStatus === "approved" && s.content.trim() && s.sourceRef?.trim() && s.lastVerifiedAt);
  const problems: string[] = [];
  if (!isContentEmployee(employee.roleTitle) || department?.slug !== "marketing") problems.push("This workflow is for a Marketing Content Assistant in Marketing.");
  if (employee.status !== "active") problems.push(`Employee is ${employee.status}. Activate only after reviewing its configuration.`);
  if (!manager || !can(manager.role, "approval.decide")) problems.push("Assign a workspace manager, admin or owner as the accountable marketing reviewer.");
  if (!skill) problems.push("Assign an approved current skill with the Content brief → draft workflow.");
  if (!employee.authority.requireReviewForDrafts || !employee.authority.allowedActionTypes.includes("review_draft")) problems.push("Required draft review and review_draft authority must be enabled.");
  if (db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get()?.settings.emergencyStop) problems.push("Emergency stop is active.");
  if (!sources.length) problems.push("Assign current approved sources with source references and verification dates.");
  return { employee, manager, skill, sources, problems };
}

export function captureContentInputs(db: Db, workspaceId: string, employeeId: string, raw: unknown) {
  const brief = ContentBriefSchema.parse(raw);
  const ready = contentReadiness(db, workspaceId, employeeId);
  if (ready.problems.length) throw new ContentBlocked(ready.problems.join(" "));
  const ids = [...new Set(brief.sourceIds)];
  if (!ids.includes(brief.brandGuideId)) throw new ContentBlocked("Include the selected brand guide in the approved sources.");
  const sources: ContentSource[] = ids.map((id) => {
    const source = ready.sources.find((s) => s.id === id);
    if (!source) throw new ContentBlocked("A selected source is missing, unapproved, unverified or not granted to this employee.");
    return { id: source.id, title: source.title, version: source.version, hash: sha256(source.content), content: source.content, sourceRef: source.sourceRef!, verifiedAt: source.lastVerifiedAt! };
  });
  if (sources.reduce((n, s) => n + s.content.length, 0) > 50000) throw new ContentBlocked("Select at most 50,000 characters of source material for this brief.");
  return { ...ready, brief, sources, skill: ready.skill! };
}

export function assertContentEvidence(db: Db, workspaceId: string, employeeId: string, draft: ContentDraft) {
  if (draft.kind !== "content_draft" || !Array.isArray(draft.sources) || !draft.skill) throw new ContentBlocked("Content evidence is missing; generate a new draft.");
  const current = captureContentInputs(db, workspaceId, employeeId, draft.brief);
  if (current.employee.configVersion !== draft.employeeConfigVersion || current.skill.skill.id !== draft.skill.id || current.skill.version.version !== draft.skill.version || hashPayload(current.skill.version) !== draft.skill.hash || hashPayload(current.sources) !== hashPayload(draft.sources)) throw new ContentBlocked("Employee, skill or source evidence changed. Generate and review a new draft.");
}

export function startContentTask(db: Db, input: { workspaceId: string; employeeId: string; requestedByUserId: string; input: unknown; submissionKey?: string }) {
  return db.transaction((tx) => {
    const actor = tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, input.requestedByUserId))).get();
    assertCan(actor?.role, "task.run_workflow");
    const ready = captureContentInputs(tx, input.workspaceId, input.employeeId, input.input);
    const now = nowIso();
    if (input.submissionKey && !/^[a-zA-Z0-9_-]{8,80}$/.test(input.submissionKey)) throw new ContentBlocked("Invalid brief submission key.");
    const taskId = input.submissionKey ? `tsk_${sha256(`${input.workspaceId}:${input.requestedByUserId}:${input.submissionKey}`).slice(0, 20)}` : newId("tsk");
    const previous = tx.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, input.workspaceId))).get();
    if (previous) {
      if (previous.employeeId !== input.employeeId || hashPayload(previous.input) !== hashPayload(ready.brief)) throw new ContentBlocked("This brief submission was already used. Open a new form for a different brief.");
      return previous;
    }
    const task = { id: taskId, workspaceId: input.workspaceId, employeeId: input.employeeId, departmentId: ready.employee.departmentId, title: ready.brief.title, objective: ready.brief.objective, status: "queued" as const, priority: "normal" as const, ownerUserId: ready.employee.managerUserId, requestedByUserId: input.requestedByUserId, workflowKey: "content_draft", input: ready.brief as unknown as Record<string, unknown>, progressPct: 0, nextAction: "Brief queued for the content worker.", blockedReason: null, dueAt: null, createdAt: now, updatedAt: now, completedAt: null };
    tx.insert(tasks).values(task).run();
    enqueueJob(tx, { workspaceId: input.workspaceId, kind: "task.run", payload: { taskId: task.id }, maxAttempts: 1 });
    tx.insert(taskEvents).values({ id: newId("tev"), workspaceId: input.workspaceId, taskId: task.id, actorType: "user", actorId: input.requestedByUserId, kind: "status_change", message: "Content brief submitted. Draft and review only; nothing is sent.", createdAt: now }).run();
    recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.requestedByUserId, action: "content.brief", entityType: "task", entityId: task.id });
    return task;
  }, { behavior: "immediate" });
}

export function assertContentReview(db: Db, approval: Approval, userId: string, accepting: boolean) {
  const artifact = approval.artifactId ? db.select().from(artifacts).where(and(eq(artifacts.id, approval.artifactId), eq(artifacts.workspaceId, approval.workspaceId))).get() : null;
  if (artifact?.kind !== "content_draft") return;
  const task = db.select().from(tasks).where(and(eq(tasks.id, approval.taskId ?? ""), eq(tasks.workspaceId, approval.workspaceId))).get();
  const reviewer = db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, approval.workspaceId), eq(workspaceMembers.userId, userId))).get();
  if (!task || task.employeeId !== approval.employeeId || artifact.taskId !== task.id || artifact.employeeId !== task.employeeId || artifact.status !== "draft" || approval.payload.artifactVersion !== artifact.version || approval.payload.contentHash !== hashPayload(artifact.content)) throw new ContentBlocked("This review no longer matches the current draft version.");
  if (!reviewer || !can(reviewer.role, "approval.decide") || (task.ownerUserId !== userId && reviewer.role !== "owner" && reviewer.role !== "admin")) throw new ContentBlocked("The assigned reviewer, owner or admin must review this draft.");
  if (accepting) {
    const draft = artifact.content as unknown as ContentDraft;
    assertContentEvidence(db, approval.workspaceId, task.employeeId!, draft);
    if (draft.checks.some((c) => !c.supported)) throw new ContentBlocked("Fix unsupported claim citations before accepting this draft.");
  }
}

export function reviseContentTask(db: Db, input: { workspaceId: string; taskId: string; userId: string; note: string }) {
  return db.transaction((tx) => {
    const task = tx.select().from(tasks).where(and(eq(tasks.id, input.taskId), eq(tasks.workspaceId, input.workspaceId))).get();
    const actor = tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, input.userId))).get();
    assertCan(actor?.role, "task.run_workflow");
    if (!task?.employeeId || task.workflowKey !== "content_draft" || !(["blocked", "paused"].includes(task.status))) throw new ContentBlocked("Request changes or resolve a blocked run before generating a revision.");
    if (actor?.role !== "owner" && actor?.role !== "admin" && input.userId !== task.ownerUserId && input.userId !== task.requestedByUserId) throw new ContentBlocked("Only this brief's requester, reviewer, owner or admin can revise it.");
    const brief: ContentBrief = ContentBriefSchema.parse({ ...task.input, revisionNote: input.note });
    if (!brief.revisionNote.trim()) throw new ContentBlocked("Describe the changes or resolved blocker first.");
    captureContentInputs(tx, input.workspaceId, task.employeeId, brief);
    const pending = tx.select().from(approvals).where(and(eq(approvals.taskId, task.id), eq(approvals.workspaceId, input.workspaceId), eq(approvals.status, "pending"))).get();
    if (pending) throw new ContentBlocked("Decide the current draft before generating another version.");
    // Revoke old leases before requeueing: a paused provider call may still return.
    // Keep uncertain cost reservations until the provider charge is reconciled.
    const stamp = nowIso();
    for (const job of tx.select().from(jobs).where(and(eq(jobs.workspaceId, input.workspaceId), eq(jobs.kind, "task.run"))).all()) {
      if (job.payload.taskId !== task.id || !["queued", "running"].includes(job.status)) continue;
      tx.update(jobs).set({ status: "cancelled", lockedAt: null, lockedBy: null, lastError: "Superseded by a reviewed revision request.", updatedAt: stamp }).where(eq(jobs.id, job.id)).run();
      tx.update(workflowRuns).set({ status: "failed", stage: "failed", error: "Superseded by a revision request.", finishedAt: stamp }).where(and(eq(workflowRuns.jobId, job.id), eq(workflowRuns.status, "running"))).run();
    }
    tx.update(taskSteps).set({ status: "failed", finishedAt: stamp }).where(and(eq(taskSteps.taskId, task.id), eq(taskSteps.workspaceId, input.workspaceId), eq(taskSteps.status, "running"))).run();
    tx.update(artifacts).set({ status: "superseded" }).where(and(eq(artifacts.taskId, task.id), eq(artifacts.workspaceId, input.workspaceId))).run();
    tx.update(approvals).set({ status: "expired" }).where(and(eq(approvals.taskId, task.id), eq(approvals.workspaceId, input.workspaceId), eq(approvals.status, "changes_requested"))).run();
    tx.update(tasks).set({ input: brief as unknown as Record<string, unknown>, status: "queued", blockedReason: null, nextAction: "Revision queued for the content worker.", updatedAt: nowIso() }).where(eq(tasks.id, task.id)).run();
    enqueueJob(tx, { workspaceId: input.workspaceId, kind: "task.run", payload: { taskId: task.id }, maxAttempts: 1 });
    tx.insert(taskEvents).values({ id: newId("tev"), workspaceId: input.workspaceId, taskId: task.id, actorType: "user", actorId: input.userId, kind: "revision", message: `Revision requested: ${brief.revisionNote}`, createdAt: nowIso() }).run();
    recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "content.revision", entityType: "task", entityId: task.id });
  }, { behavior: "immediate" });
}

export function latestContentDraft(db: Db, workspaceId: string, taskId: string) {
  return db.select().from(artifacts).where(and(eq(artifacts.workspaceId, workspaceId), eq(artifacts.taskId, taskId), eq(artifacts.kind, "content_draft"))).orderBy(desc(artifacts.version)).get();
}
