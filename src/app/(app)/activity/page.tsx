import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { auditEvents, taskEvents, tasks } from "@/db/schema";
import { can } from "@/lib/authz";
import { PageHeader, Card, CardTitle, EmptyState } from "@/components/ui/card";
import { timeAgo } from "@/lib/format";
export default async function ActivityPage() {
  const ctx = await requireWorkspace();
  const events = ctx.db
    .select({ event: taskEvents, task: tasks })
    .from(taskEvents)
    .innerJoin(
      tasks,
      and(
        eq(tasks.id, taskEvents.taskId),
        eq(tasks.workspaceId, ctx.workspace.id),
      ),
    )
    .where(eq(taskEvents.workspaceId, ctx.workspace.id))
    .orderBy(desc(taskEvents.createdAt))
    .limit(100)
    .all();
  const audit = can(ctx.role, "admin.audit.view")
    ? ctx.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.workspaceId, ctx.workspace.id))
        .orderBy(desc(auditEvents.createdAt))
        .limit(50)
        .all()
    : [];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitor"
        title="Activity"
        description="Actual saved task events and authorized workspace audit history."
      />
      <Card>
        <CardTitle>Latest task activity</CardTitle>
        <div className="divide-y divide-line">
          {events.map(({ event, task }) => (
            <article key={event.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/tasks/${task.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {task.title}
                </Link>
                <time className="text-xs text-ink-3" dateTime={event.createdAt}>
                  {timeAgo(event.createdAt)}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-2">
                {event.message}
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {event.actorType} · {event.kind.replaceAll("_", " ")}
              </p>
            </article>
          ))}
        </div>
        {!events.length && <EmptyState title="No task activity yet" />}
      </Card>
      {can(ctx.role, "admin.audit.view") && (
        <Card>
          <CardTitle
            action={
              <Link className="text-sm text-accent" href="/admin/audit">
                Full audit log →
              </Link>
            }
          >
            Workspace changes
          </CardTitle>
          <div className="divide-y divide-line">
            {audit.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
              >
                <span>
                  {a.action.replaceAll("_", " ")}{" "}
                  <span className="text-ink-3">
                    · {a.entityType.replaceAll("_", " ")}
                  </span>
                </span>
                <time className="text-xs text-ink-3" dateTime={a.createdAt}>
                  {timeAgo(a.createdAt)}
                </time>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
