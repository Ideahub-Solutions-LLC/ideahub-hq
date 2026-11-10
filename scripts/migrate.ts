import { loadEnvConfig } from "@next/env";
import { createDb, runMigrations } from "../src/db/client";

loadEnvConfig(process.cwd());

const db = createDb();
runMigrations(db);
console.log(`Migrations applied to ${process.env.DATABASE_URL ?? "./data/ideahub.db"}`);
