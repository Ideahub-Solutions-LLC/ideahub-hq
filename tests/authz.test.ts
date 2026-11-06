import { describe, expect, it } from "vitest";
import { assertCan, AuthorizationError, can, PERMISSIONS } from "@/lib/authz";
import { buildFixture, freshDb } from "./fixture";
import { decideApproval, proposeAction } from "@/lib/services/approvals";
import { setMemberRole } from "@/lib/services/admin";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, getUserBySessionToken, deleteSession } from "@/lib/auth/session";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("role matrix", () => {
  it("is least-privilege: members cannot decide approvals or manage admin settings", () => {
    expect(can("member", "approval.decide")).toBe(false);
    expect(can("member", "admin.members")).toBe(false);
    expect(can("member", "task.create")).toBe(true);
    expect(can("manager", "approval.decide")).toBe(true);
    expect(can("manager", "employee.authority.edit")).toBe(false);
    expect(can("admin", "employee.authority.edit")).toBe(true);
    expect(can("admin", "admin.roles")).toBe(false);
    expect(can("owner", "admin.roles")).toBe(true);
    expect(can(null, "workspace.view")).toBe(false);
  });

  it("every permission lists the owner", () => {
    for (const roles of Object.values(PERMISSIONS)) expect((roles as readonly string[]).includes("owner")).toBe(true);
  });

  it("assertCan throws an AuthorizationError", () => {
    expect(() => assertCan("member", "admin.emergency_stop")).toThrow(AuthorizationError);
    expect(() => assertCan("owner", "admin.emergency_stop")).not.toThrow();
  });
});

describe("approval decisions respect roles", () => {
  it("a member cannot decide, a manager can", () => {
    const db = freshDb();
    const f = buildFixture(db);
    const { approval } = proposeAction(db, { workspaceId: f.workspaceId, taskId: null, employeeId: f.employeeId, actionType: "send_message", title: "Post", destination: "slack:#ops", connectorKey: "slack", payload: { text: "hi" }, context: {} });
    expect(() => decideApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id, userId: f.member, role: "member", decision: "approve" })).toThrow(AuthorizationError);
    const decided = decideApproval(db, { workspaceId: f.workspaceId, approvalId: approval.id, userId: f.manager, role: "manager", decision: "approve" });
    expect(decided.status).toBe("approved");
  });

  it("the last owner cannot be demoted", () => {
    const db = freshDb();
    const f = buildFixture(db);
    const ownerMembership = db.query.workspaceMembers.findFirst({ where: (m, { and, eq }) => and(eq(m.workspaceId, f.workspaceId), eq(m.userId, f.owner)) }).sync()!;
    expect(() => setMemberRole(db, { workspaceId: f.workspaceId, actorUserId: f.owner, memberId: ownerMembership.id, role: "admin" })).toThrow(/at least one owner/);
  });
});

describe("passwords and sessions", () => {
  it("hashes with scrypt and verifies", () => {
    const h = hashPassword("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });

  it("stores only a hash of the session token and honours expiry", () => {
    const db = freshDb();
    const f = buildFixture(db);
    const { token } = createSession(db, f.owner);
    const stored = db.select().from(sessions).all();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).not.toBe(token);
    expect(getUserBySessionToken(db, token)?.id).toBe(f.owner);
    expect(getUserBySessionToken(db, "nope")).toBeNull();
    db.update(sessions).set({ expiresAt: "2000-01-01T00:00:00.000Z" }).where(eq(sessions.id, stored[0].id)).run();
    expect(getUserBySessionToken(db, token)).toBeNull();
    deleteSession(db, token);
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });
});
