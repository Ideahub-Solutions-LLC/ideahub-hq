"use server";
import { requirePermission } from "@/lib/auth/context";
import { describeError, flashRedirect, str } from "@/lib/actions-util";
import { approveOperatingBrief, saveOperatingBrief } from "@/lib/services/hq-profile";
export async function saveOperatingBriefAction(employeeId: string, fd: FormData) {
  const ctx = await requirePermission("employee.edit");
  const lines = (key: string) => str(fd, key).split("\n").map(s => s.trim()).filter(Boolean);
  try { saveOperatingBrief(ctx.db, { workspaceId: ctx.workspace.id, employeeId, userId: ctx.user.id, body: { mission: str(fd, "mission"), responsibilities: lines("responsibilities"), deliverables: lines("deliverables"), escalationRules: lines("escalationRules"), qualityBar: str(fd, "qualityBar") } }); }
  catch (e) { flashRedirect(`/employees/${employeeId}/edit?tab=operating`, { error: describeError(e) }); }
  flashRedirect(`/employees/${employeeId}/setup`, { ok: "Operating brief saved as draft. Review this version before it shapes employee chat instructions." });
}
export async function approveOperatingBriefAction(employeeId: string, version: number, bodyHash: string) {
  const ctx = await requirePermission("employee.authority.edit");
  try { approveOperatingBrief(ctx.db, { workspaceId: ctx.workspace.id, employeeId, userId: ctx.user.id, version, bodyHash }); }
  catch (e) { flashRedirect(`/employees/${employeeId}/setup`, { error: describeError(e) }); }
  flashRedirect(`/employees/${employeeId}/setup`, { ok: "Operating brief reviewed. Chat now uses this exact version; tool permissions are unchanged." });
}
