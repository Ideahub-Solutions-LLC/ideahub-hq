import { and, eq, sql } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { requireWorkspace } from "@/lib/auth/context";
import { approvals, memoryProposals } from "@/db/schema";
import { can } from "@/lib/authz";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  const { db, workspace, user, role, settings } = ctx;
  const pending = db.select({ n: sql<number>`count(*)` }).from(approvals).where(and(eq(approvals.workspaceId, workspace.id), eq(approvals.status, "pending"))).get();
  const proposals = db.select({ n: sql<number>`count(*)` }).from(memoryProposals).where(and(eq(memoryProposals.workspaceId, workspace.id), eq(memoryProposals.status, "proposed"))).get();
  return (
    <AppShell
      productName={settings.productName}
      workspaceName={workspace.name}
      user={{ name: user.name, email: user.email }}
      role={`${role} · ${user.title ?? ""}`.replace(/ · $/, "")}
      isAdmin={can(role, "admin.members")}
      counts={{ approvals: pending?.n ?? 0, memoryProposals: proposals?.n ?? 0 }}
      emergencyStop={{ on: settings.emergencyStop, reason: settings.emergencyStopReason ?? null }}
      logoutAction={logout}
    >
      {children}
    </AppShell>
  );
}
