import { loadEnvConfig } from "@next/env";
import { createDb, runMigrations } from "../src/db/client";
import { bootstrapPilot } from "../src/lib/services/bootstrap";

loadEnvConfig(process.cwd());
try {
  const db = createDb();
  runMigrations(db);
  const result = bootstrapPilot(db, {
    email: process.env.PILOT_OWNER_EMAIL ?? "",
    name: process.env.PILOT_OWNER_NAME ?? "",
    password: process.env.PILOT_OWNER_PASSWORD ?? "",
    workspaceName: process.env.NEXT_PUBLIC_PRODUCT_NAME ?? "Team HQ",
  });
  console.log(`Created empty pilot workspace ${result.workspaceId}. Sign in as the configured owner; add members and configure employees in Admin. No demo data was created.`);
} catch {
  console.error("Pilot setup failed. Use an empty database and configure PILOT_OWNER_EMAIL, PILOT_OWNER_NAME and PILOT_OWNER_PASSWORD (12–128 characters). Existing accounts are never overwritten.");
  process.exitCode = 1;
}
