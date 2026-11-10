import { and, eq, gt, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { passwordResets, sessions, users, workspaceMembers } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { consumeAuthAttempt } from "@/lib/auth/rate-limit";
import { AuthorizationError } from "@/lib/authz";
import { nowIso, randomToken, sha256 } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";

const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export function authenticate(db: Db, input: { email: string; password: string; address: string }) {
  const email = input.email.trim().toLowerCase();
  if (!consumeAuthAttempt(db, "login", email, input.address)) return { error: "Too many attempts. Try again in 15 minutes." } as const;
  const user = db.select().from(users).where(eq(users.email, email)).get();
  const ok = input.password.length <= 1024 && verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: "Incorrect email or password." } as const;
  return { user } as const;
}

function requireRecoveryAuthority(db: Db, input: { workspaceId: string; actorUserId: string; memberId: string }) {
  const actor = db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, input.actorUserId))).get();
  const target = db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.id, input.memberId))).get();
  if (!actor || !target || (actor.role !== "owner" && !(actor.role === "admin" && (target.role === "manager" || target.role === "member")))) throw new AuthorizationError("Only an owner can recover owner/admin accounts; admins may recover managers and members.");
  // An admin of a lower-privilege workspace must not take over an owner in another workspace.
  const roles = db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, target.userId)).all();
  if (roles.some((m) => m.workspaceId !== input.workspaceId)) throw new AuthorizationError("Multi-workspace accounts require a separate verified recovery process.");
  if (actor.role !== "owner" && roles.some((m) => m.role === "owner" || m.role === "admin")) throw new AuthorizationError("This account requires owner-assisted recovery.");
  return target;
}

/** Admin-assisted recovery; deliver the raw code through a verified, private channel. No email is sent. */
export function issuePasswordReset(db: Db, input: { workspaceId: string; actorUserId: string; memberId: string }) {
  return db.transaction((tx) => {
    const target = requireRecoveryAuthority(tx, input);
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    tx.delete(passwordResets).where(lte(passwordResets.expiresAt, nowIso())).run();
    tx.delete(passwordResets).where(eq(passwordResets.userId, target.userId)).run();
    tx.insert(passwordResets).values({ id: sha256(token), userId: target.userId, workspaceId: input.workspaceId, issuedByUserId: input.actorUserId, expiresAt, createdAt: nowIso() }).run();
    recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "auth.recovery.issued", entityType: "user", entityId: target.userId });
    return { token, expiresAt };
  }, { behavior: "immediate" });
}

export function resetPassword(db: Db, input: { token: string; password: string; address: string }) {
  // A shared subject bucket also bounds random-code guessing; tokens are not logged.
  if (!consumeAuthAttempt(db, "reset", input.address, input.address)) throw new Error("Too many attempts. Try again in 15 minutes.");
  if (input.password.length < 12 || input.password.length > 128) throw new Error("Choose a password between 12 and 128 characters.");
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw new Error("Invalid or expired recovery code.");
  return db.transaction((tx) => {
    const reset = tx.select().from(passwordResets).where(and(eq(passwordResets.id, sha256(input.token)), gt(passwordResets.expiresAt, nowIso()))).get();
    if (!reset) throw new Error("Invalid or expired recovery code.");
    // Recheck membership: removing the target from this workspace invalidates its recovery grant.
    const member = tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, reset.workspaceId), eq(workspaceMembers.userId, reset.userId))).get();
    if (!member || !reset.issuedByUserId) throw new Error("Invalid or expired recovery code.");
    // Revoking the issuer's role or promoting the target must also revoke recovery authority.
    requireRecoveryAuthority(tx, { workspaceId: reset.workspaceId, actorUserId: reset.issuedByUserId, memberId: member.id });
    tx.update(users).set({ passwordHash: hashPassword(input.password) }).where(eq(users.id, reset.userId)).run();
    tx.delete(passwordResets).where(eq(passwordResets.userId, reset.userId)).run();
    tx.delete(sessions).where(eq(sessions.userId, reset.userId)).run();
    recordAudit(tx, { workspaceId: reset.workspaceId, actorUserId: reset.userId, action: "auth.recovery.completed", entityType: "user", entityId: reset.userId });
  }, { behavior: "immediate" });
}
