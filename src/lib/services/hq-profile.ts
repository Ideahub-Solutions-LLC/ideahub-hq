import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { departments, employeeBriefs, employees, workspaceMembers } from "@/db/schema";
import { assertCan, NotFoundError, type Permission } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { hashPayload, nowIso } from "@/lib/ids";

const lines = z.array(z.string().trim().min(3).max(400)).min(1).max(12);
export const OperatingBriefSchema = z.object({ mission: z.string().trim().min(10).max(1200), responsibilities: lines, deliverables: lines, escalationRules: lines, qualityBar: z.string().trim().min(10).max(1200) });
export function requireActor(db: Db, workspaceId: string, userId: string, permission: Permission) {
  const actor = db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).get();
  assertCan(actor?.role, permission);
  return actor!;
}
export function getOperatingBrief(db: Db, workspaceId: string, employeeId: string) {
  return db.select().from(employeeBriefs).where(and(eq(employeeBriefs.workspaceId, workspaceId), eq(employeeBriefs.employeeId, employeeId))).get() ?? null;
}
export function validateProfileReferences(db: Db, workspaceId: string, profile: { departmentId: string | null; managerUserId: string | null }) {
  if (profile.departmentId && !db.select().from(departments).where(and(eq(departments.id, profile.departmentId), eq(departments.workspaceId, workspaceId))).get()) throw new NotFoundError("Department not found in this workspace.");
  if (profile.managerUserId && !db.select().from(workspaceMembers).where(and(eq(workspaceMembers.userId, profile.managerUserId), eq(workspaceMembers.workspaceId, workspaceId))).get()) throw new NotFoundError("Manager is not a member of this workspace.");
}
export function saveOperatingBrief(db: Db, input: { workspaceId: string; employeeId: string; userId: string; body: unknown }) {
  requireActor(db, input.workspaceId, input.userId, "employee.edit");
  const body = OperatingBriefSchema.parse(input.body);
  return db.transaction(tx => {
    const employee = tx.select().from(employees).where(and(eq(employees.workspaceId, input.workspaceId), eq(employees.id, input.employeeId))).get();
    if (!employee) throw new NotFoundError("Employee not found.");
    const old = getOperatingBrief(tx, input.workspaceId, employee.id); const stamp = nowIso();
    const row = { employeeId: employee.id, workspaceId: input.workspaceId, body, status: "draft" as const, version: (old?.version ?? 0) + 1, reviewedAt: null, reviewedByUserId: null, updatedAt: stamp };
    tx.insert(employeeBriefs).values(row).onConflictDoUpdate({ target: employeeBriefs.employeeId, set: row }).run();
    tx.update(employees).set({ configVersion: employee.configVersion + 1, updatedAt: stamp }).where(eq(employees.id, employee.id)).run();
    recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "employee.brief_saved", entityType: "employee", entityId: employee.id, data: { version: row.version, hash: hashPayload(body) } });
    return row;
  }, { behavior: "immediate" });
}
export function approveOperatingBrief(db: Db, input: { workspaceId: string; employeeId: string; userId: string; version: number; bodyHash: string }) {
  requireActor(db, input.workspaceId, input.userId, "employee.authority.edit");
  return db.transaction(tx => {
    const brief = getOperatingBrief(tx, input.workspaceId, input.employeeId);
    if (!brief || brief.version !== input.version || hashPayload(brief.body) !== input.bodyHash) throw new Error("Operating brief changed. Review the current version first.");
    const employee = tx.select().from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.workspaceId, input.workspaceId))).get()!;
    const stamp = nowIso();
    tx.update(employeeBriefs).set({ status: "approved", reviewedAt: stamp, reviewedByUserId: input.userId }).where(eq(employeeBriefs.employeeId, input.employeeId)).run();
    tx.update(employees).set({ configVersion: employee.configVersion + 1, updatedAt: stamp }).where(eq(employees.id, employee.id)).run();
    recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "employee.brief_approved", entityType: "employee", entityId: employee.id, data: { version: brief.version, hash: input.bodyHash } });
  }, { behavior: "immediate" });
}
