import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { employeeSkills, employees, skillVersions, skills, users } from "@/db/schema";
import { Card, CardTitle, DescriptionList, PageHeader, Notice } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { SkillForm } from "../skill-form";
import { newSkillVersionAction, setSkillStatusAction } from "../../knowledge/actions";
import { fmtDateTime } from "@/lib/format";
import { WORKFLOWS } from "@/lib/workflows/runner";

export const dynamic = "force-dynamic";

export default async function SkillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const s = db.select().from(skills).where(and(eq(skills.id, id), eq(skills.workspaceId, workspace.id))).get();
  if (!s) notFound();
  const versions = db.select().from(skillVersions).where(eq(skillVersions.skillId, s.id)).orderBy(desc(skillVersions.version)).all();
  const current = versions.find((v) => v.version === s.currentVersion) ?? versions[0] ?? null;
  const owner = s.ownerUserId ? db.select().from(users).where(eq(users.id, s.ownerUserId)).get() : null;
  const usedBy = db.select({ e: employees }).from(employeeSkills).innerJoin(employees, eq(employees.id, employeeSkills.employeeId)).where(eq(employeeSkills.skillId, s.id)).all();
  const wf = s.workflowKey && s.workflowKey in WORKFLOWS ? WORKFLOWS[s.workflowKey as keyof typeof WORKFLOWS] : null;
  return (
    <div className="anim-rise">
      <PageHeader eyebrow={<Link href="/skills" className="hover:underline">Skills</Link>} title={s.name} description={s.purpose} actions={<span className="flex gap-1.5"><Badge tone={s.status === "approved" ? "emerald" : s.status === "retired" ? "neutral" : "amber"}>{s.status}</Badge><Badge>v{s.currentVersion}</Badge></span>} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle description={current ? `Version ${current.version} · ${current.reviewStatus} · ${current.changeNote ?? ""}` : undefined}>Current instructions</CardTitle>
            <pre className="whitespace-pre-wrap rounded-xl bg-surface-2 p-4 font-sans text-sm leading-relaxed text-ink">{current?.instructions ?? "No version yet."}</pre>
            {current && (
              <div className="mt-4">
                <DescriptionList items={[{ label: "Inputs", value: current.inputs || "—" }, { label: "Outputs", value: current.outputs || "—" }, { label: "Required tools", value: current.requiredTools.join(", ") || "none" }, { label: "Required approvals", value: current.requiredApprovals.join(", ") }]} />
              </div>
            )}
            {wf && <div className="mt-4"><Notice tone="accent" title={`Executable: ${wf.name}`}>{wf.description} Implemented in <code className="kbd">src/lib/workflows/</code>; the instructions above document the contract and are shown to the employee.</Notice></div>}
          </Card>
          {can(role, "skill.edit") && (
            <Card>
              <CardTitle description="Creates a new version for review. This skill is unavailable to employee conversations until its current version is approved.">Propose a new version</CardTitle>
              <SkillForm skill={s} version={current} action={newSkillVersionAction.bind(null, s.id)} submitLabel={`Save as v${s.currentVersion + 1}`} />
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle>Record</CardTitle>
            <DescriptionList items={[{ label: "Owner", value: owner?.name ?? "—" }, { label: "Used by", value: usedBy.length ? usedBy.map((u) => u.e.name).join(", ") : "No employee" }, { label: "Created", value: fmtDateTime(s.createdAt) }, { label: "Updated", value: fmtDateTime(s.updatedAt) }]} />
          </Card>
          {(can(role, "skill.approve") || can(role, "skill.edit")) && (
            <Card>
              <CardTitle>Review</CardTitle>
              <div className="flex flex-wrap gap-2">
                {can(role, "skill.approve") && s.status !== "approved" && <form action={setSkillStatusAction.bind(null, s.id, "approved")}><SubmitButton size="sm" variant="success">Approve v{s.currentVersion}</SubmitButton></form>}
                {can(role, "skill.edit") && s.status === "draft" && <form action={setSkillStatusAction.bind(null, s.id, "review")}><SubmitButton size="sm" variant="secondary">Send for review</SubmitButton></form>}
                {can(role, "skill.approve") && s.status !== "retired" && <form action={setSkillStatusAction.bind(null, s.id, "retired")}><SubmitButton size="sm" variant="danger">Retire</SubmitButton></form>}
              </div>
            </Card>
          )}
          <Card>
            <CardTitle>Version history</CardTitle>
            <ol className="space-y-2 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex items-start justify-between gap-2">
                  <div><span className="font-medium text-ink">v{v.version}</span> <span className="text-ink-2">{v.changeNote ?? ""}</span><div className="text-xs text-ink-3">{fmtDateTime(v.createdAt)}</div></div>
                  <Badge tone={v.reviewStatus === "approved" ? "emerald" : "amber"}>{v.reviewStatus}</Badge>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
