/**
 * Standalone job worker: `pnpm worker`. Use when JOB_WORKER_MODE=external so background
 * work runs outside the web process (recommended for production).
 */
import { createDb, runMigrations } from "../src/db/client";
import { startWorker } from "../src/lib/jobs/worker";

const db = createDb();
runMigrations(db);
const worker = startWorker(db, { log: (m) => console.log(m) });
process.on("SIGINT", () => {
  worker.stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  worker.stop();
  process.exit(0);
});
