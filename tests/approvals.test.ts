import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { buildFixture, freshDb } from "./fixture";
import { ApprovalError, decideApproval, executeApproval, proposeAction } from "@/lib/services/approvals";
import { AuthorizationError } from "@/lib/authz";
import { actionReceipts, approvals, artifacts, communicationEvents, employees, workspaces } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { setEmergencyStop, revokeGrant } from "@/lib/services/admin";
import { proposeFollowUp } from "@/lib/services/tasks";
import { startWorkflowTask } from "@/lib/services/tasks";
import { runTaskWorkflow } from "@/lib/workflows/runner";

describe("proposal guardrails", () => {
  it("rejects action types outside the employee's authority policy (personality cannot widen it)", () => {
    const db = freshDb();
    const f = buildFixture(db, { allowed: ["review_draft"] });
    expect(() => proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message", title: "x", destination: "slack:#ops", connectorKey: "slack", payload: { text: "hi" }, context: {} })).toThrow(AuthorizationError);
  });

  it("requires an active connector grant and a usable connector mode", () => {
    const db = freshDb();
    const f = buildFixture(db);
    // teams is planned → not usable even with a grant; email is disconnected and has no grant
    expect(() => proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message", title: "x", destination: "email:x", connectorKey: "email", payload: {}, context: {} })).toThrow(AuthorizationError);
    revokeGrant(db, { workspaceId: f.workspaceId, actorUserId: f.owner, grantId: f.grantSlack });
    expect(() => proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message", title: "x", destination: "slack:#ops", connectorKey: "slack", payload: { text: "hi" }, context: {} })).toThrow(AuthorizationError);
  });

  it("deduplicates identical proposals by idempotency key", () => {
    const db = freshDb();
    const f = buildFixture(db);
    const input = { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message" as const, title: "x", destination: "slack:#ops", connectorKey: "slack", payload: { text: "same" }, context: {} };
    const first = proposeAction(db, input);
    const second = proposeAction(db, input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.approval.id).toBe(first.approval.id);
  });

  it("paused employees cannot propose", () => {
    const db = freshDb();
    const f = buildFixture(db);
    db.update(employees).set({ status: "paused" }).where(eq(employees.id, f.employeeId)).run();
    expect(() => proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "review_draft", title: "x", destination: "internal:review", payload: {}, context: {} })).toThrow(ApprovalError);
  });
});

describe("approval enforcement", () => {
  it("executing an undecided approval fails; rejecting never executes", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    const { approval } = proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message", title: "x", destination: "slack:#ops", connectorKey: "slack", payload: { text: "hi" }, context: {} });
    await expect(executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id })).rejects.toThrow(ApprovalError);
    decideApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id, userId: f.manager, role: "manager", decision: "reject", note: "no" });
    await expect(executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id })).rejects.toThrow(ApprovalError);
    expect(db.select().from(actionReceipts).all()).toHaveLength(0);
    expect(db.select().from(communicationEvents).all()).toHaveLength(0);
  });

  it("binds the approval to the exact payload: a tampered payload cannot be approved or executed", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    const { approval } = proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message", title: "x", destination: "slack:#ops", connectorKey: "slack", payload: { text: "original" }, context: {} });
    db.update(approvals).set({ payload: { text: "changed after the fact" } }).where(eq(approvals.id, approval.id)).run();
    expect(() => decideApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id, userId: f.manager, role: "manager", decision: "approve" })).toThrow(/hash mismatch/);
    db.update(approvals).set({ status: "approved" }).where(eq(approvals.id, approval.id)).run();
    await expect(executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id })).rejects.toThrow(/hash mismatch/);
  });

  it("approving a draft review never touches a connector or sends anything", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    const artifactId = newId("art");
    db.insert(artifacts).values({ id: artifactId, workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, kind: "note", title: "Draft", content: { text: "draft" }, version: 1, status: "draft", reviewedByUserId: null, reviewNote: null, createdAt: nowIso(), updatedAt: nowIso() }).run();
    const { approval } = proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, artifactId, actionType: "review_draft", title: "Review", destination: "internal:review", payload: { artifactId }, context: {} });
    decideApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id, userId: f.manager, role: "manager", decision: "approve" });
    const outcome = await executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id });
    expect(outcome.receipt).toBeNull();
    expect(outcome.skipped).toMatch(/acknowledgements only/);
    expect(db.select().from(actionReceipts).all()).toHaveLength(0);
    expect(db.select().from(communicationEvents).all()).toHaveLength(0);
    expect(db.select().from(artifacts).where(eq(artifacts.id, artifactId)).get()?.status).toBe("reviewed");
  });

  it("a reviewed draft cannot be sent without a brand-new approval, and an unreviewed draft cannot be proposed at all", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    const task = startWorkflowTask(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, workflowKey: "meeting_actions", input: { sourceId: f.sourceId }, requestedByUserId: f.manager });
    await runTaskWorkflow(db, task.id);
    const artifact = db.select().from(artifacts).where(eq(artifacts.taskId, task.id)).get()!;
    expect(artifact.status).toBe("draft");
    expect(() => proposeFollowUp(db, { workspaceId: f.workspaceId, taskId: task.id, artifactId: artifact.id, userId: f.manager, kind: "create_external_tasks", connectorKey: "task_system", destination: "connector:task_system" })).toThrow(/reviewed by a human/);
    const review = db.select().from(approvals).where(eq(approvals.taskId, task.id)).get()!;
    decideApproval(db, { workspaceId: f.workspaceId, approvalId: review.id, userId: f.manager, role: "manager", decision: "approve" });
    const { approval: followUp, created } = proposeFollowUp(db, { workspaceId: f.workspaceId, taskId: task.id, artifactId: artifact.id, userId: f.manager, kind: "create_external_tasks", connectorKey: "task_system", destination: "connector:task_system" });
    expect(created).toBe(true);
    expect(followUp.status).toBe("pending"); // the draft review did NOT authorize creation
    expect(db.select().from(actionReceipts).all()).toHaveLength(0);
    // Unverified / missing owners are never passed through as assignees
    const items = followUp.payload.items as { owner: string | null; ownerStatus: string }[];
    expect(items.some((i) => i.ownerStatus === "missing" && i.owner === null)).toBe(true);
    expect(items.some((i) => i.ownerStatus === "unverified" && i.owner === null)).toBe(true);
  });
});

