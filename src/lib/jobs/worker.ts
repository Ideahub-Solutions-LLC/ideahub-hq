import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { jobs, workspaces, tasks, employees, workflowRuns, taskEvents, taskSteps, type Job } from "@/db/schema";
import { claimNextJob, completeJob, failJob, recoverStaleJobs } from "./queue";
import { runTaskWorkflow, WorkflowBlocked } from "@/lib/workflows/runner";
import { generateEmployeeReply } from "@/lib/services/chat";
import { executeApproval, ApprovalError } from "@/lib/services/approvals";
import { ProviderError } from "@/lib/providers";
import { ContentBlocked } from "@/lib/services/content";
import { assertJobCurrent, RUN_HEARTBEAT_MS, type JobExecution } from "./execution";
import { jobLease } from "./queue";
import { newId, nowIso } from "@/lib/ids";

const DEFAULT_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 60_000);


async function handle(db: Db, job: Job, execution: JobExecution): Promise<void> {
  const ws = db.select().from(workspaces).where(eq(workspaces.id, job.workspaceId)).get();
  if (ws?.settings.emergencyStop) {
    // Leave queued (not failed) so work resumes safely when the stop is lifted.
    db.update(jobs).set({ status: "queued", lastError: "Held: emergency stop is active.", runAfter: new Date(Date.now() + 30_000).toISOString(), lockedAt: null, lockedBy: null, updatedAt: nowIso() }).where(eq(jobs.id, job.id)).run();
    return;
  }
  switch (job.kind) {
    case "task.run":
      await runTaskWorkflow(db, String(job.payload.taskId), execution);
      return;
    case "employee.reply":
      await generateEmployeeReply(db, { workspaceId: job.workspaceId, employeeId: String(job.payload.employeeId), messageId: String(job.payload.messageId) });
      return;
    case "approval.execute":
      await executeApproval(db, { workspaceId: job.workspaceId, approvalId: String(job.payload.approvalId), actorUserId: job.payload.actorUserId ? String(job.payload.actorUserId) : null });
      return;
    default:
      throw new Error(`Unknown job kind: ${job.kind}`);
  }
}

