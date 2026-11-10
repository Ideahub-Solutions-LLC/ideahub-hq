import Link from "next/link";
import { and, eq, ne } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { employees } from "@/db/schema";
import { PageHeader, Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export default async function ChatPage() {
  const ctx = await requireWorkspace();
  const staff = ctx.db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, ctx.workspace.id),
        ne(employees.status, "archived"),
      ),
    )
    .all();
  return (
    <div>
      <PageHeader
        eyebrow="Work"
        title="Chat"
        description="Open an employee’s workspace to ask questions and discuss their assigned work."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {staff.map((e) => (
          <Card key={e.id}>
            <CardTitle action={<Badge>{e.status}</Badge>}>{e.name}</CardTitle>
            <p className="text-sm text-ink-2">{e.roleTitle}</p>
            <p className="mt-2 line-clamp-3 text-xs text-ink-3">{e.bio}</p>
            <Link
              className="btn btn-secondary mt-4"
              href={`/employees/${e.id}/workspace`}
            >
              Open workspace
            </Link>
          </Card>
        ))}
      </div>
      <p className="mt-5 text-xs text-ink-3">
        Replies use each employee’s configured provider. Offline Demo mode and
        readiness checks remain visible in their workspace.
      </p>
    </div>
  );
}
