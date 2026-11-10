"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { describeError, flashRedirect, num, optStr, str } from "@/lib/actions-util";
import { addMember, removeMember, setEmergencyStop, setMemberRole, updateWorkspaceBranding, upsertBudget } from "@/lib/services/admin";
import { WORKSPACE_ROLES, type WorkspaceRole } from "@/db/schema";
import { issuePasswordReset } from "@/lib/services/authentication";
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

export type AddMemberState = { password?: string; error?: string; ok?: string } | undefined;

export async function addMemberAction(_previous: AddMemberState, fd: FormData): Promise<AddMemberState> {
  const ctx = await requirePermission("admin.members");
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(254), name: z.string().trim().min(1).max(100), role: z.enum(WORKSPACE_ROLES) }).safeParse({ email: str(fd, "email"), name: str(fd, "name"), role: str(fd, "role") || "member" });
  if (!parsed.success) return { error: "Enter a valid name, email and role." };
  const role = parsed.data.role;
  if (!WORKSPACE_ROLES.includes(role) || (role === "owner" && ctx.role !== "owner")) return { error: "You cannot assign that role." };
  const temporaryPassword = randomToken(18);
  try {
    const result = addMember(ctx.db, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, email: parsed.data.email, name: parsed.data.name, role, temporaryPassword });
    revalidatePath("/admin/members");
    return { ok: "Member added.", password: result.createdUser ? temporaryPassword : undefined };
  } catch (error) {
    return { error: describeError(error) };
  }
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

export type RecoveryState = { token?: string; error?: string } | undefined;

export async function issueRecoveryAction(memberId: string, _previous: RecoveryState, data: FormData): Promise<RecoveryState> {
  void data;
  const ctx = await requirePermission("admin.members");
  try {
    const { token } = issuePasswordReset(ctx.db, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, memberId });
    return { token };
  } catch (error) {
    return { error: describeError(error) };
  }
}
