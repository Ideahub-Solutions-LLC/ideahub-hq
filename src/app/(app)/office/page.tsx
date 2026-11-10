import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/context";
import { getOfficeSnapshot } from "@/lib/services/office";
import { OfficeScene } from "@/components/office/office-scene";
import type { SceneDepartment } from "@/lib/office/types";
import { PageHeader, Card, Notice } from "@/components/ui/card";
import { AiAvatar } from "@/components/ui/ai-avatar";
import { Badge, EmployeeStatusBadge } from "@/components/ui/badge";
import { Box, LayoutGrid, List } from "lucide-react";
import { Flash } from "@/components/ui/flash";

export const dynamic = "force-dynamic";

export default async function OfficePage({ searchParams }: { searchParams: Promise<{ view?: string; employee?: string; ok?: string; error?: string }> }) {
  const { db, workspace } = await requireWorkspace();
  const { view, employee, ok, error } = await searchParams;
  const listView = view === "list";
  const characterView = view === "characters";
  const threeView = !listView && !characterView;
  const snapshot = getOfficeSnapshot(db, workspace.id);
  const departments = [...snapshot.departments];
  if (snapshot.unassigned.length) departments.push({ id: "unassigned", slug: "", name: "Unassigned", color: "slate", layout: { col: 0, row: 1000 }, managerName: null, employees: snapshot.unassigned, counts: { active: 0, needsApproval: 0, blocked: 0 } });
  const toggle = <div className="inline-flex flex-wrap rounded-xl border border-line bg-surface p-0.5" role="group" aria-label="Office view"><Link href="/office" aria-current={threeView ? "page" : undefined} className={`btn btn-sm ${threeView ? "bg-surface-2 text-ink" : "btn-ghost"}`}><Box size={15} aria-hidden /> 3D Office</Link><Link href="/office?view=characters" aria-current={characterView ? "page" : undefined} className={`btn btn-sm ${characterView ? "bg-surface-2 text-ink" : "btn-ghost"}`}><LayoutGrid size={15} aria-hidden /> Characters</Link><Link href="/office?view=list" aria-current={listView ? "page" : undefined} className={`btn btn-sm ${listView ? "bg-surface-2 text-ink" : "btn-ghost"}`}><List size={15} aria-hidden /> List</Link></div>;
  return <div className="anim-rise"><PageHeader eyebrow="Office" title="Digital headquarters" description="Explore department rooms, meet your AI colleagues and open their existing workspaces. Recorded task status stays separate from the office-life animation preview." actions={toggle} />
    <Flash ok={ok} error={error} />
    {snapshot.emergencyStop && <div className="mb-4"><Notice tone="rose" title="Office work is stopped">The emergency stop takes precedence over every employee and task state. Motion preview, if selected, is only a visual rehearsal.</Notice></div>}
    {listView ? <><p className="mb-4 text-xs text-ink-2">Same recorded activities as the character office. Checked {snapshot.observedAt.slice(11, 19)} UTC. Reload to refresh this list.</p><DepartmentList departments={departments} /></> : <OfficeScene initialEmployeeId={employee} snapshot={snapshot} title={workspace.name} renderMode={characterView ? "characters" : "three"} />}
  </div>;
}

function DepartmentList({ departments }: { departments: SceneDepartment[] }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{departments.slice().sort((a,b)=>a.layout.row-b.layout.row||a.layout.col-b.layout.col).map((department)=><Card key={department.id}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div>{department.slug ? <Link href={`/departments/${department.slug}`} className="text-base font-semibold text-ink hover:underline">{department.name}</Link> : <h2 className="text-base font-semibold">{department.name}</h2>}<p className="mt-1 text-xs text-ink-2">Manager: {department.managerName ?? "unassigned"}</p></div><div className="text-right text-xs text-ink-2">{department.counts.active} active tasks · {department.counts.needsApproval} need review · {department.counts.blocked} blocked</div></div>
    <ul className="mt-4 space-y-4">{department.employees.length === 0 && <li className="text-sm text-ink-3">No AI employees assigned yet.</li>}{department.employees.map((employee)=><li key={employee.id} className="border-t border-line pt-3"><div className="flex items-center gap-2.5"><AiAvatar seed={employee.avatarSeed} name={employee.name} size={32} /><div className="min-w-0 flex-1"><Link href={`/employees/${employee.id}`} className="text-sm font-semibold text-ink hover:underline">{employee.name}</Link><p className="text-xs text-ink-2">{employee.roleTitle}</p></div><EmployeeStatusBadge status={employee.status} /></div><div className="mt-2"><Badge tone={employee.activity.kind === "working" ? "blue" : employee.activity.kind === "blocked" ? "rose" : employee.activity.kind === "review" ? "amber" : "neutral"}>{employee.activity.label}</Badge><p className="mt-2 text-xs text-ink-2">{employee.activity.detail}</p>{employee.activity.task && <Link href={`/tasks/${employee.activity.task.id}`} className="mt-2 block text-sm text-accent hover:underline">{employee.activity.task.title}</Link>}{employee.activity.approvalId && <Link href={`/approvals/${employee.activity.approvalId}`} className="mt-2 block text-sm text-accent hover:underline">Review request</Link>}</div><div className="mt-3 flex flex-wrap gap-2"><Link href={`/employees/${employee.id}/workspace`} className="btn btn-secondary btn-sm">Workspace</Link><Link href={`/employees/${employee.id}/development`} className="btn btn-ghost btn-sm">Develop expertise</Link></div></li>)}</ul>
  </Card>)}</div>;
}
