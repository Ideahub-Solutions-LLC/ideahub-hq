import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { departments } from "@/db/schema";
import { listEmployees } from "@/lib/services/employees";
import { getEmployeeDevelopment } from "@/lib/services/employee-development";
import { Card, CardTitle, EmptyState, Notice, PageHeader, Stat } from "@/components/ui/card";
import { Badge, EmployeeStatusBadge } from "@/components/ui/badge";
import { AiAvatar } from "@/components/ui/ai-avatar";

export const dynamic = "force-dynamic";

export default async function EmployeeDevelopmentPage({ searchParams }: { searchParams: Promise<{ department?: string }> }) {
  const { db, workspace } = await requireWorkspace();
  const sp = await searchParams;
  const depts = db.select().from(departments).where(eq(departments.workspaceId, workspace.id)).all();
  const employees = listEmployees(db, workspace.id).filter((e) => e.status !== "archived");
  const plans = employees.map((e) => getEmployeeDevelopment(db, workspace.id, e.id)).filter((p) => p !== null);
  const visible = plans.filter((p) => !sp.department || p.department?.id === sp.department);
  const matched = plans.filter((p) => p.pack);
  return (
    <div className="anim-rise">
      <PageHeader eyebrow={<Link href="/employees" className="hover:underline">Employees</Link>} title="Develop department expertise" description="A focused development plan for each role: proposed working procedures, required sources and practice criteria. Build capability one reviewed skill at a time." actions={<Link href="/office" className="btn btn-secondary">View HQ</Link>} />
      <Notice tone="accent" title="Curriculum, not a training claim">These packs are proposed instruction templates based on the existing employee roles. Preparing them creates pending skill drafts, not trained models, new integrations or permission to act.</Notice>
      <div className="my-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Employee plans" value={`${matched.length} / ${plans.length}`} hint="Matched to current role and department" />
        <Stat label="Proposed modules" value={matched.reduce((sum, p) => sum + p.modules.length, 0)} hint="Role-specific instruction templates" />
        <Stat label="Prepared modules" value={matched.reduce((sum, p) => sum + p.modules.filter((m) => m.skill && m.assigned).length, 0)} hint="Saved and assigned; review status is separate" />
      </div>
      <form className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <label className="min-w-0 flex-1 sm:max-w-sm"><span className="label">Department</span><select name="department" defaultValue={sp.department ?? ""} className="select"><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <button type="submit" className="btn btn-secondary">Filter plans</button>
        {sp.department && <Link href="/employees/development" className="btn btn-ghost">Clear filter</Link>}
      </form>
      {visible.length === 0 ? <EmptyState title="No employee plans in this department" description="Choose another department or add an employee profile." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map(({ employee, department, pack, modules, approvedSkills, sources }) => (
            <Card key={employee.id} className="min-w-0">
              <div className="mb-4 flex items-start gap-3">
                <AiAvatar seed={employee.avatarSeed} name={employee.name} size={42} showLabel />
                <div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-ink">{employee.name}</h2><p className="text-sm text-ink-2">{employee.roleTitle}</p><div className="mt-1 flex flex-wrap gap-1.5"><Badge>{department?.name ?? "No department"}</Badge><EmployeeStatusBadge status={employee.status} /></div></div>
              </div>
              {pack ? <><p className="text-sm text-ink">{pack.focus}</p><ul className="mt-3 space-y-2 text-sm">{modules.map(({ module, skill, version, assigned }) => <li key={module.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2"><span>{module.name}</span><Badge tone={skill?.status === "approved" && version?.reviewStatus === "approved" && assigned ? "emerald" : "amber"}>{!skill ? "Proposed" : !assigned ? "Not assigned" : skill.status === "approved" && version?.reviewStatus === "approved" ? "Instructions approved" : skill.status === "retired" ? "Retired" : "Needs review"}</Badge></li>)}</ul></> : <Notice tone="amber">No matching role pack. This employee has not been assigned a generic specialty.</Notice>}
              <p className="mt-3 text-xs text-ink-2">Currently configured: {approvedSkills.length} approved skill{approvedSkills.length === 1 ? "" : "s"} · {sources.filter((s) => s.reviewStatus === "approved").length} approved assigned source{sources.filter((s) => s.reviewStatus === "approved").length === 1 ? "" : "s"}. These counts do not establish expertise.</p>
              <div className="mt-4 flex flex-wrap gap-2"><Link href={`/employees/${employee.id}/development`} className="btn btn-primary btn-sm">Develop {employee.name}</Link><Link href={`/employees/${employee.id}`} className="btn btn-ghost btn-sm">Profile</Link></div>
            </Card>
          ))}
        </div>
      )}
      <Card className="mt-6"><CardTitle>Development sequence</CardTitle><ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2"><li>Review the role scope and proposed instructions with the responsible human.</li><li>Prepare skill drafts, then approve the specific version through Skills &amp; Knowledge.</li><li>Curate and approve the required sources, grant only the necessary employee access, and resolve missing ownership.</li><li>Run supervised practice, compare outputs to the criteria, and revise instructions. Practice scenarios below are fictional and have not been run as model evaluations.</li><li>Activate an employee only after review. Sending or creating anything elsewhere still needs its separate approval path.</li></ol></Card>
    </div>
  );
}
