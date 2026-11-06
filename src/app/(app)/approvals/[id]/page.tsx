import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { approvals, artifacts, connectors } from "@/db/schema";
import { Card, CardTitle, DescriptionList, PageHeader, Notice } from "@/components/ui/card";
import { AiAvatar } from "@/components/ui/ai-avatar";
import { ApprovalStatusBadge, Badge, ModeBadge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { ArtifactStatusBadge, ArtifactView } from "@/components/artifacts/artifact-view";
import { decideApprovalAction, retryExecutionAction } from "../actions";
import { ACTION_TYPE_LABEL, fmtDateTime } from "@/lib/format";
import { effectiveConnectorMode } from "@/lib/connectors";
import { Markdown } from "@/components/ui/markdown";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const a = await db.query.approvals.findFirst({ where: and(eq(approvals.id, id), eq(approvals.workspaceId, workspace.id)), with: { employee: true, task: true, decidedBy: true, receipts: true } });
  if (!a) notFound();
  const artifact = a.artifactId ? db.select().from(artifacts).where(eq(artifacts.id, a.artifactId)).get() ?? null : null;
  const connector = a.connectorKey ? db.select().from(connectors).where(and(eq(connectors.workspaceId, workspace.id), eq(connectors.key, a.connectorKey))).get() ?? null : null;
  const eff = connector ? effectiveConnectorMode(connector.key, connector.mode) : null;
  const canDecide = can(role, "approval.decide") && (a.status === "pending" || a.status === "changes_requested");
  const isDraft = a.actionType === "review_draft";
  const receipt = a.receipts[0] ?? null;
  const payloadText = typeof a.payload.text === "string" ? a.payload.text : null;
  const items = Array.isArray(a.payload.items) ? (a.payload.items as Record<string, unknown>[]) : null;

  return (
    <div className="anim-rise">
      <PageHeader eyebrow={<Link href="/approvals" className="hover:underline">Approval center</Link>} title={a.title} description={ACTION_TYPE_LABEL[a.actionType]} actions={<ApprovalStatusBadge status={a.status} />} />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle description={isDraft ? "This is a review of a draft. Approving it records that a human accepted the draft — nothing is sent or created." : "This is the exact action that will run if approved. The approval is bound to this payload; any change invalidates it."}>
              {isDraft ? "What you are approving" : "Exact proposed action"}
            </CardTitle>
            {isDraft ? <Notice tone="accent">No external effect. A separate approval is required to create tasks or send messages from this draft.</Notice> : (
              <Notice tone={eff?.mode === "demo" ? "amber" : "rose"} title={eff?.mode === "demo" ? "Demo connector — simulated execution" : "External action"}>
                {eff?.mode === "demo" ? `Approving runs the Demo adapter for ${connector?.name}. A simulated receipt is recorded; nothing is delivered outside the platform.` : `Approving executes against ${connector?.name ?? "the connector"}.`}
              </Notice>
            )}
            <div className="mt-4">
              <DescriptionList
                items={[
                  { label: "Destination", value: <code className="kbd">{a.destination}</code> },
                  { label: "Connector", value: connector ? <span className="inline-flex items-center gap-2">{connector.name} {eff && <ModeBadge mode={eff.mode} />}</span> : "Internal (platform only)" },
                  { label: "Proposed by", value: a.employee ? <span className="inline-flex items-center gap-1.5"><AiAvatar seed={a.employee.avatarSeed} name={a.employee.name} size={20} /> {a.employee.name} (AI)</span> : "—" },
                  { label: "Requested", value: fmtDateTime(a.requestedAt) },
                  { label: "Expires", value: fmtDateTime(a.expiresAt) },
                  { label: "Payload hash", value: <code className="kbd">{a.payloadHash.slice(0, 16)}…</code> },
                ]}
              />
            </div>
            {!isDraft && (
              <div className="mt-5 space-y-3">
                <h3 className="text-sm font-semibold text-ink">Content</h3>
                {payloadText && <div className="rounded-xl border border-line bg-surface-2 p-4"><Markdown text={payloadText} /></div>}
                {items && (
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="table">
                      <thead><tr><th>#</th><th>Title</th><th>Owner</th><th>Due</th><th>Source</th></tr></thead>
                      <tbody>
                        {items.map((it, i) => (
                          <tr key={i}>
                            <td className="text-ink-3">{i + 1}</td>
                            <td className="text-ink">{String(it.title ?? "")}</td>
                            <td>{it.owner ? <Badge tone="emerald">{String(it.owner)}</Badge> : <Badge tone="rose">{it.ownerStatus === "unverified" ? "unverified — left blank" : "missing"}</Badge>}</td>
                            <td className="text-ink-2">{it.due ? String(it.due) : <span className="text-ink-3">—</span>}</td>
                            <td className="text-xs text-ink-2">{String(it.source ?? "")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-ink-2">Raw payload (what the connector receives)</summary>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(a.payload, null, 2)}</pre>
                </details>
              </div>
            )}
          </Card>

          {artifact && (
            <Card>
              <CardTitle action={<ArtifactStatusBadge status={artifact.status} />} description="The draft this request refers to, rendered from the task record.">{artifact.title}</CardTitle>
              <ArtifactView artifact={artifact} />
            </Card>
          )}

          <Card>
            <CardTitle>Context</CardTitle>
            <dl className="space-y-2 text-sm">
              {Object.entries(a.context).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] gap-2">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="text-ink">{typeof v === "string" ? v : <code className="text-xs">{JSON.stringify(v)}</code>}</dd>
                </div>
              ))}
              {a.task && <div className="grid grid-cols-[140px_1fr] gap-2"><dt className="text-ink-3">task</dt><dd><Link href={`/tasks/${a.task.id}`} className="text-accent hover:underline">{a.task.title}</Link></dd></div>}
            </dl>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle>Decision</CardTitle>
            {canDecide ? (
              <form className="space-y-3">
                <label className="label" htmlFor="note">Note (optional, recorded in the audit log)</label>
                <textarea id="note" name="note" className="textarea min-h-[4rem]" maxLength={1000} placeholder="Why, or what to change…" />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton formAction={decideApprovalAction.bind(null, a.id, "approve")} variant="success" pendingText="Working…">{isDraft ? "Accept draft" : eff?.mode === "demo" ? "Approve & simulate" : "Approve & execute"}</SubmitButton>
                  <SubmitButton formAction={decideApprovalAction.bind(null, a.id, "changes_requested")} variant="secondary">Request changes</SubmitButton>
                  <SubmitButton formAction={decideApprovalAction.bind(null, a.id, "reject")} variant="danger">Reject</SubmitButton>
                </div>
                <p className="hint">Your decision, name and note are written to the audit log. {isDraft ? "Accepting a draft does not send anything." : "The action runs once; duplicates are prevented by an idempotency key."}</p>
              </form>
            ) : (
              <DescriptionList items={[{ label: "Status", value: <ApprovalStatusBadge status={a.status} /> }, { label: "Decided by", value: a.decidedBy?.name ?? "—" }, { label: "Decided at", value: fmtDateTime(a.decidedAt) }, { label: "Note", value: a.decisionNote ?? "—" }]} />
            )}
            {!can(role, "approval.decide") && <p className="hint">Your role ({role}) can view but not decide approvals.</p>}
          </Card>

          {(receipt || a.status === "execution_unknown" || a.status === "execution_failed") && (
            <Card>
              <CardTitle description="Proof of what happened when the action ran.">Action receipt</CardTitle>
              {receipt ? (
                <DescriptionList
                  items={[
                    { label: "Status", value: <Badge tone={receipt.status === "succeeded" ? "emerald" : receipt.status === "unknown" ? "amber" : "rose"}>{receipt.status}</Badge> },
                    { label: "Mode", value: <ModeBadge mode={receipt.mode} /> },
                    { label: "External ref", value: <code className="kbd">{receipt.externalRef ?? "—"}</code> },
                    { label: "Executed", value: fmtDateTime(receipt.updatedAt) },
                  ]}
                />
              ) : <p className="text-sm text-ink-2">No receipt recorded.</p>}
              {receipt?.result?.summary ? <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{String(receipt.result.summary)}</p> : null}
              {(a.status === "execution_unknown" || receipt?.status === "unknown") && can(role, "approval.execute") && (
                <form action={retryExecutionAction.bind(null, a.id)} className="mt-3">
                  <SubmitButton variant="secondary" size="sm">Reconcile & retry safely</SubmitButton>
                  <p className="hint">Checks the destination first; never re-runs an action that already happened.</p>
                </form>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
