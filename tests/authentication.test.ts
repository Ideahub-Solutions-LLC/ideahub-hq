import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { buildFixture, freshDb } from "./fixture";
import { authRateLimits, auditEvents, passwordResets, users, workspaceMembers } from "@/db/schema";
import { authenticate, issuePasswordReset, resetPassword } from "@/lib/services/authentication";
import { clientAddress, consumeAuthAttempt } from "@/lib/auth/rate-limit";
import { createSession, getUserBySessionToken } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { sha256 } from "@/lib/ids";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

function fixture() {
  const db = freshDb();
  const f = buildFixture(db);
  const target = db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, f.member)).get()!;
  return { db, f, target, issue: () => issuePasswordReset(db, { workspaceId: f.workspaceId, actorUserId: f.owner, memberId: target.id }) };
}

describe("authentication throttling", () => {
  it("normalizes account identifiers and blocks valid credentials after five attempts until expiry", () => {
    vi.useFakeTimers();
    const { db, f } = fixture();
    const user = db.select().from(users).where(eq(users.id, f.member)).get()!;
    for (let i = 0; i < 5; i++) expect(authenticate(db, { email: `  ${user.email.toUpperCase()} `, password: "wrong", address: `ip${i}` }).error).toBe("Incorrect email or password.");
    expect(authenticate(db, { email: user.email, password: "pw", address: "new-ip" }).error).toContain("Too many");
    vi.advanceTimersByTime(15 * 60_000);
    expect(authenticate(db, { email: user.email, password: "pw", address: "new-ip" }).user?.id).toBe(user.id);
    expect(JSON.stringify(db.select().from(authRateLimits).all())).not.toContain(user.email);
  });
  it("bounds password spraying across nonexistent accounts by address", () => {
    const db = freshDb();
    for (let i = 0; i < 30; i++) expect(consumeAuthAttempt(db, "login", `user${i}`, "ip")).toBe(true);
    expect(consumeAuthAttempt(db, "login", "another", "ip")).toBe(false);
    expect(consumeAuthAttempt(db, "login", "another", "other-ip")).toBe(true);
  });
  it("ignores spoofable address headers unless an explicitly trusted single-address header is configured", () => {
    vi.stubEnv("AUTH_CLIENT_IP_HEADER", "");
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "127.0.0.1" });
    expect(clientAddress(headers)).toBe("shared");
    vi.stubEnv("AUTH_CLIENT_IP_HEADER", "x-real-ip");
    expect(clientAddress(headers)).toBe("127.0.0.1");
    headers.set("x-real-ip", "127.0.0.1, 1.2.3.4");
    expect(clientAddress(headers)).toBe("shared");
  });
});

