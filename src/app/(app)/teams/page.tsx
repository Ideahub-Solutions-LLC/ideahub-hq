import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { departments, employees, users, workspaceMembers } from "@/db/schema";
import { PageHeader, Card, CardTitle, EmptyState } from "@/components/ui/card";
export default async function TeamsPage() {
  const ctx = await requireWorkspace();
  const teams = ctx.db
    .select()
    .from(departments)
    .where(eq(departments.workspaceId, ctx.workspace.id))
    .all();
  const staff = ctx.db
    .select()
    .from(employees)
    .where(eq(employees.workspaceId, ctx.workspace.id))
    .all();
  const people = ctx.db
    .select({ id: users.id, name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, ctx.workspace.id))
    .all();
  return (
    <div>
      <PageHeader
        eyebrow="Monitor"
        title="Teams"
        description="Teams use the HQ’s existing departments. Open a team’s work areas or review its AI employees."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((t) => (
          <Card key={t.id}>
            <CardTitle>{t.name}</CardTitle>
            <p className="text-sm text-ink-2">{t.purpose}</p>
            <p className="mt-2 text-xs text-ink-3">
              Manager:{" "}
              {people.find((u) => u.id === t.managerUserId)?.name ??
                "Unassigned"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {staff
                .filter(
                  (e) => e.departmentId === t.id && e.status !== "archived",
                )
                .map((e) => (
                  <Link
                    key={e.id}
                    href={`/employees/${e.id}`}
                    className="badge border border-line hover:bg-surface-2"
                  >
                    {e.name} · {e.status}
                  </Link>
                ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Tasks",
                "Drive",
                "Calendar",
                "CRM",
                "Library",
                "Mailbox",
                "Tools",
              ].map((n) => (
                <Link
                  key={n}
                  className="btn btn-secondary btn-sm"
                  href={`/${n.toLowerCase()}?departmentId=${t.id}`}
                >
                  {n}
                </Link>
              ))}
              <Link
                className="btn btn-ghost btn-sm"
                href={`/departments/${t.slug}`}
              >
                Office department
              </Link>
            </div>
          </Card>
        ))}
      </div>
      {!teams.length && (
        <EmptyState
          title="No teams yet"
          description="Department management remains available from the office."
        />
      )}
    </div>
  );
}
