import { loadEnvConfig } from "@next/env";
import { createDb, runMigrations } from "../src/db/client";
import { workspaces } from "../src/db/schema";
import { seedWorkspace, DEMO_USERS } from "../src/db/seed";

loadEnvConfig(process.cwd());

async function main() {
  const db = createDb();
  runMigrations(db);
  const existing = db.select().from(workspaces).all();
  if (existing.length > 0 && !process.argv.includes("--force")) {
    console.log("Database already contains a workspace. Run `pnpm db:reset` first, or pass --force to add another seeded workspace.");
    process.exit(0);
  }
  const password = process.env.SEED_DEMO_PASSWORD || "change-me-demo";
  const result = await seedWorkspace(db, { password, log: (m) => console.log(`  • ${m}`) });
  console.log("\nSeeded fictional workspace:", result.workspaceId);
  console.log("Sign in with any of these demo users (password: SEED_DEMO_PASSWORD, default \"change-me-demo\"):");
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}  (${u.name})`);
  console.log("\nAll records are fictional. Change the password before exposing this instance to anyone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
