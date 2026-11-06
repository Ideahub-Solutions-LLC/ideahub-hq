import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { approvals } from "@/db/schema";
import { Card, EmptyState, PageHeader, Notice } from "@/components/ui/card";
import { AiAvatar } from "@/components/ui/ai-avatar";
import { ApprovalStatusBadge, Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { ACTION_TYPE_LABEL, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ filter?: string; ok?: string; error?: string }> }) {
  const { db, workspace } = await requireWorkspace();
  const sp = await searchParams;
  const all = await db.query.approvals.findMany({ where: eq(approvals.workspaceId, workspace.id), with: { employee: true, task: true, decidedBy: true }, orderBy: [desc(approvals.requestedAt)] });
  const filter = sp.filter ?? "pending";
  const rows = filter === "all" ? all : filter === "decided" ? all.filter((a) => a.status !== "pending") : all.filter((a) => a.status === "pending" || a.status === "changes_requested");
  return (
    <div className="anim-rise">
      <PageHeader eyebrow="Human control" title="Approval center" description="Every proposed action with its exact destination and payload. Approving a draft never sends it; sending or creating anything needs its own approval." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-4 flex gap-1">
        {[
          { key: "pending", label: "Pending" },
          { key: "decided", label: "Decided" },
          { key: "all", label: "All" },
        ].map((f) => (
          <Link key={f.key} href={`/approvals?filter=${f.key}`} className={`btn btn-sm ${filter === f.key ? "bg-surface-2 text-ink" : "btn-ghost"}`} aria-current={filter === f.key ? "page" : undefined}>
            {f.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Card><EmptyState title="Nothing here" description={filter === "pending" ? "No proposals are waiting for a decision." : "No approvals match."} /></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <Card key={a.id} className="card-hover">
              <div className="flex items-start gap-4">
                {a.employee && <AiAvatar seed={a.employee.avatarSeed} name={a.employee.name} size={40} showLabel />}
                <div className="min-w-0 flex-1">
                  <Link href={`/approvals/${a.id}`} className="text-base font-semibold text-ink hover:underline">{a.title}</Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                    <span>{ACTION_TYPE_LABEL[a.actionType]}</span>
                    <span>→ <code className="kbd">{a.destination}</code></span>
                    {a.task && <span>· task: <Link href={`/tasks/${a.task.id}`} className="text-accent hover:underline">{a.task.title}</Link></span>}
                    <span>· requested {timeAgo(a.requestedAt)}{a.employee ? ` by ${a.employee.name} (AI)` : ""}</span>
                    {a.decidedBy && <span>· decided by {a.decidedBy.name}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <ApprovalStatusBadge status={a.status} />
                  {a.actionType === "review_draft" ? <Badge tone="neutral">No external effect</Badge> : <Badge tone="amber">External action</Badge>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className="mt-6"><Notice tone="neutral">Approvals are bound to a payload hash and expire after 72 hours. If a proposal&apos;s content changes, a new approval is required.</Notice></div>
    </div>
  );
}
