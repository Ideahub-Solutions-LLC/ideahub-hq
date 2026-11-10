import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { departments, employees, knowledgeSources, tasks, users } from "@/db/schema";
import { Card, CardTitle, DescriptionList, EmptyState, PageHeader } from "@/components/ui/card";
import { AiAvatar } from "@/components/ui/ai-avatar";
import { Badge, EmployeeStatusBadge, TaskStatusBadge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DepartmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { db, workspace } = await requireWorkspace();
  const { slug } = await params;
  const dept = db.select().from(departments).where(and(eq(departments.workspaceId, workspace.id), eq(departments.slug, slug))).get();
  if (!dept) notFound();
  const manager = dept.managerUserId ? db.select().from(users).where(eq(users.id, dept.managerUserId)).get() : null;
  const staff = db.select().from(employees).where(and(eq(employees.workspaceId, workspace.id), eq(employees.departmentId, dept.id))).all();
  const deptTasks = await db.query.tasks.findMany({ where: and(eq(tasks.workspaceId, workspace.id), eq(tasks.departmentId, dept.id)), with: { employee: true, owner: true }, orderBy: [desc(tasks.updatedAt)] });
  const knowledge = db.select().from(knowledgeSources).where(and(eq(knowledgeSources.workspaceId, workspace.id), eq(knowledgeSources.departmentId, dept.id))).all();

  return (
    <div className="anim-rise">
      <PageHeader eyebrow={<Link href="/office" className="hover:underline">Office</Link>} title={dept.name} description={dept.purpose} actions={<Link href={`/employees/development?department=${dept.id}`} className="btn btn-secondary">Develop department expertise</Link>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle>AI employees</CardTitle>
            {staff.length === 0 ? (
              <EmptyState title="No AI employees in this department" action={<Link href="/employees/new" className="btn btn-secondary btn-sm">Add an employee profile</Link>} />
            ) : (
              <ul className="divide-y divide-line">
                {staff.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <AiAvatar seed={e.avatarSeed} name={e.name} size={38} showLabel />
                    <div className="min-w-0 flex-1">
                      <Link href={`/employees/${e.id}`} className="text-sm font-medium text-ink hover:underline">
                        {e.name}
                      </Link>
                      <div className="text-xs text-ink-2">{e.roleTitle}{e.isPilot ? " · pilot" : ""}</div>
                    </div>
                    <EmployeeStatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle action={<Link href="/tasks" className="text-sm text-accent hover:underline">All tasks →</Link>}>Tasks</CardTitle>
            {deptTasks.length === 0 ? (
              <EmptyState title="No tasks in this department" />
            ) : (
              <ul className="divide-y divide-line">
                {deptTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/tasks/${t.id}`} className="block truncate text-sm font-medium text-ink hover:underline">
                        {t.title}
                      </Link>
                      <div className="text-xs text-ink-2">
                        {t.employee ? `${t.employee.name} (AI)` : t.owner?.name ?? "Unassigned"} · updated {timeAgo(t.updatedAt)}
                      </div>
                    </div>
                    <TaskStatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle>About</CardTitle>
            <DescriptionList items={[{ label: "Manager", value: manager?.name ?? "Unassigned" }, { label: "Employees", value: staff.length }, { label: "Open tasks", value: deptTasks.filter((t) => t.status !== "completed").length }]} />
          </Card>
          <Card>
            <CardTitle action={<Link href="/knowledge" className="text-sm text-accent hover:underline">Manage →</Link>}>Shared knowledge</CardTitle>
            {knowledge.length === 0 ? (
              <EmptyState title="No department knowledge yet" />
            ) : (
              <ul className="space-y-2">
                {knowledge.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/knowledge/${k.id}`} className="min-w-0 truncate text-ink hover:underline">
                      {k.title}
                    </Link>
                    <Badge tone={k.reviewStatus === "approved" ? "emerald" : k.reviewStatus === "stale" ? "rose" : "amber"}>{k.reviewStatus}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
