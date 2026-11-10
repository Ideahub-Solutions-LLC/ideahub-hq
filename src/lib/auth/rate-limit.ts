import { isIP } from "node:net";
import { eq, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { authRateLimits } from "@/db/schema";
import { sha256 } from "@/lib/ids";

const WINDOW_MS = 15 * 60_000;

/** Only trust a single address header explicitly overwritten by the deployment's proxy. */
export function clientAddress(headers: Pick<Headers, "get">): string {
  const header = process.env.AUTH_CLIENT_IP_HEADER;
  const value = header ? headers.get(header)?.trim() : undefined;
  return value && isIP(value) ? value : "shared";
}

/** Persistent fixed windows, claimed atomically across SQLite worker connections. */
export function consumeAuthAttempt(db: Db, operation: "login" | "reset", subject: string, address: string, now = Date.now()): boolean {
  return db.transaction((tx) => {
    tx.delete(authRateLimits).where(lte(authRateLimits.expiresAt, now)).run();
    const buckets = [
      { key: sha256(`${operation}:subject:${subject.trim().toLowerCase()}`), limit: 5 },
      { key: sha256(`${operation}:address:${address}`), limit: 30 },
    ];
    const rows = buckets.map((b) => tx.select().from(authRateLimits).where(eq(authRateLimits.key, b.key)).get());
    if (rows.some((row, i) => row && row.attempts >= buckets[i].limit)) return false;
    buckets.forEach((bucket, i) => {
      const row = rows[i];
      if (row) tx.update(authRateLimits).set({ attempts: row.attempts + 1 }).where(eq(authRateLimits.key, bucket.key)).run();
      else tx.insert(authRateLimits).values({ key: bucket.key, attempts: 1, expiresAt: now + WINDOW_MS }).run();
    });
    return true;
  }, { behavior: "immediate" });
}
