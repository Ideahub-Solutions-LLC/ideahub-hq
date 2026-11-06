import { and, eq, gt } from "drizzle-orm";
import { sessions, users, type User } from "@/db/schema";
import type { Db } from "@/db/client";
import { newId, nowIso, randomToken, sha256 } from "@/lib/ids";

export const SESSION_COOKIE = "ih_session";
export const WORKSPACE_COOKIE = "ih_workspace";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** Creates a server-side session. The raw token goes to the cookie; only its hash is stored. */
export function createSession(db: Db, userId: string): { token: string; expiresAt: string } {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.insert(sessions).values({ id: sha256(token), userId, expiresAt, createdAt: nowIso() }).run();
  return { token, expiresAt };
}

export function getUserBySessionToken(db: Db, token: string | undefined | null): User | null {
  if (!token) return null;
  const row = db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, nowIso())))
    .get();
  return row?.user ?? null;
}

export function deleteSession(db: Db, token: string | undefined | null) {
  if (!token) return;
  db.delete(sessions).where(eq(sessions.id, sha256(token))).run();
}

export function newUserId() {
  return newId("usr");
}
