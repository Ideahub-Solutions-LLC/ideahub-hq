import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { approvals, artifacts, employees, tasks } from "@/db/schema";
import { Card, CardTitle, EmptyState, PageHeader, Stat, Notice } from "@/components/ui/card";
import { ApprovalStatusBadge, TaskStatusBadge, AiBadge, Badge } from "@/components/ui/badge";
import { AiAvatar } from "@/components/ui/ai-avatar";
import { monthToDate, fmtCents } from "@/lib/services/usage";
import { listProviders } from "@/lib/providers";
import { queueStats } from "@/lib/jobs/queue";
import { timeAgo, fmtTokens, ACTION_TYPE_LABEL } from "@/lib/format";
import { getDashboardCounts, getPilotReadiness } from "@/lib/services/pilot-readiness";
import { PilotReadiness } from "@/components/pilot-readiness";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { db, workspace, user } = await requireWorkspace();
  const wsId = workspace.id;
  const active = await db.query.tasks.findMany({ where: and(eq(tasks.workspaceId, wsId), inArray(tasks.status, ["working", "queued"])), with: { employee: true, owner: true }, orderBy: [desc(tasks.updatedAt)], limit: 8 });
  const blocked = await db.query.tasks.findMany({ where: and(eq(tasks.workspaceId, wsId), inArray(tasks.status, ["blocked", "failed"])), with: { employee: true, owner: true }, orderBy: [desc(tasks.updatedAt)], limit: 6 });
  const pending = await db.query.approvals.findMany({ where: and(eq(approvals.workspaceId, wsId), eq(approvals.status, "pending")), with: { employee: true }, orderBy: [desc(approvals.requestedAt)], limit: 6 });
  const outputs = await db.query.artifacts.findMany({ where: eq(artifacts.workspaceId, wsId), with: { employee: true, task: true }, orderBy: [desc(artifacts.createdAt)], limit: 6 });
  const staff = db.select().from(employees).where(eq(employees.workspaceId, wsId)).all();
  const activeStaff = staff.filter((e) => e.status === "active");
  const usage = monthToDate(db, wsId);
  const providers = listProviders();
  const liveProvider = providers.find((p) => p.configured && p.key !== "demo");
  const jobs = queueStats(db, wsId);
  const counts = getDashboardCounts(db, wsId);
  const pilot = getPilotReadiness(db, wsId);

  return (
    <div className="anim-rise">
      <PageHeader eyebrow={workspace.name} title={`Good day, ${user.name.split(" ")[0]}`} description="Who is working on what, what needs your decision, and what is blocked — across humans and AI employees." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Active work" value={counts.active} hint="queued + working" href="/tasks" tone="accent" />
        <Stat label="Needs approval" value={counts.pending} hint="waiting on a human" href="/approvals" tone={pending.length ? "amber" : undefined} />
        <Stat label="Blocked" value={counts.blocked} hint="needs a decision or input" href="/tasks?status=blocked" tone={blocked.length ? "rose" : undefined} />
        <Stat label="Completed" value={counts.completed} hint="all time" href="/tasks?status=completed" tone="emerald" />
        <Stat label="AI employees" value={`${activeStaff.length} / ${staff.length}`} hint="active / total" href="/employees" />
      </div>

      {!liveProvider && (
        <div className="mb-6">
          <Notice tone="amber" title="No AI provider key is configured">
            Employees run on the offline Demo provider: conversational replies are deterministic and labeled. The two pilot workflows do not need a model. Add <code className="kbd">ANTHROPIC_API_KEY</code> or <code className="kbd">OPENAI_API_KEY</code> on the server to enable live models — see Admin → Providers.
          </Notice>
        </div>
      )}

      <PilotReadiness pilot={pilot} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle action={<Link href="/approvals" className="text-sm text-accent hover:underline">Approval center →</Link>} description="Exact proposed actions. Nothing executes until an authorized person decides.">
              Items needing approval
            </CardTitle>
            {pending.length === 0 ? (
              <EmptyState title="Nothing waiting on you" description="Approval requests from AI employees will appear here." />
            ) : (
              <ul className="divide-y divide-line">
                {pending.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-3">
                    {a.employee ? <AiAvatar seed={a.employee.avatarSeed} name={a.employee.name} size={34} showLabel /> : null}
                    <div className="min-w-0 flex-1">
                      <Link href={`/approvals/${a.id}`} className="block truncate text-sm font-medium text-ink hover:underline">
                        {a.title}
                      </Link>
                      <div className="mt-0.5 text-xs text-ink-2">
                        {ACTION_TYPE_LABEL[a.actionType]} · {a.destination} · {timeAgo(a.requestedAt)}
                      </div>
                    </div>
                    <ApprovalStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle action={<Link href="/tasks" className="text-sm text-accent hover:underline">Task board →</Link>}>Active work</CardTitle>
            {active.length === 0 ? (
              <EmptyState title="No active tasks" />
            ) : (
              <ul className="divide-y divide-line">
                {active.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/tasks/${t.id}`} className="block truncate text-sm font-medium text-ink hover:underline">
                        {t.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
                        {t.employee ? (
                          <span className="inline-flex items-center gap-1">
                            {t.employee.name} <AiBadge />
                          </span>
                        ) : (
                          <span>{t.owner?.name ?? "Unassigned"}</span>
                        )}
                        {t.nextAction && <span>· Next: {t.nextAction}</span>}
                      </div>
                    </div>
                    {t.progressPct > 0 && (
                      <div className="hidden w-24 sm:block" aria-label={`${t.progressPct}% complete`}>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${t.progressPct}%` }} />
                        </div>
                      </div>
                    )}
                    <TaskStatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Blocked</CardTitle>
            {blocked.length === 0 ? (
              <EmptyState title="Nothing is blocked" />
            ) : (
              <ul className="divide-y divide-line">
                {blocked.map((t) => (
                  <li key={t.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:underline">
                        {t.title}
                      </Link>
                      <TaskStatusBadge status={t.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-rose">{t.blockedReason ?? "No reason recorded."}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle description="Drafts produced by AI employees. Check each review status before relying on it.">Recent outputs</CardTitle>
            {outputs.length === 0 ? (
              <EmptyState title="No outputs yet" />
            ) : (
              <ul className="space-y-3">
                {outputs.map((o) => (
                  <li key={o.id} className="text-sm">
                    <Link href={o.taskId ? `/tasks/${o.taskId}` : "/tasks"} className="font-medium text-ink hover:underline">
                      {o.title}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-2">
                      <Badge tone={o.status === "reviewed" ? "emerald" : o.status === "rejected" ? "rose" : "amber"}>{o.status}</Badge>
                      <span>
                        {o.employee?.name} · {timeAgo(o.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle action={<Link href="/admin/usage" className="text-sm text-accent hover:underline">Usage →</Link>}>Usage this month</CardTitle>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-2">Model tokens</dt>
                <dd className="tabular-nums">{fmtTokens(usage.inputUnits)} in · {fmtTokens(usage.outputUnits)} out</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">Estimated cost</dt>
                <dd className="tabular-nums">{usage.unavailable > 0 ? `${fmtCents(usage.costCents)} (+${usage.unavailable} unpriced)` : fmtCents(usage.costCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">Provider</dt>
                <dd>{liveProvider ? liveProvider.displayName : <span className="text-amber">Demo (offline)</span>}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-2">Job queue</dt>
                <dd className="tabular-nums">
                  {jobs.queued ?? 0} queued · {jobs.running ?? 0} running · {jobs.failed ?? 0} failed
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-3">Costs are estimates only when a pricing table is configured; otherwise units are recorded without a price.</p>
          </Card>

          <Card>
            <CardTitle action={<Link href="/office" className="text-sm text-accent hover:underline">Office →</Link>}>AI employees</CardTitle>
            <ul className="space-y-2">
              {staff.map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <AiAvatar seed={e.avatarSeed} name={e.name} size={30} />
                  <Link href={`/employees/${e.id}`} className="min-w-0 flex-1 truncate text-sm text-ink hover:underline">
                    {e.name} <span className="text-ink-3">· {e.roleTitle}</span>
                  </Link>
                  <span className={`h-2 w-2 rounded-full ${e.status === "active" ? "bg-emerald" : e.status === "paused" ? "bg-amber" : "bg-line-strong"}`} title={e.status} aria-label={e.status} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
