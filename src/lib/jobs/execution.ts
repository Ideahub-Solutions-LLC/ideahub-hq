import type { Db } from "@/db/client";
import { jobs, type Job } from "@/db/schema";
import { jobLease } from "./queue";

export const RUN_HEARTBEAT_MS = 5_000;
export const RUN_STALE_MS = 30_000;
export type JobExecution = { job: Job; signal: AbortSignal; assertCurrent: () => void };
export class LostExecution extends Error {}

export function assertJobCurrent(db: Db, job: Job, signal?: AbortSignal) {
  if (signal?.aborted) throw new LostExecution("Run cancelled or timed out. No late result will be saved.");
  const current = db.select().from(jobs).where(jobLease(job)).get();
  if (!current?.lockedAt || Date.now() - Date.parse(current.lockedAt) >= RUN_STALE_MS) throw new LostExecution("Worker lease expired or was replaced. No late result will be saved.");
}
