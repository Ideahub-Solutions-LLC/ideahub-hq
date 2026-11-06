import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { jobs, workspaces, type Job } from "@/db/schema";
import { claimNextJob, completeJob, failJob, recoverStaleJobs } from "./queue";
import { runTaskWorkflow, WorkflowBlocked } from "@/lib/workflows/runner";
import { generateEmployeeReply } from "@/lib/services/chat";
import { executeApproval, ApprovalError } from "@/lib/services/approvals";
import { ProviderError } from "@/lib/providers";
import { nowIso } from "@/lib/ids";

const DEFAULT_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 60_000);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Job timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function handle(db: Db, job: Job): Promise<void> {
  const ws = db.select().from(workspaces).where(eq(workspaces.id, job.workspaceId)).get();
  if (ws?.settings.emergencyStop) {
    // Leave queued (not failed) so work resumes safely when the stop is lifted.
    db.update(jobs).set({ status: "queued", lastError: "Held: emergency stop is active.", runAfter: new Date(Date.now() + 30_000).toISOString(), lockedAt: null, lockedBy: null, updatedAt: nowIso() }).where(eq(jobs.id, job.id)).run();
    return;
  }
  switch (job.kind) {
    case "task.run":
      await runTaskWorkflow(db, String(job.payload.taskId));
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
export async function runOneJob(db: Db, workerId: string, workspaceId?: string): Promise<{ job: Job; outcome: string } | null> {
  const job = claimNextJob(db, workerId, workspaceId);
  if (!job) return null;
  try {
    await withTimeout(handle(db, job), DEFAULT_TIMEOUT_MS);
    const after = db.select().from(jobs).where(eq(jobs.id, job.id)).get();
    if (after?.status === "running") completeJob(db, job.id);
    return { job, outcome: after?.status === "queued" ? "held" : "succeeded" };
  } catch (err) {
    const e = err as Error;
    const retryable = e instanceof ProviderError ? e.retryable : !(e instanceof WorkflowBlocked || e instanceof ApprovalError);
    const result = failJob(db, job, e.message, retryable);
    return { job, outcome: result };
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