describe("admin-assisted password recovery", () => {
  it("stores only a hash, consumes once, changes password and revokes all sessions", () => {
    const { db, f, issue } = fixture();
    const session1 = createSession(db, f.member);
    const session2 = createSession(db, f.member);
    const { token } = issue();
    expect(db.select().from(passwordResets).get()!.id).toBe(sha256(token));
    expect(JSON.stringify(db.select().from(auditEvents).all())).not.toContain(token);
    resetPassword(db, { token, password: "a-new-password-123", address: "ip" });
    const user = db.select().from(users).where(eq(users.id, f.member)).get()!;
    expect(verifyPassword("a-new-password-123", user.passwordHash)).toBe(true);
    expect(verifyPassword("pw", user.passwordHash)).toBe(false);
    expect(getUserBySessionToken(db, session1.token)).toBeNull();
    expect(getUserBySessionToken(db, session2.token)).toBeNull();
    expect(() => resetPassword(db, { token, password: "a-new-password-456", address: "ip" })).toThrow("Invalid or expired");
  });
  it("rejects expired, superseded and removed-member grants", () => {
    vi.useFakeTimers();
    const { db, issue, target } = fixture();
    const first = issue();
    const second = issue();
    expect(() => resetPassword(db, { token: first.token, password: "a-new-password-123", address: "ip" })).toThrow("Invalid or expired");
    vi.advanceTimersByTime(30 * 60_000);
    expect(() => resetPassword(db, { token: second.token, password: "a-new-password-123", address: "ip" })).toThrow("Invalid or expired");
    const third = issue();
    db.delete(workspaceMembers).where(eq(workspaceMembers.id, target.id)).run();
    expect(() => resetPassword(db, { token: third.token, password: "a-new-password-123", address: "ip" })).toThrow("Invalid or expired");
  });
  it("enforces role and workspace boundaries in the service", () => {
    const { db, f, target } = fixture();
    const input = { workspaceId: f.workspaceId, memberId: target.id };
    expect(() => issuePasswordReset(db, { ...input, actorUserId: f.manager })).toThrow("Only an owner");
    const other = buildFixture(db, { slug: "other" });
    expect(() => issuePasswordReset(db, { ...input, actorUserId: other.owner })).toThrow("Only an owner");
    db.update(workspaceMembers).set({ role: "admin" }).where(eq(workspaceMembers.userId, f.manager)).run();
    expect(issuePasswordReset(db, { ...input, actorUserId: f.manager }).token).toHaveLength(43);
    const owner = db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, f.owner)).get()!;
    expect(() => issuePasswordReset(db, { ...input, memberId: owner.id, actorUserId: f.manager })).toThrow("Only an owner");
    db.insert(workspaceMembers).values({ id: "other-membership", workspaceId: other.workspaceId, userId: f.member, role: "member", createdAt: new Date().toISOString() }).run();
    expect(() => issuePasswordReset(db, { ...input, actorUserId: f.owner })).toThrow("Multi-workspace");
  });
  it("rechecks the issuer and target roles when consuming a recovery code", () => {
    const { db, f, issue, target } = fixture();
    const first = issue();
    db.update(workspaceMembers).set({ role: "manager" }).where(eq(workspaceMembers.userId, f.owner)).run();
    expect(() => resetPassword(db, { token: first.token, password: "a-new-password-123", address: "ip" })).toThrow("Only an owner");
    db.update(workspaceMembers).set({ role: "admin" }).where(eq(workspaceMembers.userId, f.owner)).run();
    const second = issue();
    db.update(workspaceMembers).set({ role: "owner" }).where(eq(workspaceMembers.id, target.id)).run();
    expect(() => resetPassword(db, { token: second.token, password: "a-new-password-123", address: "ip" })).toThrow("Only an owner");
    expect(verifyPassword("pw", db.select().from(users).where(eq(users.id, f.member)).get()!.passwordHash)).toBe(true);
  });
  it("rejects short passwords without consuming a valid grant and throttles invalid-code attempts", () => {
    const { db, issue } = fixture();
    const { token } = issue();
    expect(() => resetPassword(db, { token, password: "short", address: "ip" })).toThrow("12 and 128");
    expect(db.select().from(passwordResets).all()).toHaveLength(1);
    for (let i = 0; i < 4; i++) expect(() => resetPassword(db, { token: "bad", password: "a-new-password-123", address: "ip" })).toThrow("Invalid or expired");
    expect(() => resetPassword(db, { token, password: "a-new-password-123", address: "ip" })).toThrow("Too many");
  });
});

describe("clean pilot bootstrap", () => {
  it("creates only a real owner/workspace, hashes the password and refuses an existing database", async () => {
    const { bootstrapPilot } = await import("@/lib/services/bootstrap");
    const db = freshDb();
    const input = { email: "  OWNER@example.com ", name: "Pilot Owner", password: "a-strong-password-123", workspaceName: "Pilot HQ" };
    const result = bootstrapPilot(db, input);
    const account = db.select().from(users).get()!;
    expect(account.email).toBe("owner@example.com");
    expect(verifyPassword(input.password, account.passwordHash)).toBe(true);
    expect(db.select().from(workspaceMembers).get()).toMatchObject({ workspaceId: result.workspaceId, role: "owner" });
    expect(() => bootstrapPilot(db, input)).toThrow("empty database");
    expect(db.select().from(users).all()).toHaveLength(1);
  });
});

describe("member onboarding", () => {
  it("identifies new accounts and preserves existing account credentials", async () => {
    const { addMember } = await import("@/lib/services/admin");
    const { db, f } = fixture();
    const input = { workspaceId: f.workspaceId, actorUserId: f.owner, email: "new@example.com", name: "Fictional New Member", role: "member" as const, temporaryPassword: "temporary-password-123" };
    expect(addMember(db, input).createdUser).toBe(true);
    const other = buildFixture(db, { slug: "onboarding" });
    expect(addMember(db, { ...input, workspaceId: other.workspaceId, actorUserId: other.owner, temporaryPassword: "should-not-replace" }).createdUser).toBe(false);
    expect(verifyPassword(input.temporaryPassword, db.select().from(users).where(eq(users.email, input.email)).get()!.passwordHash)).toBe(true);
  });
});
