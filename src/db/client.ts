import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/**
 * Creates a Drizzle client. `":memory:"` is used by the test-suite; the app uses
 * DATABASE_URL (default ./data/ideahub.db). WAL mode + foreign keys are enabled.
 */
export function createDb(url: string = process.env.DATABASE_URL ?? "./data/ideahub.db"): Db {
  if (url !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(/* turbopackIgnore: true */ url)), { recursive: true });
  }
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

export function runMigrations(db: Db) {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

// ───────────── App singleton (one connection per process; HMR-safe) ─────────────
const globalForDb = globalThis as unknown as { __ideahubDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__ideahubDb) {
    const db = createDb();
    // Auto-apply pending migrations on first use so `pnpm dev` works right after clone + seed.
    runMigrations(db);
    globalForDb.__ideahubDb = db;
  }
  return globalForDb.__ideahubDb;
}

/** Test helper: swap the singleton for an isolated in-memory database. */
export function __setDbForTests(db: Db | undefined) {
  globalForDb.__ideahubDb = db;
}

export { schema };
