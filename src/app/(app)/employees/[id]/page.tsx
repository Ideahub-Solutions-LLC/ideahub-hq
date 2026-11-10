import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { getEmployee } from "@/lib/services/employees";
import { can } from "@/lib/authz";
import { auditEvents, connectorGrants, memories, skillVersions, tasks } from "@/db/schema";
import { Card, CardTitle, DescriptionList, EmptyState, PageHeader, Notice } from "@/components/ui/card";
import { AiAvatar } from "@/components/ui/ai-avatar";
import { Badge, EmployeeStatusBadge, ModeBadge, TaskStatusBadge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { ConfirmSubmitButton, SubmitButton } from "@/components/ui/button";
import { setStatusAction } from "../actions";
import { ACTION_TYPE_LABEL, fmtDateTime, timeAgo } from "@/lib/format";
import { resolveProvider, listProviders } from "@/lib/providers";
import { effectiveConnectorMode } from "@/lib/connectors";
import { fmtCents } from "@/lib/services/usage";
import { MessageSquare, Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const e = getEmployee(db, workspace.id, id);
  if (!e) notFound();
  const recentTasks = db.select().from(tasks).where(and(eq(tasks.workspaceId, workspace.id), eq(tasks.employeeId, e.id))).orderBy(desc(tasks.updatedAt)).limit(6).all();
  const grants = await db.query.connectorGrants.findMany({ where: and(eq(connectorGrants.employeeId, e.id), eq(connectorGrants.status, "active")), with: { connector: true } });
  const mems = db.select().from(memories).where(eq(memories.employeeId, e.id)).all();
  const versions = db.select().from(skillVersions).where(eq(skillVersions.workspaceId, workspace.id)).all();
  const audit = db.select().from(auditEvents).where(and(eq(auditEvents.workspaceId, workspace.id), eq(auditEvents.entityId, e.id))).orderBy(desc(auditEvents.createdAt)).limit(8).all();
  const resolved = resolveProvider(e.modelConfig);
  const providerInfo = listProviders().find((p) => p.key === e.modelConfig.provider);
  const canEdit = can(role, "employee.edit");

  return (
    <div className="anim-rise">
      <PageHeader
        eyebrow={<Link href="/employees" className="hover:underline">Employees</Link>}
        title={
          <span className="flex items-center gap-4">
            <AiAvatar seed={e.avatarSeed} name={e.name} size={56} showLabel />
            <span>
              {e.name}
              <span className="ml-3 align-middle"><EmployeeStatusBadge status={e.status} /></span>
              {e.isPilot && <span className="ml-1.5 align-middle"><Badge tone="teal">Pilot</Badge></span>}
            </span>
          </span>
        }
        description={`${e.roleTitle} · ${e.department?.name ?? "No department"} · managed by ${e.manager?.name ?? "nobody yet"} · configuration v${e.configVersion}`}
        actions={
          <>
            <Link href={`/employees/${e.id}/workspace`} className="btn btn-primary"><MessageSquare size={16} aria-hidden /> Open workspace</Link>
            <Link href={`/employees/${e.id}/development`} className="btn btn-secondary">Develop expertise</Link>
            {canEdit && <Link href={`/employees/${e.id}/edit`} className="btn btn-secondary"><Pencil size={16} aria-hidden /> Edit</Link>}
          </>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />
      {e.status === "draft" && <div className="mb-4"><Notice tone="amber" title="Draft employee">This profile is a proposal. It cannot work on tasks or propose actions until a manager activates it.</Notice></div>}
      {e.status === "paused" && <div className="mb-4"><Notice tone="amber" title="Paused">All work and action execution for this employee is on hold.</Notice></div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle description="Who this employee is and how it works. Personality is style only — it never changes permissions.">Identity & personality</CardTitle>
            <p className="text-sm text-ink">{e.bio}</p>
            <div className="mt-4">
              <DescriptionList
                items={[
                  { label: "Tone", value: e.personality.tone },
                  { label: "Verbosity", value: e.personality.verbosity },
                  { label: "Reporting format", value: e.personality.reportingFormat },
                  { label: "Question style", value: e.personality.questionStyle.replace(/_/g, " ") },
                  { label: "Seniority", value: e.seniority },
                  { label: "Channels", value: e.channels.join(", ") || "web" },
                ]}
              />
            </div>
            <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">“{e.personality.summary}”</p>
          </Card>

          <Card>
            <CardTitle description="What this employee may propose. Every listed action still requires a human approval before it executes.">Authority & approval policy</CardTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-ink-3">Can propose</div>
                <ul className="mt-1 space-y-1 text-sm">
                  {e.authority.allowedActionTypes.map((a) => (
                    <li key={a} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald" aria-hidden />{ACTION_TYPE_LABEL[a]}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-ink-3">Never</div>
                <ul className="mt-1 space-y-1 text-sm">
                  {e.authority.forbiddenActions.map((f) => (
                    <li key={f} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-rose" aria-hidden />{f}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-2">
              <Badge tone={e.authority.requireReviewForDrafts ? "emerald" : "amber"}>{e.authority.requireReviewForDrafts ? "Every draft reviewed by a human" : "Drafts not auto-reviewed"}</Badge>
              <Badge>Max {e.authority.maxActionsPerTask} proposed actions per task</Badge>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardTitle description="Versioned procedures this employee may use.">Skills</CardTitle>
              {e.skills.length === 0 ? (
                <EmptyState title="No skills assigned" />
              ) : (
                <ul className="space-y-2">
                  {e.skills.map(({ skill }) => {
                    const v = versions.find((x) => x.skillId === skill.id && x.version === skill.currentVersion);
                    return (
                      <li key={skill.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/skills/${skill.id}`} className="min-w-0 truncate text-ink hover:underline">{skill.name}</Link>
                        <span className="flex items-center gap-1.5">
                          <Badge>v{skill.currentVersion}</Badge>
                          <Badge tone={skill.status === "approved" ? "emerald" : "amber"}>{skill.status}</Badge>
                          {v?.reviewStatus !== "approved" && <Badge tone="amber">unreviewed version</Badge>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card>
              <CardTitle description="Sources this employee can retrieve from. Only approved sources are ever used.">Approved knowledge</CardTitle>
              {e.knowledge.length === 0 ? (
                <EmptyState title="No knowledge access" />
              ) : (
                <ul className="space-y-2">
                  {e.knowledge.map(({ source }) => (
                    <li key={source.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/knowledge/${source.id}`} className="min-w-0 truncate text-ink hover:underline">{source.title}</Link>
                      <Badge tone={source.reviewStatus === "approved" ? "emerald" : source.reviewStatus === "stale" ? "rose" : "amber"}>{source.reviewStatus}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardTitle description="Connector grants. Revoke from Integrations.">Tools & connections</CardTitle>
              {grants.length === 0 ? (
                <EmptyState title="No tool access" description="This employee can only produce drafts inside the platform." />
              ) : (
                <ul className="space-y-2">
                  {grants.map((g) => {
                    const eff = effectiveConnectorMode(g.connector.key, g.connector.mode);
                    return (
                      <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{g.connector.name} <span className="text-ink-3">· {g.scopes.join(", ")}</span></span>
                        <ModeBadge mode={eff.mode} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card>
              <CardTitle description="Facts and preferences a human approved. Proposals wait in the review queue.">Reviewed memories</CardTitle>
              {mems.length === 0 ? (
                <EmptyState title="No approved memories" />
              ) : (
                <ul className="space-y-2 text-sm">
                  {mems.map((m) => (
                    <li key={m.id}>
                      <Badge>{m.kind}</Badge> <span className="text-ink">{m.content}</span>
                      <div className="text-xs text-ink-3">source: {m.sourceRef}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <CardTitle action={<Link href="/tasks" className="text-sm text-accent hover:underline">All tasks →</Link>}>Recent work</CardTitle>
            {recentTasks.length === 0 ? (
              <EmptyState title="No tasks yet" />
            ) : (
              <ul className="divide-y divide-line">
                {recentTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate text-sm text-ink hover:underline">{t.title}</Link>
                    <span className="text-xs text-ink-3">{timeAgo(t.updatedAt)}</span>
                    <TaskStatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle description="Kept separate from the employee's identity: swapping providers never erases business context or history.">Model configuration</CardTitle>
            <DescriptionList
              items={[
                { label: "Provider", value: providerInfo?.displayName ?? e.modelConfig.provider },
                { label: "Model", value: <code className="kbd">{e.modelConfig.model}</code> },
                { label: "Temperature", value: e.modelConfig.temperature },
                { label: "Max output", value: `${e.modelConfig.maxOutputTokens} tokens` },
                { label: "Fallback", value: e.modelConfig.fallbackProvider ? `${e.modelConfig.fallbackProvider} · ${e.modelConfig.fallbackModel ?? "default"}` : "None (pause on failure)" },
                { label: "Budgets", value: `${fmtCents(e.modelConfig.perTaskBudgetCents)} / task · ${fmtCents(e.modelConfig.monthlyBudgetCents)} / month` },
              ]}
            />
            <div className="mt-4">
              {resolved.degraded ? <Notice tone="amber" title="Currently running on">{resolved.adapter.displayName}. {resolved.note}</Notice> : <Notice tone="emerald" title="Currently running on">{resolved.adapter.displayName} · {resolved.model}</Notice>}
            </div>
          </Card>

          {can(role, "employee.pause") && (
            <Card>
              <CardTitle description="Pausing stops work and execution immediately without destroying evidence.">Controls</CardTitle>
              <div className="flex flex-wrap gap-2">
                {e.status !== "active" && e.status !== "archived" && (
                  <form action={setStatusAction.bind(null, e.id, "active")}>
                    <SubmitButton variant="success" size="sm" disabled={!e.managerUserId} title={!e.managerUserId ? "Assign a human manager first" : undefined}>Activate</SubmitButton>
                  </form>
                )}
                {e.status === "active" && (
                  <form action={setStatusAction.bind(null, e.id, "paused")}>
                    <SubmitButton variant="secondary" size="sm">Pause</SubmitButton>
                  </form>
                )}
                {can(role, "employee.archive") && e.status !== "archived" && (
                  <form action={setStatusAction.bind(null, e.id, "archived")}>
                    <ConfirmSubmitButton size="sm" confirm={`Archive ${e.name}? Work history is kept; the employee can no longer act.`}>Archive</ConfirmSubmitButton>
                  </form>
                )}
              </div>
              {!e.managerUserId && <p className="hint">An employee needs an accountable human manager before it can be activated.</p>}
            </Card>
          )}

          <Card>
            <CardTitle>Change history</CardTitle>
            {audit.length === 0 ? (
              <EmptyState title="No changes recorded" />
            ) : (
              <ul className="space-y-2 text-xs">
                {audit.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium text-ink">{a.action}</span> <span className="text-ink-3">· {fmtDateTime(a.createdAt)}</span>
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
