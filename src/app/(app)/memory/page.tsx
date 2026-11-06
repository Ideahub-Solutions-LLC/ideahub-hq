import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { memories, memoryProposals } from "@/db/schema";
import { Card, CardTitle, EmptyState, PageHeader, Notice } from "@/components/ui/card";
import { AiAvatar } from "@/components/ui/ai-avatar";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { ConfirmSubmitButton, SubmitButton } from "@/components/ui/button";
import { KnowledgeTabs } from "../knowledge/knowledge-tabs";
import { forgetMemoryAction, reviewMemoryAction } from "../knowledge/actions";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MemoryPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const proposals = await db.query.memoryProposals.findMany({ where: eq(memoryProposals.workspaceId, workspace.id), with: { employee: true }, orderBy: [desc(memoryProposals.createdAt)] });
  const approved = await db.query.memories.findMany({ where: eq(memories.workspaceId, workspace.id), with: { employee: true }, orderBy: [desc(memories.createdAt)] });
  const pending = proposals.filter((p) => p.status === "proposed");
  const decided = proposals.filter((p) => p.status !== "proposed").slice(0, 10);
  const canReview = can(role, "memory.review");
  return (
    <div className="anim-rise">
      <PageHeader eyebrow="Skills & knowledge" title="Memory review" description="Employees propose memories; nothing becomes a durable fact until a human approves it. Approved memories carry their source, scope and reviewer." />
      <Flash ok={sp.ok} error={sp.error} />
      <KnowledgeTabs current="/memory" counts={{ memory: pending.length }} />
      <div className="mb-4"><Notice tone="neutral">Approving a memory updates what the employee is told — it is a configuration change, not model retraining.</Notice></div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Proposed ({pending.length})</CardTitle>
          {pending.length === 0 ? <EmptyState title="Nothing to review" /> : (
            <ul className="space-y-4">
              {pending.map((p) => (
                <li key={p.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-start gap-3">
                    {p.employee && <AiAvatar seed={p.employee.avatarSeed} name={p.employee.name} size={32} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3"><Badge>{p.kind}</Badge><span>{p.employee?.name} · {fmtDateTime(p.createdAt)}</span></div>
                      <p className="mt-1 text-sm text-ink">{p.content}</p>
                      <p className="mt-1 text-xs text-ink-3">source: {p.sourceRef}{p.taskId && <> · <Link href={`/tasks/${p.taskId}`} className="text-accent hover:underline">task</Link></>}</p>
                    </div>
                  </div>
                  {canReview && (
                    <form className="mt-3 flex flex-wrap items-center gap-2">
                      <select name="scope" className="select w-auto" defaultValue="employee" aria-label="Scope"><option value="employee">Employee scope</option><option value="department">Department scope</option><option value="workspace">Workspace scope</option></select>
                      <input name="note" className="input flex-1" placeholder="Review note (optional)" />
                      <SubmitButton size="sm" variant="success" formAction={reviewMemoryAction.bind(null, p.id, "approve")}>Approve</SubmitButton>
                      <SubmitButton size="sm" variant="danger" formAction={reviewMemoryAction.bind(null, p.id, "reject")}>Reject</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <details className="mt-4"><summary className="cursor-pointer text-xs font-medium text-ink-2">Recently decided</summary>
              <ul className="mt-2 space-y-1 text-xs text-ink-2">{decided.map((p) => (<li key={p.id}><Badge tone={p.status === "approved" ? "emerald" : "rose"}>{p.status}</Badge> {p.content}</li>))}</ul>
            </details>
          )}
        </Card>
        <Card>
          <CardTitle>Approved memories ({approved.length})</CardTitle>
          {approved.length === 0 ? <EmptyState title="No approved memories" /> : (
            <ul className="space-y-3">
              {approved.map((m) => (
                <li key={m.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
                  {m.employee && <AiAvatar seed={m.employee.avatarSeed} name={m.employee.name} size={32} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3"><Badge>{m.kind}</Badge><Badge>{m.scope}</Badge><span>{m.employee?.name} · {fmtDateTime(m.createdAt)}</span></div>
                    <p className="mt-1 text-sm text-ink">{m.content}</p>
                    <p className="mt-1 text-xs text-ink-3">source: {m.sourceRef}</p>
                  </div>
                  {canReview && <form action={forgetMemoryAction.bind(null, m.id)}><ConfirmSubmitButton size="sm" confirm="Remove this memory? The employee will no longer be told it.">Forget</ConfirmSubmitButton></form>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
