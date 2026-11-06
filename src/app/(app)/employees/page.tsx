import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/context";
import { listEmployees } from "@/lib/services/employees";
import { can } from "@/lib/authz";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { AiAvatar } from "@/components/ui/ai-avatar";
import { Badge, EmployeeStatusBadge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { EMPLOYEE_STATUSES } from "@/db/schema";
import { EMPLOYEE_STATUS_LABEL } from "@/lib/format";
import { departments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Plus, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; department?: string; status?: string; role?: string; ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const all = listEmployees(db, workspace.id);
  const depts = db.select().from(departments).where(eq(departments.workspaceId, workspace.id)).all();
  const q = (sp.q ?? "").toLowerCase();
  const filtered = all.filter((e) => {
    if (q && !`${e.name} ${e.roleTitle} ${e.bio}`.toLowerCase().includes(q)) return false;
    if (sp.department && e.departmentId !== sp.department) return false;
    if (sp.status && e.status !== sp.status) return false;
    if (sp.role && !e.roleTitle.toLowerCase().includes(sp.role.toLowerCase())) return false;
    return true;
  });
  return (
    <div className="anim-rise">
      <PageHeader
        eyebrow="Directory"
        title="AI employees"
        description="Every AI employee is a durable record: identity, skills, knowledge, permissions and model settings are kept separately and versioned."
        actions={can(role, "employee.create") ? <Link href="/employees/new" className="btn btn-primary"><Plus size={16} aria-hidden /> New employee</Link> : undefined}
      />
      <Flash ok={sp.ok} error={sp.error} />
      <form className="card mb-5 grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]" role="search">
        <label className="relative">
          <span className="sr-only">Search by name or role</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name, role, bio…" className="input pl-9" />
        </label>
        <select name="department" defaultValue={sp.department ?? ""} className="select" aria-label="Department">
          <option value="">All departments</option>
          {depts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="select" aria-label="Status">
          <option value="">Any status</option>
          {EMPLOYEE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {EMPLOYEE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input name="role" defaultValue={sp.role ?? ""} placeholder="Role contains…" className="input" aria-label="Role" />
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
      </form>
      {filtered.length === 0 ? (
        <EmptyState title="No employees match" description="Try clearing a filter." action={<Link href="/employees" className="btn btn-secondary btn-sm">Clear filters</Link>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <Card key={e.id} className="card-hover">
              <div className="flex items-start gap-3">
                <AiAvatar seed={e.avatarSeed} name={e.name} size={48} showLabel />
                <div className="min-w-0 flex-1">
                  <Link href={`/employees/${e.id}`} className="block truncate text-base font-semibold text-ink hover:underline">
                    {e.name}
                  </Link>
                  <div className="truncate text-sm text-ink-2">{e.roleTitle}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <EmployeeStatusBadge status={e.status} />
                    {e.isPilot && <Badge tone="teal">Pilot</Badge>}
                    <Badge>{e.seniority}</Badge>
                  </div>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-ink-2">{e.bio}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-ink-3">Department</dt>
                  <dd className="text-ink">{e.department?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Human manager</dt>
                  <dd className="text-ink">{e.manager?.name ?? "Unassigned"}</dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-2">
                <Link href={`/employees/${e.id}`} className="btn btn-secondary btn-sm">
                  Profile
                </Link>
                <Link href={`/employees/${e.id}/workspace`} className="btn btn-ghost btn-sm">
                  Workspace
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
