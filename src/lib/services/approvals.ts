import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  actionReceipts,
  approvals,
  artifacts,
  communicationEvents,
  connectorGrants,
  connectors,
  employees,
  taskEvents,
  tasks,
  workspaces,
  type ActionType,
  type Approval,
  type WorkspaceRole,
} from "@/db/schema";
import { hashPayload, newId, nowIso, sha256 } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { assertCan, AuthorizationError, NotFoundError } from "@/lib/authz";
import { effectiveConnectorMode, getConnectorAdapter } from "@/lib/connectors";
import { recordUsage } from "./usage";
import { assertContentReview } from "./content";
import { assertMeetingSourceEvidenceCurrent } from "./workflow-evidence";

/**
 * Approval engine.
 *
 * Invariants (covered by tests/approvals.test.ts):
 *  1. An employee can only propose action types listed in its authority policy, and only to
 *     connectors it has an active grant for. Personality/prompt content cannot change this.
 *  2. An approval is bound to the exact payload hash. Executing with a changed payload fails.
 *  3. `review_draft` approvals never execute a connector — accepting a draft ≠ sending it.
 *  4. Execution is idempotent: one receipt per idempotency key, duplicates return the receipt.
 *  5. Nothing executes while the workspace emergency stop is on or the employee is paused.
 */

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

export type ProposeInput = {
  workspaceId: string;
  taskId: string | null;
  employeeId: string;
  artifactId?: string | null;
  actionType: ActionType;
  title: string;
  destination: string;
  connectorKey?: string | null;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  expiresInHours?: number;
};

export function proposeAction(db: Db, input: ProposeInput): { approval: Approval; created: boolean } {
  const employee = db.select().from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.workspaceId, input.workspaceId))).get();
  if (!employee) throw new NotFoundError("Employee not found in this workspace.");
  if (employee.status !== "active") throw new ApprovalError(`Employee ${employee.name} is ${employee.status}; it cannot propose actions.`);
  if (!employee.authority.allowedActionTypes.includes(input.actionType)) {
    throw new AuthorizationError(`Employee ${employee.name} is not authorized to propose "${input.actionType}".`);
  }

  if (input.connectorKey) {
    const connector = db.select().from(connectors).where(and(eq(connectors.workspaceId, input.workspaceId), eq(connectors.key, input.connectorKey))).get();
    if (!connector) throw new NotFoundError(`Connector ${input.connectorKey} is not set up in this workspace.`);
    const grant = db
      .select()
      .from(connectorGrants)
      .where(and(eq(connectorGrants.connectorId, connector.id), eq(connectorGrants.employeeId, employee.id), eq(connectorGrants.status, "active")))
      .get();
    if (!grant) throw new AuthorizationError(`Employee ${employee.name} has no active grant for connector ${connector.name}.`);
    const adapter = getConnectorAdapter(input.connectorKey);
    if (!adapter || !adapter.supportedActions.includes(input.actionType)) {
      throw new ApprovalError(`Connector ${connector.name} does not support "${input.actionType}".`);
    }
    const eff = effectiveConnectorMode(connector.key, connector.mode);
    if (eff.mode === "planned" || eff.mode === "disconnected") {
      throw new ApprovalError(`Connector ${connector.name} is ${eff.mode}; actions cannot be proposed to it.`);
    }
  }

  if (input.artifactId && input.actionType !== "review_draft") {
    const bound = db.select().from(artifacts).where(and(eq(artifacts.id, input.artifactId), eq(artifacts.workspaceId, input.workspaceId))).get();
    if (bound?.kind === "content_draft") throw new ApprovalError("Content delivery is not enabled yet.");
  }
  const payloadHash = hashPayload(input.payload);
  const idempotencyKey = sha256(`${input.workspaceId}|${input.taskId ?? "no-task"}|${input.actionType}|${input.destination}|${payloadHash}`);
  const existing = db.select().from(approvals).where(eq(approvals.idempotencyKey, idempotencyKey)).get();
  if (existing) return { approval: existing, created: false };

  const now = nowIso();
  const approval: Approval = {
    id: newId("apr"),
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    employeeId: employee.id,
    artifactId: input.artifactId ?? null,
    actionType: input.actionType,
    title: input.title,
    destination: input.destination,
    connectorKey: input.connectorKey ?? null,
    payload: input.payload,
    payloadHash,
    context: input.context,
    status: "pending",
    requestedByEmployeeId: employee.id,
    decidedByUserId: null,
    decisionNote: null,
    idempotencyKey,
    expiresAt: new Date(Date.now() + (input.expiresInHours ?? 72) * 3600_000).toISOString(),
    requestedAt: now,
    decidedAt: null,
    executedAt: null,
  };
  db.insert(approvals).values(approval).run();

  if (input.taskId) {
    db.update(tasks).set({ status: "needs_approval", updatedAt: now, nextAction: `Human decision needed: ${input.title}` }).where(eq(tasks.id, input.taskId)).run();
    db.insert(taskEvents)
      .values({ id: newId("tev"), workspaceId: input.workspaceId, taskId: input.taskId, actorType: "employee", actorId: employee.id, kind: "approval", message: `Proposed: ${input.title}`, data: { approvalId: approval.id, actionType: input.actionType, destination: input.destination }, createdAt: now })
      .run();
  }
  recordAudit(db, { workspaceId: input.workspaceId, actorEmployeeId: employee.id, action: "approval.propose", entityType: "approval", entityId: approval.id, data: { actionType: input.actionType, destination: input.destination, payloadHash } });
  return { approval, created: true };
}

