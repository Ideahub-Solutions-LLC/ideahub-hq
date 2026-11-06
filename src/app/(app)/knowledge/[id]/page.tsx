import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { departments, employeeKnowledge, employees, knowledgeSources, users } from "@/db/schema";
import { Card, CardTitle, DescriptionList, PageHeader, Notice } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { setSourceReviewAction, updateSourceAction } from "../actions";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function KnowledgeSourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const k = db.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.workspaceId, workspace.id))).get();
  if (!k) notFound();
  const owner = k.ownerUserId ? db.select().from(users).where(eq(users.id, k.ownerUserId)).get() : null;
  const depts = db.select().from(departments).where(eq(departments.workspaceId, workspace.id)).all();
  const usedBy = db.select({ e: employees }).from(employeeKnowledge).innerJoin(employees, eq(employees.id, employeeKnowledge.employeeId)).where(eq(employeeKnowledge.knowledgeSourceId, k.id)).all();
  const lines = k.content.split(/\r?\n/);
  return (
    <div className="anim-rise">
      <PageHeader eyebrow={<Link href="/knowledge" className="hover:underline">Knowledge sources</Link>} title={k.title} description={k.sourceRef ?? undefined} actions={<Badge tone={k.reviewStatus === "approved" ? "emerald" : k.reviewStatus === "stale" ? "rose" : "amber"}>{k.reviewStatus}</Badge>} />
      <Flash ok={sp.ok} error={sp.error} />
      {k.reviewStatus !== "approved" && <div className="mb-4"><Notice tone="amber">This source is {k.reviewStatus}. Employees cannot retrieve it or run workflows on it until it is approved.</Notice></div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle description="Line numbers match the source references in drafts.">Content</CardTitle>
            <ol className="max-h-[36rem] overflow-y-auto rounded-xl border border-line bg-surface-2 p-3 font-mono text-xs leading-6 scrollbar-thin">
              {lines.map((l, i) => (
                <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-2"><span className="select-none text-right text-ink-3">{i + 1}</span><span className="whitespace-pre-wrap text-ink">{l || " "}</span></li>
              ))}
            </ol>
          </Card>
          {can(role, "knowledge.edit") && (
            <Card>
              <CardTitle description="Content edits create a new version and reset review to pending.">Edit</CardTitle>
              <form action={updateSourceAction.bind(null, k.id)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" required defaultValue={k.title} className="input" /></div>
                <div>
                  <label className="label" htmlFor="type">Type</label>
                  <select id="type" name="type" className="select" defaultValue={k.type}>
                    <option value="document">Document</option><option value="procedure">Procedure</option><option value="meeting_record">Meeting record</option><option value="note">Note</option><option value="url">URL (reference only)</option>
                  </select>
                </div>
                <div><label className="label" htmlFor="sourceRef">Source reference</label><input id="sourceRef" name="sourceRef" defaultValue={k.sourceRef ?? ""} className="input" /></div>
                <div>
                  <label className="label" htmlFor="departmentId">Department</label>
                  <select id="departmentId" name="departmentId" className="select" defaultValue={k.departmentId ?? ""}><option value="">Workspace-wide</option>{depts.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}</select>
                </div>
                <div className="sm:col-span-2"><label className="label" htmlFor="content">Content</label><textarea id="content" name="content" required defaultValue={k.content} className="textarea min-h-[12rem] font-mono text-xs" /></div>
                <div className="sm:col-span-2 flex justify-end"><SubmitButton>Save</SubmitButton></div>
              </form>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle>Record</CardTitle>
            <DescriptionList items={[{ label: "Type", value: k.type.replace(/_/g, " ") }, { label: "Owner", value: owner?.name ?? "—" }, { label: "Version", value: `v${k.version}` }, { label: "Last verified", value: fmtDateTime(k.lastVerifiedAt) }, { label: "Updated", value: fmtDateTime(k.updatedAt) }, { label: "Used by", value: usedBy.length ? usedBy.map((u) => u.e.name).join(", ") : "No employee" }]} />
          </Card>
          {can(role, "knowledge.approve") && (
            <Card>
              <CardTitle description="Approval records who verified this content and when.">Review</CardTitle>
              <div className="flex flex-wrap gap-2">
                {k.reviewStatus !== "approved" && <form action={setSourceReviewAction.bind(null, k.id, "approved")}><SubmitButton size="sm" variant="success">Approve</SubmitButton></form>}
                {k.reviewStatus !== "stale" && <form action={setSourceReviewAction.bind(null, k.id, "stale")}><SubmitButton size="sm" variant="secondary">Mark stale</SubmitButton></form>}
                {k.reviewStatus !== "rejected" && <form action={setSourceReviewAction.bind(null, k.id, "rejected")}><SubmitButton size="sm" variant="danger">Reject</SubmitButton></form>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
