"use server";

import { requirePermission } from "@/lib/auth/context";
import { describeError, flashRedirect, num, optStr, str } from "@/lib/actions-util";
import { addMember, removeMember, setEmergencyStop, setMemberRole, updateWorkspaceBranding, upsertBudget } from "@/lib/services/admin";
import { WORKSPACE_ROLES, type WorkspaceRole } from "@/db/schema";
import { randomToken } from "@/lib/ids";

export async function emergencyStopAction(on: boolean, fd: FormData) {
  const ctx = await requirePermission("admin.emergency_stop");
  try {
    setEmergencyStop(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, on, reason: optStr(fd, "reason") ?? undefined });
  } catch (e) {
    flashRedirect("/admin", { error: describeError(e) });
  }
  flashRedirect("/admin", { ok: on ? "Emergency stop activated. Jobs are held, replies paused and approvals cannot execute." : "Emergency stop lifted. Held jobs resume on the next worker tick." });
}

export async function brandingAction(fd: FormData) {
  const ctx = await requirePermission("admin.providers");
  try {
    const productName = str(fd, "productName");
    if (productName.length < 2 || productName.length > 60) throw new Error("Product name must be 2–60 characters.");
    updateWorkspaceBranding(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, productName, accent: str(fd, "accent") || "#2457d6", accentSecondary: str(fd, "accentSecondary") || "#0f9d8f" });
  } catch (e) {
    flashRedirect("/admin", { error: describeError(e) });
  }
  flashRedirect("/admin", { ok: "Workspace naming saved." });
}

export async function setRoleAction(memberId: string, fd: FormData) {
  const ctx = await requirePermission("admin.roles");
  const role = str(fd, "role") as WorkspaceRole;
  if (!WORKSPACE_ROLES.includes(role)) flashRedirect("/admin/members", { error: "Invalid role." });
  try {
    setMemberRole(ctx.db, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, memberId, role });
  } catch (e) {
    flashRedirect("/admin/members", { error: describeError(e) });
  }
  flashRedirect("/admin/members", { ok: "Role updated." });
}

export async function addMemberAction(fd: FormData) {
  const ctx = await requirePermission("admin.members");
  const role = (str(fd, "role") || "member") as WorkspaceRole;
  if (!WORKSPACE_ROLES.includes(role) || (role === "owner" && ctx.role !== "owner")) flashRedirect("/admin/members", { error: "You cannot assign that role." });
  const temporaryPassword = randomToken(9);
  try {
    addMember(ctx.db, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, email: str(fd, "email"), name: str(fd, "name"), role, temporaryPassword });
  } catch (e) {
    flashRedirect("/admin/members", { error: describeError(e) });
  }
  flashRedirect("/admin/members", { ok: `Member added. If the account is new, the temporary password is: ${temporaryPassword} — share it securely; there is no email delivery in this version.` });
}

export async function removeMemberAction(memberId: string) {
  const ctx = await requirePermission("admin.members");
  try {
    removeMember(ctx.db, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, memberId });
  } catch (e) {
    flashRedirect("/admin/members", { error: describeError(e) });
  }
  flashRedirect("/admin/members", { ok: "Member removed from the workspace." });
}

export async function budgetAction(fd: FormData) {
  const ctx = await requirePermission("admin.budgets");
  try {
    const scopeType = str(fd, "scopeType") as "workspace" | "employee";
    const scopeId = scopeType === "workspace" ? ctx.workspace.id : str(fd, "scopeId");
    if (!scopeId) throw new Error("Choose an employee.");
    upsertBudget(ctx.db, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, scopeType, scopeId, limitCents: Math.round(num(fd, "limitDollars", 0) * 100), alertThresholdPct: num(fd, "alertThresholdPct", 80) });
  } catch (e) {
    flashRedirect("/admin/usage", { error: describeError(e) });
  }
  flashRedirect("/admin/usage", { ok: "Budget saved." });
}
