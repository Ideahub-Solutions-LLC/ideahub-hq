import { createDb, runMigrations } from "../src/db/client";

const db = createDb();
runMigrations(db);
console.log(`Migrations applied to ${process.env.DATABASE_URL ?? "./data/ideahub.db"}`);