/** Runs one job if available. Returns the processed job (or null when the queue is empty). */
export async function runOneJob(db: Db, workerId: string, workspaceId?: string, options: { timeoutMs?: number } = {}): Promise<{ job: Job; outcome: string } | null> {
  const job = claimNextJob(db, workerId, workspaceId);
  if (!job) return null;
  const controller = new AbortController();
  const execution: JobExecution = { job, signal: controller.signal, assertCurrent: () => assertJobCurrent(db, job, controller.signal) };
  const task = job.kind === "task.run" ? db.select().from(tasks).where(and(eq(tasks.id, String(job.payload.taskId)), eq(tasks.workspaceId, job.workspaceId))).get() : null;
  const contentJob = task?.workflowKey === "content_draft";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const heartbeat = setInterval(() => {
    try {
      execution.assertCurrent();
      if (contentJob) {
        const current = db.select().from(tasks).where(eq(tasks.id, task!.id)).get();
        const employee = task!.employeeId ? db.select().from(employees).where(eq(employees.id, task!.employeeId)).get() : null;
        const workspace = db.select().from(workspaces).where(eq(workspaces.id, job.workspaceId)).get();
        if (!current || !["working", "queued"].includes(current.status) || employee?.status !== "active" || workspace?.settings.emergencyStop) throw new ContentBlocked("Work was paused or stopped while the content draft was running.");
      }
      const stamp = nowIso();
      db.update(jobs).set({ lockedAt: stamp, updatedAt: stamp }).where(jobLease(job)).run();
      db.update(workflowRuns).set({ heartbeatAt: stamp }).where(and(eq(workflowRuns.jobId, job.id), eq(workflowRuns.attempt, job.attempts), eq(workflowRuns.status, "running"))).run();
    } catch (error) { controller.abort(error); }
  }, RUN_HEARTBEAT_MS);
  try {
    const stopped = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error("Job cancelled.")), { once: true });
      timer = setTimeout(() => controller.abort(new Error(`Job timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`)), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    });
    await Promise.race([handle(db, job, execution), stopped]);
    const after = db.select().from(jobs).where(eq(jobs.id, job.id)).get();
    if (after?.status === "running") completeJob(db, job.id, job);
    return { job, outcome: after?.status === "queued" ? "held" : "succeeded" };
  } catch (err) {
    const e = err as Error;
    controller.abort(e);
    if (contentJob && db.select().from(jobs).where(jobLease(job)).get()) {
      const stamp = nowIso();
      const ownsRun = db.select().from(workflowRuns).where(and(eq(workflowRuns.jobId, job.id), eq(workflowRuns.attempt, job.attempts))).get();
      db.transaction((tx) => {
        tx.update(workflowRuns).set({ status: "failed", stage: "failed", error: e.message, finishedAt: stamp }).where(and(eq(workflowRuns.jobId, job.id), eq(workflowRuns.attempt, job.attempts), eq(workflowRuns.status, "running"))).run();
        if (ownsRun) tx.update(tasks).set({ status: "blocked", blockedReason: e.message, nextAction: "Resolve the blocker and generate a reviewed revision.", updatedAt: stamp }).where(and(eq(tasks.id, task!.id), eq(tasks.workspaceId, job.workspaceId), eq(tasks.status, "working"))).run();
        if (task!.status === "queued") tx.update(tasks).set({ status: "blocked", blockedReason: e.message, nextAction: "Resolve the blocker before restarting.", updatedAt: stamp }).where(and(eq(tasks.id, task!.id), eq(tasks.status, "queued"))).run();
        if (ownsRun) tx.update(taskSteps).set({ status: "failed", finishedAt: stamp }).where(and(eq(taskSteps.taskId, task!.id), eq(taskSteps.status, "running"))).run();
        tx.insert(taskEvents).values({ id: newId("tev"), workspaceId: job.workspaceId, taskId: task!.id, actorType: "system", kind: "error", message: `Content run stopped: ${e.message}`, createdAt: stamp }).run();
      });
    }
    const retryable = !contentJob && (e instanceof ProviderError ? e.retryable : !(e instanceof WorkflowBlocked || e instanceof ApprovalError || e instanceof ContentBlocked));
    const result = failJob(db, job, e.message, retryable);
    return { job, outcome: result };
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timer);
  }
}

/** Drains up to `limit` jobs synchronously — used by the inline mode so the UI feels immediate. */
export async function drainJobs(db: Db, opts: { limit?: number; workspaceId?: string; workerId?: string } = {}) {
  const results: { job: Job; outcome: string }[] = [];
  for (let i = 0; i < (opts.limit ?? 5); i++) {
    const r = await runOneJob(db, opts.workerId ?? "inline", opts.workspaceId);
    if (!r) break;
    results.push(r);
  }
  return results;
}

/** Long-running poller for `pnpm worker` or the inline instrumentation hook. */
export function startWorker(db: Db, opts: { pollMs?: number; concurrency?: number; workerId?: string; log?: (msg: string) => void } = {}) {
  const pollMs = opts.pollMs ?? Number(process.env.JOB_WORKER_POLL_MS ?? 2000);
  const concurrency = opts.concurrency ?? Number(process.env.JOB_MAX_CONCURRENCY ?? 2);
  const workerId = opts.workerId ?? `worker-${process.pid}`;
  const log = opts.log ?? (() => {});
  let active = 0;
  let stopped = false;
  recoverStaleJobs(db, DEFAULT_TIMEOUT_MS * 2);
  const tick = async () => {
    if (stopped) return;
    while (active < concurrency) {
      active++;
      runOneJob(db, workerId)
        .then((r) => {
          if (r) log(`[jobs] ${r.job.kind} ${r.job.id} → ${r.outcome}`);
        })
        .catch((e) => log(`[jobs] error ${(e as Error).message}`))
        .finally(() => {
          active--;
        });
      // Only spin up more than one when there is likely more work; keep it simple and safe.
      break;
    }
  };
  const interval = setInterval(tick, pollMs);
  const staleInterval = setInterval(() => recoverStaleJobs(db, DEFAULT_TIMEOUT_MS * 2), 60_000);
  log(`[jobs] worker ${workerId} started (poll ${pollMs}ms, concurrency ${concurrency})`);
  return {
    stop() {
      stopped = true;
      clearInterval(interval);
      clearInterval(staleInterval);
    },
  };
}
