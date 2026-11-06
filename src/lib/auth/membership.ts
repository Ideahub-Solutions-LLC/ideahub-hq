import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { workspaceMembers, workspaces, type WorkspaceRole } from "@/db/schema";

/** Lists the workspaces a user belongs to (for the workspace switcher). */
export function listMemberships(db: Db, userId: string) {
  return db
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .all();
}

/** Server-verified membership check: the only way a workspace can be selected. */
export function isMember(db: Db, workspaceId: string, userId: string): WorkspaceRole | null {
  const row = db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .get();
  return row?.role ?? null;
}
