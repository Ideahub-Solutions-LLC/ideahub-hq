import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { getEmployeeDevelopment } from "@/lib/services/employee-development";
import { resolveProvider } from "@/lib/providers";
import { WORKFLOWS } from "@/lib/workflows/runner";
import { Card, CardTitle, DescriptionList, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { Badge, EmployeeStatusBadge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { prepareDevelopmentAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DevelopmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const plan = getEmployeeDevelopment(db, workspace.id, id);
  if (!plan) notFound();
  const { employee, department, pack, modules, approvedSkills, sources, managerReady } = plan;
  const prepared = modules.length > 0 && modules.every((m) => m.skill && m.assigned);
  const provider = resolveProvider(employee.modelConfig);
  const executable = approvedSkills.filter(({ skill }) => skill.workflowKey && skill.workflowKey in WORKFLOWS);
  const canPrepare = can(role, "employee.edit") && can(role, "skill.edit") && employee.status !== "archived";
  return (
    <div className="anim-rise">
      <PageHeader eyebrow={<Link href="/employees/development" className="hover:underline">Department expertise</Link>} title={`Develop ${employee.name}`} description={`${employee.roleTitle} · ${department?.name ?? "No department"}`} actions={<><Link href={`/employees/${id}`} className="btn btn-secondary">Employee profile</Link><Link href={`/employees/${id}/workspace`} className="btn btn-ghost">Workspace</Link></>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-5"><Notice tone="accent" title="A role-specific development plan">The curriculum is a proposal, not evidence of expertise. Skills are instruction configuration, not model training. Draft preparation does not activate {employee.name}, approve sources, connect services or expand permissions.</Notice></div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {pack ? <>
            <Card><CardTitle description={`Curriculum v${pack.version} · based on the existing role and department`}>Specialty &amp; boundaries</CardTitle><p className="text-sm text-ink">{pack.focus}</p><h3 className="mb-2 mt-4 text-sm font-semibold">Competencies to develop</h3><ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{pack.competencies.map((c) => <li key={c}>{c}</li>)}</ul><h3 className="mb-2 mt-4 text-sm font-semibold">Keep with a human</h3><ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{pack.boundaries.map((b) => <li key={b}>{b}</li>)}</ul><p className="mt-4 text-xs text-ink-3">Basis: {pack.sourceBasis}</p></Card>
            <Card><CardTitle description="Creates separate pending, versioned skills and adds assignments. Existing skills, instructions and employee settings are preserved.">Prepare the skill pack</CardTitle>
              {canPrepare ? <form action={prepareDevelopmentAction.bind(null, id)}><SubmitButton disabled={prepared} pendingText="Preparing drafts…">{prepared ? "Skill drafts already prepared" : `Prepare ${modules.length} skill drafts`}</SubmitButton></form> : <p className="text-sm text-ink-2">{employee.status === "archived" ? "Archived employees cannot prepare new skill packs." : "An owner, admin or manager can prepare these drafts."}</p>}
              <p className="mt-3 text-xs text-ink-2">An owner or admin must approve each skill version. Approval makes the instructions available to an active employee; it does not verify the quality of future answers.</p>
            </Card>
            {modules.map(({ module, skill, version, assigned }, index) => <Card key={module.key} className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2"><Badge>Module {index + 1}</Badge><Badge tone={skill?.status === "approved" && version?.reviewStatus === "approved" && assigned ? "emerald" : "amber"}>{!skill ? "Proposed template" : !assigned ? "Not assigned" : skill.status === "approved" && version?.reviewStatus === "approved" ? "Instructions approved" : skill.status === "retired" ? "Retired" : "Pending skill review"}</Badge><Badge>{module.key === "marketing-brand-outline" ? "Content workflow available" : "Instruction-only"}</Badge></div>
              <CardTitle description={module.purpose}>{module.name}</CardTitle>
              <DescriptionList items={[{ label: "Required input", value: module.inputs }, { label: "Expected output", value: module.outputs }]} />
              <h3 className="mb-2 mt-4 text-sm font-semibold">Sources the reviewer must verify</h3><ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{module.sourceRequirements.map((s) => <li key={s}>{s}</li>)}</ul>
              <p className="mt-2 text-xs text-ink-3">Not automatically matched to your assigned sources. Confirm each source is current, approved and sufficient.</p>
              <details className="mt-4 rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium text-ink">Read proposed working instructions</summary><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink-2">{module.instructions}</pre></details>
              {skill && <div className="mt-3"><Link href={`/skills/${skill.id}`} className="btn btn-secondary btn-sm">Review saved skill v{skill.currentVersion}</Link><p className="mt-2 text-xs text-ink-3">The saved skill may include later human edits. The template above is the original curriculum proposal.</p></div>}
              <h3 className="mb-2 mt-5 text-sm font-semibold">Supervised practice</h3><p className="mb-3 text-xs text-ink-3">Fictional exercises, not executed evaluations. A reviewer should record the actual output and evidence before judging readiness.</p>
              <div className="space-y-2">{module.practiceCases.map((practice) => <details key={practice.title} className="rounded-xl bg-surface-2 p-3"><summary className="cursor-pointer text-sm font-medium text-ink">{practice.title}</summary><p className="mt-2 text-sm text-ink-2">{practice.scenario}</p><h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Review criteria</h4><ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{practice.expected.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></details>)}</div>
            </Card>)}
          </> : <EmptyState title="No matching curriculum yet" description="This role and department do not match a defined specialty. Review the employee profile before preparing a new role-specific pack." />}
        </div>
        <div className="min-w-0 space-y-5">
          <Card><CardTitle>Actual configuration</CardTitle><DescriptionList items={[{ label: "Employee", value: <EmployeeStatusBadge status={employee.status} /> }, { label: "Manager membership", value: managerReady ? "Owner, admin or manager assigned" : "Needs review" }, { label: "Effective provider", value: provider.adapter.key === "demo" ? "Offline Demo" : `${provider.adapter.key} configured (not tested here)` }, { label: "Employee version", value: `v${employee.configVersion}` }]} /><p className="mt-3 text-xs text-ink-2">Draft and paused employees cannot run work. No performance evaluation is claimed by this page.</p></Card>
          <Card><CardTitle description="Approved current versions assigned to this employee.">Current skills</CardTitle>{approvedSkills.length ? <ul className="space-y-3">{approvedSkills.map(({ skill, version }) => <li key={skill.id}><Link href={`/skills/${skill.id}`} className="text-sm text-accent hover:underline">{skill.name}</Link><p className="text-xs text-ink-2">v{version.version} · {skill.workflowKey && skill.workflowKey in WORKFLOWS ? "Implemented draft workflow" : "Conversation instructions only"}</p></li>)}</ul> : <p className="text-sm text-ink-2">No approved current skill versions assigned.</p>}<p className="mt-4 text-xs text-ink-3">{executable.length} implemented workflow{executable.length === 1 ? "" : "s"} configured. The marketing content module can run the brief-to-draft workflow once approved; other modules remain instruction-only.</p></Card>
          <Card><CardTitle description="Approval is not a guarantee that a source covers this specialty.">Assigned knowledge</CardTitle>{sources.length ? <ul className="space-y-3">{sources.map((s) => <li key={s.id}><Link href={`/knowledge/${s.id}`} className="break-words text-sm text-accent hover:underline">{s.title}</Link><div className="mt-1 flex flex-wrap gap-1"><Badge tone={s.reviewStatus === "approved" ? "emerald" : "amber"}>{s.reviewStatus}</Badge><Badge>v{s.version}</Badge></div></li>)}</ul> : <p className="text-sm text-ink-2">No sources assigned. Curate evidence before running specialty work.</p>}{can(role, "employee.edit") && <Link href={`/employees/${id}/edit?tab=knowledge`} className="btn btn-secondary btn-sm mt-4">Review source access</Link>}</Card>
        </div>
      </div>
    </div>
  );
}
