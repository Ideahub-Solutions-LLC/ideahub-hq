import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { workspaceMembers, workspaces, type User, type Workspace, type WorkspaceRole, type WorkspaceSettings } from "@/db/schema";
import { getUserBySessionToken, SESSION_COOKIE, WORKSPACE_COOKIE } from "./session";
import { assertCan, type Permission } from "@/lib/authz";

export type RequestContext = {
  db: Db;
  user: User;
  workspace: Workspace;
  role: WorkspaceRole;
  settings: WorkspaceSettings;
};

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  return getUserBySessionToken(getDb(), jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Resolves the active workspace for the signed-in user.
 * The workspace cookie is only a *hint*: membership is verified server-side on every request,
 * so a forged cookie can never select a workspace the user does not belong to.
 */
export async function getWorkspaceContext(): Promise<RequestContext | null> {
  const db = getDb();
  const jar = await cookies();
  const user = getUserBySessionToken(db, jar.get(SESSION_COOKIE)?.value);
  if (!user) return null;
  const hinted = jar.get(WORKSPACE_COOKIE)?.value;

  const memberships = db
    .select({ membership: workspaceMembers, workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, user.id))
    .all();
  if (memberships.length === 0) return null;

  const chosen = memberships.find((m) => m.workspace.id === hinted) ?? memberships[0];
  return {
    db,
    user,
    workspace: chosen.workspace,
    role: chosen.membership.role,
    settings: chosen.workspace.settings,
  };
}

export async function requireWorkspace(): Promise<RequestContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function requirePermission(permission: Permission): Promise<RequestContext> {
  const ctx = await requireWorkspace();
  assertCan(ctx.role, permission);
  return ctx;
}

export { listMemberships, isMember } from "./membership";
