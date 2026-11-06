import { describe, expect, it } from "vitest";
import { buildFixture, freshDb } from "./fixture";
import { getEmployee, listEmployees, updateEmployeeProfile } from "@/lib/services/employees";
import { getTask, listTasks, startWorkflowTask } from "@/lib/services/tasks";
import { decideApproval, proposeAction } from "@/lib/services/approvals";
import { isMember } from "@/lib/auth/membership";
import { NotFoundError } from "@/lib/authz";
import { approvedSourcesForEmployee } from "@/lib/services/retrieval";
import { listPendingApprovals } from "@/lib/services/approvals";

/** Cross-workspace isolation: every read and write is scoped by workspaceId on the server. */
describe("cross-workspace isolation", () => {
  it("records from workspace B are invisible and unmodifiable from workspace A", async () => {
    const db = freshDb();
    const a = buildFixture(db, { slug: "a" });
    const b = buildFixture(db, { slug: "b" });

    // Reads
    expect(getEmployee(db, a.workspaceId, b.employeeId)).toBeUndefined();
    expect(listEmployees(db, a.workspaceId).map((e) => e.id)).toEqual([a.employeeId]);
    expect(approvedSourcesForEmployee(db, a.workspaceId, b.employeeId)).toHaveLength(0);

    // Membership
    expect(isMember(db, a.workspaceId, a.owner)).toBe("owner");
    expect(isMember(db, b.workspaceId, a.owner)).toBeNull();

    // Writes
    expect(() => updateEmployeeProfile(db, { workspaceId: a.workspaceId, employeeId: b.employeeId, userId: a.owner, profile: { name: "Hacked", roleTitle: "x", departmentId: null, managerUserId: null, seniority: "trainee", bio: "x", channels: [], personality: { tone: "warm", verbosity: "concise", reportingFormat: "bullets", questionStyle: "ask_before_acting", summary: "x" } } })).toThrow(NotFoundError);
    expect(() => startWorkflowTask(db, { workspaceId: a.workspaceId, employeeId: b.employeeId, workflowKey: "meeting_actions", input: { sourceId: b.sourceId }, requestedByUserId: a.owner })).toThrow(NotFoundError);

    // Approvals proposed in B cannot be decided with an A context, and do not show in A's queue
    const { approval } = proposeAction(db, { workspaceId: b.workspaceId, taskId: null, employeeId: b.employeeId, actionType: "send_message", title: "B post", destination: "slack:#b", connectorKey: "slack", payload: { text: "b" }, context: {} });
    expect(() => decideApproval(db, { workspaceId: a.workspaceId, approvalId: approval.id, userId: a.owner, role: "owner", decision: "approve" })).toThrow(NotFoundError);
    expect(listPendingApprovals(db, a.workspaceId)).toHaveLength(0);
    expect(listPendingApprovals(db, b.workspaceId)).toHaveLength(1);

    // Tasks
    const task = startWorkflowTask(db, { workspaceId: b.workspaceId, employeeId: b.employeeId, workflowKey: "meeting_actions", input: { sourceId: b.sourceId }, requestedByUserId: b.manager });
    expect(getTask(db, a.workspaceId, task.id)).toBeUndefined();
    expect(listTasks(db, a.workspaceId)).toHaveLength(0);
  });

  it("an employee cannot propose against a source or connector from another workspace", () => {
    const db = freshDb();
    const a = buildFixture(db, { slug: "a" });
    const b = buildFixture(db, { slug: "b" });
    // Employee from A used with workspace B id → not found
    expect(() => proposeAction(db, { workspaceId: b.workspaceId, taskId: null, employeeId: a.employeeId, actionType: "send_message", title: "x", destination: "slack:#x", connectorKey: "slack", payload: {}, context: {} })).toThrow(NotFoundError);
  });
});
