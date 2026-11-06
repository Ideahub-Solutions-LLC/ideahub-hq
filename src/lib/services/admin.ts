import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { budgets, connectorGrants, connectors, employees, users, workspaceMembers, workspaces, type ConnectorMode, type WorkspaceRole } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/authz";
import { hashPassword } from "@/lib/auth/password";

export function setEmergencyStop(db: Db, input: { workspaceId: string; userId: string; on: boolean; reason?: string }) {
  const ws = db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).get();
  if (!ws) throw new NotFoundError("Workspace not found.");
  db.update(workspaces).set({ settings: { ...ws.settings, emergencyStop: input.on, emergencyStopReason: input.on ? input.reason ?? "Emergency stop activated." : null }, updatedAt: nowIso() }).where(eq(workspaces.id, ws.id)).run();
  recordAudit(db, { workspaceId: ws.id, actorUserId: input.userId, action: input.on ? "workspace.emergency_stop.on" : "workspace.emergency_stop.off", entityType: "workspace", entityId: ws.id, data: { reason: input.reason ?? null } });
}

export function updateWorkspaceBranding(db: Db, input: { workspaceId: string; userId: string; productName: string; accent: string; accentSecondary: string }) {
  const ws = db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).get();
  if (!ws) throw new NotFoundError("Workspace not found.");
  db.update(workspaces).set({ settings: { ...ws.settings, productName: input.productName, branding: { accent: input.accent, accentSecondary: input.accentSecondary } }, updatedAt: nowIso() }).where(eq(workspaces.id, ws.id)).run();
  recordAudit(db, { workspaceId: ws.id, actorUserId: input.userId, action: "workspace.branding", entityType: "workspace", entityId: ws.id });
}

export function setMemberRole(db: Db, input: { workspaceId: string; actorUserId: string; memberId: string; role: WorkspaceRole }) {
  const m = db.select().from(workspaceMembers).where(and(eq(workspaceMembers.id, input.memberId), eq(workspaceMembers.workspaceId, input.workspaceId))).get();
  if (!m) throw new NotFoundError("Member not found.");
  if (m.role === "owner" && input.role !== "owner") {
    const owners = db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.role, "owner"))).all();
    if (owners.length <= 1) throw new Error("A workspace must keep at least one owner.");
  }
  db.update(workspaceMembers).set({ role: input.role }).where(eq(workspaceMembers.id, m.id)).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "member.role", entityType: "workspace_member", entityId: m.id, data: { from: m.role, to: input.role } });
}

/** Adds a member by email. Creates the user with a temporary password if they do not exist yet. */
export function addMember(db: Db, input: { workspaceId: string; actorUserId: string; email: string; name: string; role: WorkspaceRole; temporaryPassword: string }) {
  const email = input.email.trim().toLowerCase();
  let user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    user = { id: newId("usr"), email, name: input.name.trim() || email, title: null, passwordHash: hashPassword(input.temporaryPassword), createdAt: nowIso() };
    db.insert(users).values(user).run();
  }
  const existing = db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, user.id))).get();
  if (existing) throw new Error("That person is already a member.");
  const id = newId("wm");
  db.insert(workspaceMembers).values({ id, workspaceId: input.workspaceId, userId: user.id, role: input.role, createdAt: nowIso() }).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "member.add", entityType: "workspace_member", entityId: id, data: { role: input.role } });
  return id;
}

export function removeMember(db: Db, input: { workspaceId: string; actorUserId: string; memberId: string }) {
  const m = db.select().from(workspaceMembers).where(and(eq(workspaceMembers.id, input.memberId), eq(workspaceMembers.workspaceId, input.workspaceId))).get();
  if (!m) throw new NotFoundError("Member not found.");
  if (m.role === "owner") throw new Error("Transfer ownership before removing an owner.");
  if (m.userId === input.actorUserId) throw new Error("You cannot remove yourself.");
  db.delete(workspaceMembers).where(eq(workspaceMembers.id, m.id)).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "member.remove", entityType: "workspace_member", entityId: m.id });
}

export function upsertBudget(db: Db, input: { workspaceId: string; actorUserId: string; scopeType: "workspace" | "employee"; scopeId: string; limitCents: number; alertThresholdPct: number }) {
  const existing = db.select().from(budgets).where(and(eq(budgets.workspaceId, input.workspaceId), eq(budgets.scopeType, input.scopeType), eq(budgets.scopeId, input.scopeId))).get();
  if (existing) db.update(budgets).set({ limitCents: input.limitCents, alertThresholdPct: input.alertThresholdPct }).where(eq(budgets.id, existing.id)).run();
  else db.insert(budgets).values({ id: newId("bud"), workspaceId: input.workspaceId, scopeType: input.scopeType, scopeId: input.scopeId, period: "monthly", limitCents: input.limitCents, alertThresholdPct: input.alertThresholdPct, createdAt: nowIso() }).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "budget.upsert", entityType: "budget", entityId: input.scopeId, data: { scopeType: input.scopeType, limitCents: input.limitCents } });
}

export function setConnectorMode(db: Db, input: { workspaceId: string; actorUserId: string; connectorId: string; mode: ConnectorMode }) {
  const c = db.select().from(connectors).where(and(eq(connectors.id, input.connectorId), eq(connectors.workspaceId, input.workspaceId))).get();
  if (!c) throw new NotFoundError("Connector not found.");
  db.update(connectors).set({ mode: input.mode, lastCheckedAt: nowIso(), updatedAt: nowIso() }).where(eq(connectors.id, c.id)).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "connector.mode", entityType: "connector", entityId: c.id, data: { from: c.mode, to: input.mode } });
}

export function grantConnector(db: Db, input: { workspaceId: string; actorUserId: string; connectorId: string; employeeId: string; scopes: string[] }) {
  const c = db.select().from(connectors).where(and(eq(connectors.id, input.connectorId), eq(connectors.workspaceId, input.workspaceId))).get();
  const e = db.select().from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.workspaceId, input.workspaceId))).get();
  if (!c || !e) throw new NotFoundError("Connector or employee not found.");
  const existing = db.select().from(connectorGrants).where(and(eq(connectorGrants.connectorId, c.id), eq(connectorGrants.employeeId, e.id), eq(connectorGrants.status, "active"))).get();
  if (existing) return existing.id;
  const id = newId("grt");
  db.insert(connectorGrants).values({ id, workspaceId: input.workspaceId, connectorId: c.id, employeeId: e.id, scopes: input.scopes, grantedByUserId: input.actorUserId, status: "active", createdAt: nowIso(), revokedAt: null }).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "connector.grant", entityType: "connector_grant", entityId: id, data: { connector: c.key, employee: e.name, scopes: input.scopes } });
  return id;
}

export function revokeGrant(db: Db, input: { workspaceId: string; actorUserId: string; grantId: string }) {
  const g = db.select().from(connectorGrants).where(and(eq(connectorGrants.id, input.grantId), eq(connectorGrants.workspaceId, input.workspaceId))).get();
  if (!g) throw new NotFoundError("Grant not found.");
  db.update(connectorGrants).set({ status: "revoked", revokedAt: nowIso() }).where(eq(connectorGrants.id, g.id)).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "connector.revoke", entityType: "connector_grant", entityId: g.id });
}
