import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { getEmployee } from "@/lib/services/employees";
import { approvals, artifacts, knowledgeSources, messages, tasks } from "@/db/schema";
import { Card, CardTitle, EmptyState, PageHeader, Notice } from "@/components/ui/card";
import { AiAvatar, PersonAvatar } from "@/components/ui/ai-avatar";
import { AiBadge, ApprovalStatusBadge, Badge, TaskStatusBadge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { runWorkflowAction, sendMessageAction } from "../../actions";
import { WORKFLOWS } from "@/lib/workflows/runner";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { approvedSourcesForEmployee } from "@/lib/services/retrieval";
import { can } from "@/lib/authz";
import { listProviders } from "@/lib/providers";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role, user } = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const e = getEmployee(db, workspace.id, id);
  if (!e) notFound();
  const thread = db.select().from(messages).where(eq(messages.employeeId, e.id)).orderBy(desc(messages.createdAt)).limit(40).all().reverse();
  const current = db.select().from(tasks).where(and(eq(tasks.employeeId, e.id), inArray(tasks.status, ["working", "queued", "needs_approval", "blocked"]))).orderBy(desc(tasks.updatedAt)).limit(1).get();
  const history = db.select().from(tasks).where(eq(tasks.employeeId, e.id)).orderBy(desc(tasks.updatedAt)).limit(8).all();
  const outputs = db.select().from(artifacts).where(eq(artifacts.employeeId, e.id)).orderBy(desc(artifacts.createdAt)).limit(5).all();
  const pending = db.select().from(approvals).where(and(eq(approvals.employeeId, e.id), inArray(approvals.status, ["pending", "changes_requested"]))).orderBy(desc(approvals.requestedAt)).all();
  const meetingRecords = db.select().from(knowledgeSources).where(and(eq(knowledgeSources.workspaceId, workspace.id), eq(knowledgeSources.type, "meeting_record"))).all();
  const accessible = new Set(approvedSourcesForEmployee(db, workspace.id, e.id).map((s) => s.id));
  const liveProvider = listProviders().some((p) => p.configured && p.key !== "demo");
  const hasMeetingSkill = e.skills.some((s) => s.skill.workflowKey === "meeting_actions" && s.skill.status === "approved");
  const hasSummarySkill = e.skills.some((s) => s.skill.workflowKey === "weekly_summary" && s.skill.status === "approved");
  const { weekAgo, today } = defaultPeriod();

  return (
    <div className="anim-rise">
      <PageHeader
        eyebrow={<Link href={`/employees/${e.id}`} className="hover:underline">{e.name} · profile</Link>}
        title={<span className="flex items-center gap-3"><AiAvatar seed={e.avatarSeed} name={e.name} size={44} showLabel /> {e.name}’s workspace</span>}
        description={`${e.roleTitle}. Conversation, current task, outputs and approval requests in one place — the task record is readable without the chat.`}
      />
      <Flash ok={sp.ok} error={sp.error} />
      {e.status !== "active" && <div className="mb-4"><Notice tone="amber">This employee is {e.status}. Messages are stored but no replies or workflows will run until it is activated.</Notice></div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Conversation */}
        <Card className="lg:col-span-3" padded={false}>
          <div className="border-b border-line px-5 py-4">
            <CardTitle description={liveProvider ? "Replies come from the configured provider, grounded in approved knowledge." : "No provider key configured: replies come from the deterministic Demo provider and are labeled."}>Conversation</CardTitle>
          </div>
          <div className="max-h-[32rem] space-y-4 overflow-y-auto px-5 py-4 scrollbar-thin" aria-live="polite">
            {thread.length === 0 && <EmptyState title="No messages yet" description="Ask a question about approved knowledge, or start a workflow on the right." />}
            {thread.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.authorType === "user" ? "flex-row-reverse" : ""}`}>
                {m.authorType === "employee" ? <AiAvatar seed={e.avatarSeed} name={e.name} size={30} /> : <PersonAvatar name={m.authorId === user.id ? user.name : "Teammate"} size={30} />}
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.authorType === "user" ? "bg-accent-soft text-ink" : "bg-surface-2 text-ink"}`}>
                  <Markdown text={m.content} />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                    <span>{fmtDateTime(m.createdAt)}</span>
                    {m.authorType === "employee" && m.metadata?.provider === "demo" && <Badge tone="amber">Demo provider</Badge>}
                    {m.authorType === "employee" && Boolean(m.metadata?.provider) && m.metadata?.provider !== "demo" && <Badge tone="emerald">{String(m.metadata?.provider)} · {String(m.metadata?.model)}</Badge>}
                    {m.authorType === "employee" && Array.isArray(m.metadata?.sources) && (m.metadata.sources as { id: string; title: string }[]).length > 0 && <span>· sources: {(m.metadata.sources as { id: string; title: string }[]).map((s) => s.title).join("; ")}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <form action={sendMessageAction.bind(null, e.id)} className="border-t border-line p-4">
            <label htmlFor="content" className="sr-only">Message</label>
            <textarea id="content" name="content" required maxLength={4000} className="textarea min-h-[4.5rem]" placeholder={`Message ${e.name}… (start with “remember that …” to propose a memory for review)`} />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-ink-3">Messages are internal. Nothing is sent outside the platform from this conversation.</p>
              <SubmitButton pendingText="Sending…" disabled={e.status !== "active"}>Send</SubmitButton>
            </div>
          </form>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle description="Readable without the chat: objective, status, next action.">Current task</CardTitle>
            {!current ? (
              <EmptyState title="No open task" />
            ) : (
              <div>
                <Link href={`/tasks/${current.id}`} className="text-sm font-medium text-ink hover:underline">{current.title}</Link>
                <div className="mt-1 flex items-center gap-2"><TaskStatusBadge status={current.status} /><span className="text-xs text-ink-3">updated {timeAgo(current.updatedAt)}</span></div>
                <p className="mt-2 text-sm text-ink-2">{current.objective}</p>
                {current.nextAction && <p className="mt-2 text-sm"><span className="text-ink-3">Next:</span> {current.nextAction}</p>}
                {current.blockedReason && <p className="mt-1 text-sm text-rose">{current.blockedReason}</p>}
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-label={`${current.progressPct}% complete`}>
                  <div className="h-full rounded-full bg-accent" style={{ width: `${current.progressPct}%` }} />
                </div>
              </div>
            )}
          </Card>

          {can(role, "task.run_workflow") && (
            <Card>
              <CardTitle description="Both workflows produce a draft and a review request. Nothing external happens without a separate approval.">Run a workflow</CardTitle>
              <div className="space-y-5">
                <form action={runWorkflowAction.bind(null, e.id)} className="space-y-3">
                  <input type="hidden" name="workflowKey" value="meeting_actions" />
                  <div>
                    <div className="text-sm font-medium text-ink">{WORKFLOWS.meeting_actions.name}</div>
                    <p className="text-xs text-ink-2">{WORKFLOWS.meeting_actions.description}</p>
                  </div>
                  <select name="sourceId" className="select" aria-label="Meeting record" defaultValue="" required>
                    <option value="" disabled>Choose an approved meeting record…</option>
                    {meetingRecords.map((r) => (
                      <option key={r.id} value={r.id} disabled={r.reviewStatus !== "approved" || !accessible.has(r.id)}>
                        {r.title}{r.reviewStatus !== "approved" ? ` (${r.reviewStatus} — not usable)` : !accessible.has(r.id) ? " (no access)" : ""}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-ink-2">
                    <input type="checkbox" name="useModel" className="h-4 w-4 accent-[var(--accent)]" disabled={!liveProvider} /> Use the configured model for extraction (validated against the source){!liveProvider && " — unavailable without a provider key"}
                  </label>
                  <SubmitButton size="sm" pendingText="Running…" disabled={e.status !== "active" || !hasMeetingSkill} title={!hasMeetingSkill ? "Assign the approved Meeting follow-through skill first" : undefined}>Draft action list</SubmitButton>
                </form>
                <hr className="border-line" />
                <form action={runWorkflowAction.bind(null, e.id)} className="space-y-3">
                  <input type="hidden" name="workflowKey" value="weekly_summary" />
                  <div>
                    <div className="text-sm font-medium text-ink">{WORKFLOWS.weekly_summary.name}</div>
                    <p className="text-xs text-ink-2">{WORKFLOWS.weekly_summary.description}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-ink-2">From<input type="date" name="periodStart" defaultValue={weekAgo} className="input mt-1" /></label>
                    <label className="text-xs text-ink-2">To<input type="date" name="periodEnd" defaultValue={today} className="input mt-1" /></label>
                  </div>
                  <SubmitButton size="sm" pendingText="Running…" disabled={e.status !== "active" || !hasSummarySkill} title={!hasSummarySkill ? "Assign the approved Weekly status summary skill first" : undefined}>Draft weekly summary</SubmitButton>
                </form>
              </div>
            </Card>
          )}

          <Card>
            <CardTitle action={<Link href="/approvals" className="text-sm text-accent hover:underline">Approval center →</Link>}>Approval requests</CardTitle>
            {pending.length === 0 ? (
              <EmptyState title="Nothing pending" />
            ) : (
              <ul className="space-y-2">
                {pending.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/approvals/${a.id}`} className="min-w-0 truncate text-ink hover:underline">{a.title}</Link>
                    <ApprovalStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Output artifacts</CardTitle>
            {outputs.length === 0 ? (
              <EmptyState title="No outputs yet" />
            ) : (
              <ul className="space-y-2">
                {outputs.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/tasks/${o.taskId}`} className="min-w-0 truncate text-ink hover:underline">{o.title}</Link>
                    <Badge tone={o.status === "reviewed" ? "emerald" : o.status === "rejected" ? "rose" : "amber"}>{o.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>History</CardTitle>
            {history.length === 0 ? (
              <EmptyState title="No tasks yet" />
            ) : (
              <ul className="space-y-2">
                {history.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/tasks/${t.id}`} className="min-w-0 truncate text-ink hover:underline">{t.title}</Link>
                    <TaskStatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Relevant sources</CardTitle>
            {e.knowledge.length === 0 ? (
              <EmptyState title="No knowledge access" />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {e.knowledge.map(({ source }) => (
                  <li key={source.id} className="flex items-center justify-between gap-2">
                    <Link href={`/knowledge/${source.id}`} className="min-w-0 truncate text-ink hover:underline">{source.title}</Link>
                    {source.reviewStatus === "approved" ? <AiBadge>usable</AiBadge> : <Badge tone="amber">{source.reviewStatus}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Default period for the weekly summary form (server-side; computed per request). */
function defaultPeriod() {
  const now = Date.now();
  return { weekAgo: new Date(now - 7 * 86400_000).toISOString().slice(0, 10), today: new Date(now).toISOString().slice(0, 10) };
}