export type Decision = "approve" | "reject" | "changes_requested";

export function decideApproval(db: Db, input: Parameters<typeof decideApprovalInternal>[1]): Approval {
  return db.transaction((tx) => decideApprovalInternal(tx, input), { behavior: "immediate" });
}

function decideApprovalInternal(db: Db, input: { workspaceId: string; approvalId: string; userId: string; role: WorkspaceRole; decision: Decision; note?: string }): Approval {
  assertCan(input.role, "approval.decide");
  const approval = db.select().from(approvals).where(and(eq(approvals.id, input.approvalId), eq(approvals.workspaceId, input.workspaceId))).get();
  if (!approval) throw new NotFoundError("Approval not found.");
  if (approval.status !== "pending" && approval.status !== "changes_requested") {
    throw new ApprovalError(`Approval is already ${approval.status}.`);
  }
  if (approval.expiresAt && approval.expiresAt < nowIso()) {
    db.update(approvals).set({ status: "expired" }).where(eq(approvals.id, approval.id)).run();
    throw new ApprovalError("This approval has expired. Ask the employee to propose the action again.");
  }
  // Tamper check: the stored payload must still match the hash the request was bound to.
  if (hashPayload(approval.payload) !== approval.payloadHash) {
    throw new ApprovalError("Payload hash mismatch — the proposed action changed after it was requested. A new approval is required.");
  }

  assertContentReview(db, approval, input.userId, input.decision === "approve");
  const now = nowIso();
  const status = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "changes_requested";
  db.update(approvals).set({ status, decidedByUserId: input.userId, decidedAt: now, decisionNote: input.note ?? null }).where(eq(approvals.id, approval.id)).run();

  if (approval.artifactId && approval.actionType === "review_draft") {
    db.update(artifacts)
      .set({ status: input.decision === "approve" ? "reviewed" : input.decision === "reject" ? "rejected" : "draft", reviewedByUserId: input.userId, reviewNote: input.note ?? null, updatedAt: now })
      .where(eq(artifacts.id, approval.artifactId))
      .run();
  }

  if (approval.taskId) {
    const task = db.select().from(tasks).where(eq(tasks.id, approval.taskId)).get();
    if (task) {
      let nextStatus = task.status;
      let nextAction: string | null = task.nextAction;
      if (input.decision === "approve" && approval.actionType === "review_draft") {
        nextStatus = "completed";
        nextAction = task.workflowKey === "content_draft" ? "Content draft reviewed. Nothing was published or sent." : "Draft reviewed. Propose follow-up actions from the task page if needed.";
      } else if (input.decision === "approve") {
        nextStatus = "working";
        nextAction = "Approved — executing via connector.";
      } else if (input.decision === "reject") {
        nextStatus = "blocked";
        nextAction = "Proposal rejected. A human must decide how to proceed.";
      } else {
        nextStatus = "blocked";
        nextAction = `Changes requested: ${input.note ?? "see approval"}`;
      }
      db.update(tasks)
        .set({ status: nextStatus, nextAction, updatedAt: now, completedAt: nextStatus === "completed" ? now : task.completedAt, blockedReason: nextStatus === "blocked" ? `Approval ${status}: ${input.note ?? approval.title}` : null })
        .where(eq(tasks.id, task.id))
        .run();
      db.insert(taskEvents)
        .values({ id: newId("tev"), workspaceId: input.workspaceId, taskId: task.id, actorType: "user", actorId: input.userId, kind: "approval", message: `${labelDecision(input.decision)}: ${approval.title}${input.note ? ` — ${input.note}` : ""}`, data: { approvalId: approval.id, status }, createdAt: now })
        .run();
    }
  }
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: `approval.${input.decision}`, entityType: "approval", entityId: approval.id, data: { actionType: approval.actionType, note: input.note ?? null } });
  return { ...approval, status, decidedByUserId: input.userId, decidedAt: now, decisionNote: input.note ?? null };
}

