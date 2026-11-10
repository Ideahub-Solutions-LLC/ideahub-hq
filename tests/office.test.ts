import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { approvals, departments, employees, tasks, workspaces, type TaskStatus } from "@/db/schema";
import { getOfficeSnapshot } from "@/lib/services/office";
import { buildFixture, freshDb } from "./fixture";

function setup() {
  const db = freshDb();
  const f = buildFixture(db);
  const task = (id: string, status: TaskStatus, extra: Partial<typeof tasks.$inferInsert> = {}) => {
    db.insert(tasks).values({ id, workspaceId: f.workspaceId, employeeId: f.employeeId, departmentId: f.deptId, title: `Task ${id}`, objective: "Fictional office test", status, input: {}, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", ...extra }).run();
  };
  const approval = (id: string, taskId: string | null, extra: Partial<typeof approvals.$inferInsert> = {}) => {
    db.insert(approvals).values({ id, workspaceId: f.workspaceId, employeeId: f.employeeId, taskId, actionType: "review_draft", title: `Review ${id}`, destination: "internal", payload: {}, payloadHash: "test", context: {}, status: "pending", idempotencyKey: id, requestedAt: "2026-11-01T00:00:00Z", ...extra }).run();
  };
  const snapshot = () => getOfficeSnapshot(db, f.workspaceId);
  const activity = () => snapshot().departments[0].employees[0].activity;
  return { db, f, task, approval, snapshot, activity };
}

describe("office snapshot", () => {
  it("uses authoritative precedence rather than pretending an active employee is running", () => {
    const { db, f, task, activity } = setup();
    expect(activity().kind).toBe("idle");
    task("queued", "queued");
    expect(activity().kind).toBe("queued");
    task("review", "needs_approval");
    expect(activity().kind).toBe("review");
    task("blocked", "blocked", { blockedReason: "Missing reviewed input" });
    expect(activity()).toMatchObject({ kind: "blocked", detail: "Missing reviewed input" });
    task("working", "working");
    expect(activity()).toMatchObject({ kind: "working", label: "Task marked working" });
    expect(activity().detail).toContain("not proof of real-time execution");
    db.update(employees).set({ status: "paused" }).where(eq(employees.id, f.employeeId)).run();
    expect(activity().kind).toBe("paused");
    db.update(employees).set({ status: "draft" }).where(eq(employees.id, f.employeeId)).run();
    expect(activity().kind).toBe("draft");
    const ws = db.select().from(workspaces).where(eq(workspaces.id, f.workspaceId)).get()!;
    db.update(workspaces).set({ settings: { ...ws.settings, emergencyStop: true } }).where(eq(workspaces.id, f.workspaceId)).run();
    expect(activity()).toMatchObject({ kind: "stopped", task: null, approvalId: null });
  });

  it("selects the newest task deterministically and returns refreshed details", () => {
    const { db, task, activity } = setup();
    task("b", "working");
    task("a", "working");
    expect(activity().task?.id).toBe("a");
    db.update(tasks).set({ title: "Updated task", nextAction: "Review evidence", updatedAt: "2026-11-02T00:00:00Z" }).where(eq(tasks.id, "b")).run();
    expect(activity().task).toEqual({ id: "b", title: "Updated task", status: "working", nextAction: "Review evidence", updatedAt: "2026-11-02T00:00:00Z" });
  });

  it("never animates human-only tasks but retains department task totals", () => {
    const { task, approval, activity, snapshot } = setup();
    task("human", "working", { employeeId: null });
    approval("human-review", "human", { employeeId: null });
    expect(activity().kind).toBe("idle");
    expect(snapshot().departments[0].counts).toEqual({ active: 1, needsApproval: 1, blocked: 0 });
  });

  it("shows current approval details and counts each task needing review only once", () => {
    const { db, task, approval, activity, snapshot } = setup();
    task("review", "queued");
    approval("a", "review");
    approval("b", "review");
    expect(activity()).toMatchObject({ kind: "review", approvalId: "a", detail: "Review a", task: { id: "review" } });
    expect(snapshot().departments[0].counts.needsApproval).toBe(1);
    db.update(tasks).set({ status: "needs_approval" }).where(eq(tasks.id, "review")).run();
    expect(snapshot().departments[0].counts.needsApproval).toBe(1);
    db.update(approvals).set({ status: "approved" }).run();
    expect(activity()).toMatchObject({ kind: "review", approvalId: null });
  });

  it("supports employee-only approvals without inventing a task and respects failed-task precedence", () => {
    const { db, task, approval, activity } = setup();
    approval("standalone", null);
    expect(activity()).toMatchObject({ kind: "review", task: null, approvalId: "standalone", detail: "Review standalone" });
    task("failed", "failed");
    expect(activity()).toMatchObject({ kind: "blocked", label: "Task failed", approvalId: null });
    db.update(tasks).set({ status: "completed" }).where(eq(tasks.id, "failed")).run();
    db.update(approvals).set({ title: "Revised review question" }).where(eq(approvals.id, "standalone")).run();
    expect(activity().detail).toBe("Revised review question");
  });

  it("rejects foreign workspace task and approval references and foreign manager membership", () => {
    const { db, f, task, approval, activity, snapshot } = setup();
    const other = buildFixture(db, { slug: "foreign" });
    task("foreign-task", "working", { workspaceId: other.workspaceId, departmentId: other.deptId });
    approval("bad-task", "foreign-task");
    approval("foreign-approval", null, { workspaceId: other.workspaceId });
    approval("foreign-employee", null, { employeeId: other.employeeId });
    task("human-task", "queued", { employeeId: null });
    approval("wrong-assignee", "human-task");
    db.update(departments).set({ managerUserId: other.manager }).where(eq(departments.id, f.deptId)).run();
    expect(activity().kind).toBe("idle");
    expect(snapshot().departments[0].managerName).toBeNull();
    expect(snapshot().departments[0].counts.needsApproval).toBe(0);
    expect(JSON.stringify(snapshot())).not.toContain("foreign-task");
  });

  it("includes unassigned and malformed foreign-department employees but excludes archived staff", () => {
    const { db, f, snapshot } = setup();
    db.update(employees).set({ departmentId: null }).where(eq(employees.id, f.employeeId)).run();
    expect(snapshot().unassigned.map((e) => e.id)).toEqual([f.employeeId]);
    const other = buildFixture(db, { slug: "other" });
    db.update(employees).set({ departmentId: other.deptId }).where(eq(employees.id, f.employeeId)).run();
    expect(snapshot().unassigned.map((e) => e.id)).toEqual([f.employeeId]);
    db.update(employees).set({ status: "archived" }).where(eq(employees.id, f.employeeId)).run();
    expect(snapshot().unassigned).toEqual([]);
    expect(snapshot().departments[0].employees).toEqual([]);
    expect(getOfficeSnapshot(db, "missing")).toMatchObject({ departments: [], unassigned: [], emergencyStop: false });
  });

  it("keeps paused and completed tasks from appearing to work and performs no writes", () => {
    const { db, task, activity, snapshot } = setup();
    task("completed", "completed");
    expect(activity().kind).toBe("idle");
    task("paused", "paused");
    expect(activity().kind).toBe("paused");
    const before = db.select().from(tasks).all();
    snapshot();
    expect(db.select().from(tasks).all()).toEqual(before);
  });
});
