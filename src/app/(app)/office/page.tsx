import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { approvals, departments, employees, tasks, users } from "@/db/schema";
import { OfficeScene, type SceneDepartment } from "@/components/office/office-scene";
import { PageHeader, Card } from "@/components/ui/card";
import { AiAvatar } from "@/components/ui/ai-avatar";
import { EmployeeStatusBadge } from "@/components/ui/badge";
import { LayoutGrid, List } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OfficePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { db, workspace } = await requireWorkspace();
  const { view } = await searchParams;
  const listView = view === "list";
  const depts = db.select().from(departments).where(eq(departments.workspaceId, workspace.id)).all();
  const staff = db.select().from(employees).where(eq(employees.workspaceId, workspace.id)).all();
  const taskRows = db.select().from(tasks).where(eq(tasks.workspaceId, workspace.id)).all();
  const pendingApprovals = db.select().from(approvals).where(eq(approvals.workspaceId, workspace.id)).all().filter((a) => a.status === "pending");
  const people = db.select({ id: users.id, name: users.name }).from(users).all();
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  const workingEmployeeIds = new Set(taskRows.filter((t) => t.status === "working" && t.employeeId).map((t) => t.employeeId));

  const scene: SceneDepartment[] = depts.map((d) => {
    const dTasks = taskRows.filter((t) => t.departmentId === d.id);
    return {
      id: d.id,
      slug: d.slug,
      name: d.name,
      color: d.color,
      layout: d.layout,
      managerName: nameOf(d.managerUserId),
      employees: staff.filter((e) => e.departmentId === d.id && e.status !== "archived").map((e) => ({ id: e.id, name: e.name, status: e.status, avatarSeed: e.avatarSeed, roleTitle: e.roleTitle, working: workingEmployeeIds.has(e.id) })),
      counts: {
        active: dTasks.filter((t) => t.status === "working" || t.status === "queued").length,
        needsApproval: dTasks.filter((t) => t.status === "needs_approval").length + pendingApprovals.filter((a) => dTasks.some((t) => t.id === a.taskId) && !dTasks.some((t) => t.id === a.taskId && t.status === "needs_approval")).length,
        blocked: dTasks.filter((t) => t.status === "blocked" || t.status === "failed").length,
      },
    };
  });

  const toggle = (
    <div className="inline-flex rounded-xl border border-line bg-surface p-0.5" role="group" aria-label="Office view">
      <Link href="/office" aria-current={!listView ? "page" : undefined} className={`btn btn-sm ${!listView ? "bg-surface-2 text-ink" : "btn-ghost"}`}>
        <LayoutGrid size={15} aria-hidden /> Scene
      </Link>
      <Link href="/office?view=list" aria-current={listView ? "page" : undefined} className={`btn btn-sm ${listView ? "bg-surface-2 text-ink" : "btn-ghost"}`}>
        <List size={15} aria-hidden /> List
      </Link>
    </div>
  );

  return (
    <div className="anim-rise">
      <PageHeader eyebrow="Office" title="Digital headquarters" description="Departments, who sits where, and live status. The scene is a navigation layer — the list view shows exactly the same information." actions={toggle} />
      {!listView && (
        <div className="hidden md:block">
          <OfficeScene departments={scene} title={workspace.name} />
        </div>
      )}
      <div className={listView ? "" : "md:hidden"}>
        {!listView && <p className="mb-3 text-xs text-ink-3">The isometric scene is shown on larger screens; here is the same office as a list.</p>}
        <DepartmentList departments={scene} />
      </div>
      {!listView && (
        <div className="mt-6 hidden md:block">
          <DepartmentList departments={scene} compact />
        </div>
      )}
    </div>
  );
}

function DepartmentList({ departments: list, compact }: { departments: SceneDepartment[]; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${compact ? "md:grid-cols-3" : "sm:grid-cols-2"}`}>
      {list
        .slice()
        .sort((a, b) => a.layout.row - b.layout.row || a.layout.col - b.layout.col)
        .map((d) => (
          <Card key={d.id} className="card-hover">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/departments/${d.slug}`} className="text-base font-semibold text-ink hover:underline">
                  {d.name}
                </Link>
                <div className="mt-0.5 text-xs text-ink-2">Manager: {d.managerName ?? "unassigned"}</div>
              </div>
              <div className="text-right text-xs text-ink-2">
                <div>{d.counts.active} active</div>
                {d.counts.needsApproval > 0 && <div className="text-amber">{d.counts.needsApproval} need approval</div>}
                {d.counts.blocked > 0 && <div className="text-rose">{d.counts.blocked} blocked</div>}
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {d.employees.length === 0 && <li className="text-sm text-ink-3">No AI employees assigned yet.</li>}
              {d.employees.map((e) => (
                <li key={e.id} className="flex items-center gap-2.5">
                  <AiAvatar seed={e.avatarSeed} name={e.name} size={28} />
                  <Link href={`/employees/${e.id}`} className="min-w-0 flex-1 truncate text-sm text-ink hover:underline">
                    {e.name} <span className="text-ink-3">· {e.roleTitle}</span>
                  </Link>
                  {e.working ? <span className="badge bg-accent-soft text-accent">Working</span> : <EmployeeStatusBadge status={e.status} />}
                </li>
              ))}
            </ul>
          </Card>
        ))}
    </div>
  );
}