describe("duplicate-action prevention", () => {
  it("executes exactly once; repeated execution returns the same receipt", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    const { approval } = proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message", title: "x", destination: "slack:#ops", connectorKey: "slack", payload: { text: "hello" }, context: {} });
    decideApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id, userId: f.manager, role: "manager", decision: "approve" });
    const first = await executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id });
    const second = await executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id });
    const third = await executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id });
    expect(first.receipt?.status).toBe("succeeded");
    expect(second.skipped).toMatch(/Already executed|Duplicate/);
    expect(third.receipt?.id).toBe(first.receipt?.id);
    expect(db.select().from(actionReceipts).all()).toHaveLength(1);
    const comms = db.select().from(communicationEvents).all();
    expect(comms).toHaveLength(1);
    expect(comms[0].status).toBe("simulated"); // demo connector never reports "sent"
  });

  it("reconciles an unknown outcome instead of blindly retrying", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    const { approval } = proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message", title: "x", destination: "slack:#ops", connectorKey: "slack", payload: { text: "hello" }, context: {} });
    decideApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id, userId: f.manager, role: "manager", decision: "approve" });
    const first = await executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id });
    // Simulate a timeout after the destination accepted the action: receipt unknown, approval execution_unknown
    db.update(actionReceipts).set({ status: "unknown" }).where(eq(actionReceipts.id, first.receipt!.id)).run();
    db.update(approvals).set({ status: "execution_unknown" }).where(eq(approvals.id, approval.id)).run();
    const retry = await executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id });
    expect(retry.skipped).toMatch(/Reconciled/);
    expect(retry.receipt?.status).toBe("succeeded");
    expect(retry.receipt?.result?.reconciled).toBe(true);
    expect(db.select().from(actionReceipts).all()).toHaveLength(1);
    expect(db.select().from(communicationEvents).all()).toHaveLength(1); // not sent twice
  });
});

describe("stop controls", () => {
  it("emergency stop and paused employees block execution without destroying the approval", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    const { approval } = proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message", title: "x", destination: "slack:#ops", connectorKey: "slack", payload: { text: "hello" }, context: {} });
    decideApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id, userId: f.manager, role: "manager", decision: "approve" });
    setEmergencyStop(db, { workspaceId: f.workspaceId, userId: f.owner, on: true, reason: "drill" });
    await expect(executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id })).rejects.toThrow(/Emergency stop/);
    setEmergencyStop(db, { workspaceId: f.workspaceId, userId: f.owner, on: false });
    db.update(employees).set({ status: "paused" }).where(eq(employees.id, f.employeeId)).run();
    await expect(executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id })).rejects.toThrow(/paused/);
    expect(db.select().from(approvals).where(eq(approvals.id, approval.id)).get()?.status).toBe("approved");
    expect(db.select().from(workspaces).all()[0].settings.emergencyStop).toBe(false);
  });

  it("a revoked grant blocks execution of an already-approved action", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    const { approval } = proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message", title: "x", destination: "slack:#ops", connectorKey: "slack", payload: { text: "hello" }, context: {} });
    decideApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id, userId: f.manager, role: "manager", decision: "approve" });
    revokeGrant(db, { workspaceId: f.workspaceId, actorUserId: f.owner, grantId: f.grantSlack });
    await expect(executeApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id })).rejects.toThrow(AuthorizationError);
  });
});
