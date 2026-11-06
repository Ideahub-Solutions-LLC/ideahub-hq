import { and, eq, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { jobs, type Job } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";

/**
 * Durable, DB-backed job queue. Jobs persist across restarts; claiming is an atomic
 * conditional UPDATE so two workers (or the inline runner + the poller) never run the same job.
 * Swap for BullMQ/pg-boss later without changing callers (see docs/ARCHITECTURE.md).
 */
export type JobKind = "task.run" | "employee.reply" | "approval.execute";

export function enqueueJob(db: Db, input: { workspaceId: string; kind: JobKind; payload: Record<string, unknown>; runAfter?: string; maxAttempts?: number }): Job {
  const now = nowIso();
  const job: Job = {
    id: newId("job"),
    workspaceId: input.workspaceId,
    kind: input.kind,
    payload: input.payload,
    status: "queued",
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    runAfter: input.runAfter ?? now,
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(jobs).values(job).run();
  return job;
}

export function claimNextJob(db: Db, workerId: string, workspaceId?: string): Job | null {
  const now = nowIso();
  const candidate = db
    .select()
    .from(jobs)
    .where(workspaceId ? and(eq(jobs.status, "queued"), lte(jobs.runAfter, now), eq(jobs.workspaceId, workspaceId)) : and(eq(jobs.status, "queued"), lte(jobs.runAfter, now)))
    .orderBy(jobs.runAfter)
    .limit(1)
    .get();
  if (!candidate) return null;
  const res = db
    .update(jobs)
    .set({ status: "running", lockedAt: now, lockedBy: workerId, attempts: sql`${jobs.attempts} + 1`, updatedAt: now })
    .where(and(eq(jobs.id, candidate.id), eq(jobs.status, "queued")))
    .run();
  if (res.changes !== 1) return null; // someone else claimed it
  return db.select().from(jobs).where(eq(jobs.id, candidate.id)).get() ?? null;
}

export function completeJob(db: Db, jobId: string) {
  db.update(jobs).set({ status: "succeeded", updatedAt: nowIso(), lockedAt: null, lockedBy: null }).where(eq(jobs.id, jobId)).run();
}

export function failJob(db: Db, job: Job, error: string, retryable: boolean) {
  const now = nowIso();
  if (retryable && job.attempts < job.maxAttempts) {
    const backoffMs = Math.min(60_000, 2_000 * 2 ** (job.attempts - 1));
    db.update(jobs).set({ status: "queued", lastError: error, runAfter: new Date(Date.now() + backoffMs).toISOString(), lockedAt: null, lockedBy: null, updatedAt: now }).where(eq(jobs.id, job.id)).run();
    return "requeued" as const;
  }
  db.update(jobs).set({ status: "failed", lastError: error, lockedAt: null, lockedBy: null, updatedAt: now }).where(eq(jobs.id, job.id)).run();
  return "failed" as const;
}

/** Re-queue jobs whose worker died mid-run (lock older than the timeout). */
export function recoverStaleJobs(db: Db, staleAfterMs: number) {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const stale = db.select().from(jobs).where(and(eq(jobs.status, "running"), lte(jobs.lockedAt, cutoff))).all();
  for (const job of stale) failJob(db, job, "Worker lock expired (process may have restarted).", true);
  return stale.length;
}

export function queueStats(db: Db, workspaceId: string) {
  const rows = db.select({ status: jobs.status, n: sql<number>`count(*)` }).from(jobs).where(eq(jobs.workspaceId, workspaceId)).groupBy(jobs.status).all();
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<Job["status"], number>>;
}
