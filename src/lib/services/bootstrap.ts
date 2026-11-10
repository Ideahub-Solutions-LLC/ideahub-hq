import { z } from "zod";
import type { Db } from "@/db/client";
import { users, workspaceMembers, workspaces } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/audit";
import { newId, nowIso, slugify } from "@/lib/ids";

const Input = z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(1).max(100), password: z.string().min(12).max(128), workspaceName: z.string().trim().min(1).max(60) });

/** A clean real pilot starts here. Never adds fictional accounts or modifies an existing DB. */
export function bootstrapPilot(db: Db, values: z.input<typeof Input>) {
  const input = Input.parse(values);
  return db.transaction((tx) => {
    if (tx.select().from(users).get() || tx.select().from(workspaces).get()) throw new Error("Pilot setup requires an empty database. Use a separate DATABASE_URL; existing data was not changed.");
    const userId = newId("usr");
    const workspaceId = newId("ws");
    const now = nowIso();
    tx.insert(users).values({ id: userId, email: input.email, name: input.name, passwordHash: hashPassword(input.password), createdAt: now }).run();
    tx.insert(workspaces).values({ id: workspaceId, name: input.workspaceName, slug: slugify(input.workspaceName) || workspaceId, settings: { productName: input.workspaceName, emergencyStop: false, branding: { accent: "#2457d6", accentSecondary: "#0f9d8f" } }, createdAt: now, updatedAt: now }).run();
    tx.insert(workspaceMembers).values({ id: newId("wm"), workspaceId, userId, role: "owner", createdAt: now }).run();
    recordAudit(tx, { workspaceId, actorUserId: userId, action: "workspace.bootstrap", entityType: "workspace", entityId: workspaceId });
    return { workspaceId, userId };
  }, { behavior: "immediate" });
}
