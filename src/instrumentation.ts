/**
 * Starts the inline job worker inside the Next.js server process (JOB_WORKER_MODE=inline).
 * For production, run `pnpm worker` as a separate process and set JOB_WORKER_MODE=external.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if ((process.env.JOB_WORKER_MODE ?? "inline") === "external") return;
  const g = globalThis as unknown as { __ideahubWorkerStarted?: boolean };
  if (g.__ideahubWorkerStarted) return;
  g.__ideahubWorkerStarted = true;
  const { getDb } = await import("@/db/client");
  const { startWorker } = await import("@/lib/jobs/worker");
  startWorker(getDb(), { log: (m) => console.log(m) });
}
