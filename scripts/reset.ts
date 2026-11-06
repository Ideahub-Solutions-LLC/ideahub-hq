import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL ?? "./data/ideahub.db";
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const p = path.resolve(url + suffix);
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    console.log(`removed ${p}`);
  }
}
console.log("Database reset. Run `pnpm db:migrate && pnpm db:seed` (or `pnpm setup`).");