function labelDecision(d: Decision) {
  return d === "approve" ? "Approved" : d === "reject" ? "Rejected" : "Changes requested";
}

export type ExecutionOutcome = {
  approval: Approval;
  receipt: typeof actionReceipts.$inferSelect | null;
  skipped: string | null;
};

/** Check only before a new connector call, never before receipt lookup/reconciliation. */
function assertFollowUpEvidence(db: Db, approval: Approval) {
  if (!approval.artifactId) {
    if (approval.payload.sourceArtifactId) throw new ApprovalError("The follow-up no longer has its bound artifact. Create a new proposal from a reviewed draft.");
    return;
  }
  const artifact = db.select().from(artifacts).where(and(eq(artifacts.id, approval.artifactId), eq(artifacts.workspaceId, approval.workspaceId))).get();
  const task = approval.taskId ? db.select().from(tasks).where(and(eq(tasks.id, approval.taskId), eq(tasks.workspaceId, approval.workspaceId))).get() : null;
  if (!artifact || !task || !approval.employeeId || artifact.employeeId !== approval.employeeId || task.employeeId !== approval.employeeId || artifact.taskId !== task.id) {
    throw new ApprovalError("The follow-up artifact, task or employee no longer matches this approval. Create a new proposal from a reviewed draft.");
  }
  if (artifact.status !== "reviewed" || approval.payload.sourceArtifactId !== artifact.id || approval.payload.sourceArtifactVersion !== artifact.version) {
    throw new ApprovalError("The follow-up draft is no longer reviewed or its version changed. Review the current draft and create a new proposal.");
  }
  if (artifact.kind === "draft_action_list" || task.workflowKey === "meeting_actions") {
    if (artifact.kind !== "draft_action_list") throw new ApprovalError("The meeting draft type changed. Rerun the meeting workflow and review a new draft.");
    try {
      assertMeetingSourceEvidenceCurrent(db, { workspaceId: approval.workspaceId, employeeId: approval.employeeId, sourceId: artifact.content.sourceId, evidence: artifact.content.sourceEvidence });
    } catch (err) {
      throw new ApprovalError((err as Error).message);
    }
  }
}

/**
 * Executes an approved action exactly once. Safe to call repeatedly: a second call returns
 * the existing receipt. Called by the worker (job kind "approval.execute") and by server actions.
 */
