import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { employeeSkills, memoryProposals, skills } from "@/db/schema";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { KnowledgeTabs } from "../knowledge/knowledge-tabs";
import { Plus } from "lucide-react";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SkillsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const rows = await db.query.skills.findMany({ where: eq(skills.workspaceId, workspace.id), with: { owner: true }, orderBy: [desc(skills.updatedAt)] });
  const usage = db.select({ skillId: employeeSkills.skillId, n: sql<number>`count(*)` }).from(employeeSkills).where(eq(employeeSkills.workspaceId, workspace.id)).groupBy(employeeSkills.skillId).all();
  const pendingMem = db.select({ n: sql<number>`count(*)` }).from(memoryProposals).where(and(eq(memoryProposals.workspaceId, workspace.id), eq(memoryProposals.status, "proposed"))).get()?.n ?? 0;
  return (
    <div className="anim-rise">
      <PageHeader eyebrow="Skills & knowledge" title="Skills" description="Versioned procedures with an owner, a contract (inputs, outputs, tools, required approvals) and a review status. Executable skills link to a workflow in code." actions={can(role, "skill.edit") ? <Link href="/skills/new" className="btn btn-primary"><Plus size={16} aria-hidden /> New skill</Link> : undefined} />
      <Flash ok={sp.ok} error={sp.error} />
      <KnowledgeTabs current="/skills" counts={{ memory: pendingMem }} />
      {rows.length === 0 ? (
        <Card><EmptyState title="No skills yet" /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((s) => (
            <Card key={s.id} className="card-hover">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/skills/${s.id}`} className="text-base font-semibold text-ink hover:underline">{s.name}</Link>
                  <p className="mt-1 text-sm text-ink-2">{s.purpose}</p>
                </div>
                <div className="flex flex-col items-end gap-1"><Badge tone={s.status === "approved" ? "emerald" : s.status === "retired" ? "neutral" : "amber"}>{s.status}</Badge><Badge>v{s.currentVersion}</Badge></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                <span>Owner: {s.owner?.name ?? "—"}</span>
                <span>Used by {usage.find((u) => u.skillId === s.id)?.n ?? 0} employee(s)</span>
                <span>{s.workflowKey ? <Badge tone="teal">executable · {s.workflowKey}</Badge> : <Badge>instruction-only</Badge>}</span>
                <span>Updated {fmtDate(s.updatedAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
