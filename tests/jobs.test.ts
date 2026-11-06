import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { buildFixture, freshDb } from "./fixture";
import { claimNextJob, enqueueJob, failJob, recoverStaleJobs } from "@/lib/jobs/queue";
import { drainJobs, runOneJob } from "@/lib/jobs/worker";
import { startWorkflowTask } from "@/lib/services/tasks";
import { setEmergencyStop } from "@/lib/services/admin";
import { postUserMessage, generateEmployeeReply } from "@/lib/services/chat";
import { jobs, memoryProposals, messages, tasks, usageEvents } from "@/db/schema";
import { seedWorkspace } from "@/db/seed";

describe("durable job queue", () => {
  it("claims atomically: a job can only be taken once", () => {
    const db = freshDb();
    const f = buildFixture(db);
    enqueueJob(db, { workspaceId: f.workspaceId, kind: "task.run", payload: { taskId: "x" } });
    const a = claimNextJob(db, "w1");
    const b = claimNextJob(db, "w2");
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(a?.status).toBe("running");
    expect(a?.lockedBy).toBe("w1");
  });

  it("retries with backoff then fails permanently", () => {
    const db = freshDb();
    const f = buildFixture(db);
    enqueueJob(db, { workspaceId: f.workspaceId, kind: "task.run", payload: {}, maxAttempts: 2 });
    const j1 = claimNextJob(db, "w")!;
    expect(failJob(db, j1, "boom", true)).toBe("requeued");
    const row = db.select().from(jobs).where(eq(jobs.id, j1.id)).get()!;
    expect(row.status).toBe("queued");
    expect(row.runAfter > row.updatedAt).toBe(true); // backoff in the future
    // Make it runnable now and fail again → permanent failure
    db.update(jobs).set({ runAfter: "2000-01-01T00:00:00.000Z" }).where(eq(jobs.id, j1.id)).run();
    const j2 = claimNextJob(db, "w")!;
    expect(failJob(db, j2, "boom again", true)).toBe("failed");
    expect(db.select().from(jobs).where(eq(jobs.id, j1.id)).get()?.lastError).toBe("boom again");
  });

  it("recovers jobs whose worker died", () => {
    const db = freshDb();
    const f = buildFixture(db);
    enqueueJob(db, { workspaceId: f.workspaceId, kind: "task.run", payload: {} });
    const j = claimNextJob(db, "dead")!;
    db.update(jobs).set({ lockedAt: "2000-01-01T00:00:00.000Z" }).where(eq(jobs.id, j.id)).run();
    expect(recoverStaleJobs(db, 1000)).toBe(1);
    expect(db.select().from(jobs).where(eq(jobs.id, j.id)).get()?.status).toBe("queued");
  });

  it("holds work (does not fail it) while the emergency stop is active", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    const task = startWorkflowTask(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, workflowKey: "meeting_actions", input: { sourceId: f.sourceId }, requestedByUserId: f.manager });
    setEmergencyStop(db, { workspaceId: f.workspaceId, userId: f.owner, on: true });
    const r = await runOneJob(db, "w");
    expect(r?.outcome).toBe("held");
    expect(db.select().from(tasks).where(eq(tasks.id, task.id)).get()?.status).toBe("queued");
    setEmergencyStop(db, { workspaceId: f.workspaceId, userId: f.owner, on: false });
    db.update(jobs).set({ runAfter: "2000-01-01T00:00:00.000Z" }).where(eq(jobs.workspaceId, f.workspaceId)).run();
    const results = await drainJobs(db, { workspaceId: f.workspaceId });
    expect(results[0]?.outcome).toBe("succeeded");
    expect(db.select().from(tasks).where(eq(tasks.id, task.id)).get()?.status).toBe("needs_approval");
  });

  it("does not retry blocked workflows (non-retryable) and marks the job failed", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    startWorkflowTask(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, workflowKey: "meeting_actions", input: { sourceId: "missing" }, requestedByUserId: f.manager });
    const r = await runOneJob(db, "w");
    expect(r?.outcome).toBe("failed");
  });
});

describe("employee replies", () => {
  it("replies once per message (idempotent on retry), records usage on the demo provider, and proposes memories instead of storing them", async () => {
    const db = freshDb();
    const f = buildFixture(db);
    const { messageId } = postUserMessage(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, userId: f.manager, content: "Remember that blockers go first in the weekly summary." });
    await drainJobs(db, { workspaceId: f.workspaceId });
    await generateEmployeeReply(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, messageId }); // simulate a retried job
    const thread = db.select().from(messages).where(eq(messages.employeeId, f.employeeId)).all();
    expect(thread.filter((m) => m.authorType === "employee")).toHaveLength(1);
    expect(thread.find((m) => m.authorType === "employee")?.metadata?.provider).toBe("demo");
    expect(db.select().from(usageEvents).all()).toHaveLength(1);
    const proposals = db.select().from(memoryProposals).all();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].status).toBe("proposed");
  });
});

describe("seed", () => {
  it("seeds a complete fictional workspace through the real pipeline", async () => {
    const db = freshDb();
    const result = await seedWorkspace(db, { password: "test" });
    expect(result.workspaceId).toMatch(/^ws_/);
    const taskRows = db.select().from(tasks).where(eq(tasks.workspaceId, result.workspaceId)).all();
    expect(taskRows.length).toBeGreaterThan(5);
    expect(taskRows.some((t) => t.status === "needs_approval")).toBe(true);
    expect(db.select().from(jobs).all().every((j) => j.status === "succeeded")).toBe(true);
  }, 30_000);
});
