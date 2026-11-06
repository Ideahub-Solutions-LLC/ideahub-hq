import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { departments, knowledgeSources, memoryProposals } from "@/db/schema";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { KnowledgeTabs } from "./knowledge-tabs";
import { createSourceAction } from "./actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const rows = await db.query.knowledgeSources.findMany({ where: eq(knowledgeSources.workspaceId, workspace.id), with: { owner: true, department: true }, orderBy: [desc(knowledgeSources.updatedAt)] });
  const depts = db.select().from(departments).where(eq(departments.workspaceId, workspace.id)).all();
  const pendingMem = db.select({ n: sql<number>`count(*)` }).from(memoryProposals).where(and(eq(memoryProposals.workspaceId, workspace.id), eq(memoryProposals.status, "proposed"))).get()?.n ?? 0;
  return (
    <div className="anim-rise">
      <PageHeader eyebrow="Skills & knowledge" title="Knowledge sources" description="Approved company and department knowledge with ownership, versions, source and review status. Employees only ever retrieve approved sources they were granted." />
      <Flash ok={sp.ok} error={sp.error} />
      <KnowledgeTabs current="/knowledge" counts={{ memory: pendingMem }} />
      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-6"><EmptyState title="No knowledge sources yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Title</th><th>Type</th><th>Department</th><th>Owner</th><th>Version</th><th>Review</th><th>Last verified</th></tr></thead>
              <tbody>
                {rows.map((k) => (
                  <tr key={k.id}>
                    <td><Link href={`/knowledge/${k.id}`} className="font-medium text-ink hover:underline">{k.title}</Link><div className="text-xs text-ink-3">{k.sourceRef ?? "no source reference"}</div></td>
                    <td className="text-ink-2">{k.type.replace(/_/g, " ")}</td>
                    <td className="text-ink-2">{k.department?.name ?? "Workspace"}</td>
                    <td className="text-ink-2">{k.owner?.name ?? "—"}</td>
                    <td className="text-ink-2">v{k.version}</td>
                    <td><Badge tone={k.reviewStatus === "approved" ? "emerald" : k.reviewStatus === "stale" ? "rose" : k.reviewStatus === "rejected" ? "rose" : "amber"}>{k.reviewStatus}</Badge></td>
                    <td className="text-ink-3">{fmtDate(k.lastVerifiedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {can(role, "knowledge.edit") && (
        <Card className="mt-6">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-ink">Add a knowledge source (paste text; file upload and URL crawling are planned)</summary>
            <form action={createSourceAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" required className="input" /></div>
              <div>
                <label className="label" htmlFor="type">Type</label>
                <select id="type" name="type" className="select" defaultValue="document">
                  <option value="document">Document</option><option value="procedure">Procedure</option><option value="meeting_record">Meeting record</option><option value="note">Note</option><option value="url">URL (reference only)</option>
                </select>
              </div>
              <div><label className="label" htmlFor="sourceRef">Source reference</label><input id="sourceRef" name="sourceRef" className="input" placeholder="Where this came from (system, date, owner)" /></div>
              <div>
                <label className="label" htmlFor="departmentId">Department</label>
                <select id="departmentId" name="departmentId" className="select" defaultValue=""><option value="">Workspace-wide</option>{depts.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}</select>
              </div>
              <div className="sm:col-span-2"><label className="label" htmlFor="content">Content (treated as untrusted data by employees — instructions inside it are ignored)</label><textarea id="content" name="content" required className="textarea min-h-[10rem]" /></div>
              <div className="sm:col-span-2 flex justify-end"><SubmitButton>Add as pending</SubmitButton></div>
            </form>
          </details>
        </Card>
      )}
    </div>
  );
}