export async function executeApproval(db: Db, input: { workspaceId: string; approvalId: string; actorUserId?: string | null }): Promise<ExecutionOutcome> {
  const approval = db.select().from(approvals).where(and(eq(approvals.id, input.approvalId), eq(approvals.workspaceId, input.workspaceId))).get();
  if (!approval) throw new NotFoundError("Approval not found.");

  // Draft reviews never touch a connector.
  if (approval.actionType === "review_draft") {
    return { approval, receipt: null, skipped: "review_draft approvals are acknowledgements only; nothing is executed." };
  }
  if (approval.status === "executed") {
    const receipt = db.select().from(actionReceipts).where(eq(actionReceipts.approvalId, approval.id)).get() ?? null;
    return { approval, receipt, skipped: "Already executed." };
  }
  if (approval.status !== "approved" && approval.status !== "execution_unknown") {
    throw new ApprovalError(`Cannot execute an approval with status "${approval.status}".`);
  }
  if (hashPayload(approval.payload) !== approval.payloadHash) {
    throw new ApprovalError("Payload hash mismatch — refusing to execute a changed action.");
  }
  const workspace = db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).get();
  if (workspace?.settings.emergencyStop) throw new ApprovalError("Emergency stop is active for this workspace. Execution is paused.");
  const employee = approval.employeeId ? db.select().from(employees).where(eq(employees.id, approval.employeeId)).get() : null;
  if (employee && employee.status !== "active") throw new ApprovalError(`Employee ${employee.name} is ${employee.status}; execution is paused.`);
  if (!approval.connectorKey) throw new ApprovalError("This action has no connector to execute against.");

  const connector = db.select().from(connectors).where(and(eq(connectors.workspaceId, input.workspaceId), eq(connectors.key, approval.connectorKey))).get();
  if (!connector) throw new NotFoundError("Connector not found.");
  if (employee) {
    const grant = db.select().from(connectorGrants).where(and(eq(connectorGrants.connectorId, connector.id), eq(connectorGrants.employeeId, employee.id), eq(connectorGrants.status, "active"))).get();
    if (!grant) throw new AuthorizationError(`Grant for ${connector.name} was revoked; refusing to execute.`);
  }
  const adapter = getConnectorAdapter(connector.key);
  if (!adapter) throw new ApprovalError("No adapter for connector.");
  const eff = effectiveConnectorMode(connector.key, connector.mode);
  if (eff.mode !== "demo" && eff.mode !== "live") throw new ApprovalError(`Connector ${connector.name} is ${eff.mode}: ${eff.detail}`);

  const now = nowIso();
  // Idempotency: exactly one receipt per key. A concurrent/duplicate call sees the existing row.
  let receipt = db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, approval.idempotencyKey)).get() ?? null;
  if (receipt) {
    if (receipt.status === "succeeded") return { approval, receipt, skipped: "Duplicate execution prevented: a receipt already exists." };
    if (receipt.status === "executing") return { approval, receipt, skipped: "Execution already in progress." };
    if (receipt.status === "unknown") {
      // Timeout/unknown outcome: reconcile with the destination before retrying.
      const r = await adapter.reconcile(approval.idempotencyKey, eff.mode);
      if (r === "done") {
        db.update(actionReceipts).set({ status: "succeeded", updatedAt: nowIso(), result: { ...(receipt.result ?? {}), reconciled: true } }).where(eq(actionReceipts.id, receipt.id)).run();
        db.update(approvals).set({ status: "executed", executedAt: nowIso() }).where(eq(approvals.id, approval.id)).run();
        receipt = db.select().from(actionReceipts).where(eq(actionReceipts.id, receipt.id)).get()!;
        return { approval: { ...approval, status: "executed" }, receipt, skipped: "Reconciled: the destination already recorded this action, so it was not re-run." };
      }
      if (r === "unknown") {
        return { approval, receipt, skipped: "Outcome still unknown; manual reconciliation required before retry." };
      }
      // not_found → safe to retry below using the same receipt row
    }
  }
  // A changed source cannot authorize a fresh call or retry. Completed/unknown
  // receipt reconciliation above remains available even when evidence is stale.
  assertFollowUpEvidence(db, approval);
  if (!receipt) {
    receipt = {
      id: newId("rcp"),
      workspaceId: input.workspaceId,
      approvalId: approval.id,
      idempotencyKey: approval.idempotencyKey,
      connectorKey: connector.key,
      mode: eff.mode,
      status: "executing",
      externalRef: null,
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      db.insert(actionReceipts).values(receipt).run();
    } catch {
      const existing = db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, approval.idempotencyKey)).get()!;
      return { approval, receipt: existing, skipped: "Duplicate execution prevented (concurrent request)." };
    }
  }

  try {
    const result = await adapter.execute(
      { workspaceId: input.workspaceId, approvalId: approval.id, idempotencyKey: approval.idempotencyKey, actionType: approval.actionType, destination: approval.destination, payload: approval.payload },
      eff.mode,
    );
    const done = nowIso();
    db.update(actionReceipts).set({ status: "succeeded", externalRef: result.externalRef, result: { ...result.result, simulated: result.simulated, summary: result.summary }, updatedAt: done }).where(eq(actionReceipts.id, receipt.id)).run();
    db.update(approvals).set({ status: "executed", executedAt: done }).where(eq(approvals.id, approval.id)).run();

    if (approval.actionType === "send_message") {
      db.insert(communicationEvents)
        .values({
          id: newId("com"),
          workspaceId: input.workspaceId,
          connectorKey: connector.key,
          employeeId: approval.employeeId,
          taskId: approval.taskId,
          approvalId: approval.id,
          direction: "outbound",
          channel: approval.destination,
          counterpart: String(approval.payload.to ?? approval.destination),
          subject: approval.payload.subject ? String(approval.payload.subject) : null,
          body: String(approval.payload.text ?? approval.payload.body ?? ""),
          status: result.simulated ? "simulated" : "sent",
          createdAt: done,
        })
        .run();
    }
    recordUsage(db, { workspaceId: input.workspaceId, employeeId: approval.employeeId, taskId: approval.taskId, provider: "demo", model: `connector:${connector.key}`, meter: "connector_call", inputUnits: 1, outputUnits: 0, unit: "calls", eventKey: `connector:${approval.idempotencyKey}` });
    if (approval.taskId) {
      db.update(tasks).set({ status: "completed", completedAt: done, updatedAt: done, nextAction: null, progressPct: 100 }).where(eq(tasks.id, approval.taskId)).run();
      db.insert(taskEvents)
        .values({ id: newId("tev"), workspaceId: input.workspaceId, taskId: approval.taskId, actorType: "system", actorId: null, kind: "receipt", message: `${result.simulated ? "Simulated execution" : "Executed"}: ${approval.title} → ${result.externalRef}. ${result.summary}`, data: { receiptId: receipt.id, externalRef: result.externalRef, simulated: result.simulated }, createdAt: done })
        .run();
    }
    recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId ?? null, actorEmployeeId: approval.employeeId, action: "approval.execute", entityType: "approval", entityId: approval.id, data: { connector: connector.key, mode: eff.mode, externalRef: result.externalRef, simulated: result.simulated } });
    const updated = db.select().from(actionReceipts).where(eq(actionReceipts.id, receipt.id)).get()!;
    return { approval: { ...approval, status: "executed", executedAt: done }, receipt: updated, skipped: null };
  } catch (err) {
    const message = (err as Error).message;
    const timeout = /timeout|timed out|unknown/i.test(message);
    db.update(actionReceipts).set({ status: timeout ? "unknown" : "failed", result: { error: message }, updatedAt: nowIso() }).where(eq(actionReceipts.id, receipt.id)).run();
    db.update(approvals).set({ status: timeout ? "execution_unknown" : "execution_failed" }).where(eq(approvals.id, approval.id)).run();
    if (approval.taskId) {
      db.update(tasks).set({ status: "blocked", blockedReason: `Execution ${timeout ? "outcome unknown" : "failed"}: ${message}`, updatedAt: nowIso() }).where(eq(tasks.id, approval.taskId)).run();
      db.insert(taskEvents).values({ id: newId("tev"), workspaceId: input.workspaceId, taskId: approval.taskId, actorType: "system", actorId: null, kind: "error", message: `Execution ${timeout ? "outcome unknown" : "failed"}: ${message}`, data: { receiptId: receipt.id }, createdAt: nowIso() }).run();
    }
    throw err;
  }
}

export function listPendingApprovals(db: Db, workspaceId: string) {
  return db.query.approvals.findMany({
    where: and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "pending")),
    with: { employee: true, task: true },
    orderBy: (a, { desc }) => [desc(a.requestedAt)],
  }).sync();
}
