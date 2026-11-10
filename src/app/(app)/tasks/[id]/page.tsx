import Link from "next/link";
import { TaskLiveRefresh } from "@/components/task-live-refresh";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { getTask } from "@/lib/services/tasks";
import { can } from "@/lib/authz";
import { connectorGrants } from "@/db/schema";
import { Card, CardTitle, DescriptionList, EmptyState, PageHeader, Notice } from "@/components/ui/card";
import { AiAvatar, PersonAvatar } from "@/components/ui/ai-avatar";
import { AiBadge, ApprovalStatusBadge, Badge, TaskStatusBadge, ModeBadge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { ArtifactStatusBadge, ArtifactView } from "@/components/artifacts/artifact-view";
import { addCommentAction, proposeFollowUpAction, setTaskStatusAction, reviseContentAction } from "../actions";
import { fmtDateTime, timeAgo, ACTION_TYPE_LABEL } from "@/lib/format";
import { effectiveConnectorMode } from "@/lib/connectors";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role, user } = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const t = getTask(db, workspace.id, id);
  if (!t) notFound();
  const latestArtifact = t.artifacts[0] ?? null;
  const grants = t.employeeId ? await db.query.connectorGrants.findMany({ where: and(eq(connectorGrants.employeeId, t.employeeId), eq(connectorGrants.status, "active")), with: { connector: true } }) : [];
  const usableConnectors = grants.map((g) => ({ ...g.connector, eff: effectiveConnectorMode(g.connector.key, g.connector.mode) })).filter((c) => c.eff.mode === "demo" || c.eff.mode === "live");
  const allowed = t.employee?.authority.allowedActionTypes ?? [];
  const canEdit = can(role, "task.edit");

  return (
    <div className="anim-rise">
      <PageHeader
        eyebrow={<Link href="/tasks" className="hover:underline">Tasks</Link>}
        title={t.title}
        description={t.objective}
        actions={<TaskStatusBadge status={t.status} />}
      />
      <Flash ok={sp.ok} error={sp.error} />
      {t.workflowKey === "content_draft" && <><TaskLiveRefresh running={t.status === "queued" || t.status === "working"} /><Link href={`/office?employee=${t.employeeId}`} className="mb-4 inline-block text-sm text-accent">Watch this employee in the office</Link></>}
      {t.blockedReason && <div className="mb-4"><Notice tone="rose" title="Blocked">{t.blockedReason}</Notice></div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle>Task record</CardTitle>
            <DescriptionList
              items={[
                { label: "Owner (accountable human)", value: t.owner?.name ?? "Unassigned" },
                { label: "AI employee", value: t.employee ? <Link href={`/employees/${t.employee.id}`} className="inline-flex items-center gap-1.5 hover:underline"><AiAvatar seed={t.employee.avatarSeed} name={t.employee.name} size={20} /> {t.employee.name} <AiBadge /></Link> : "None" },
                { label: "Department", value: t.department?.name ?? "—" },
                { label: "Workflow", value: t.workflowKey ? <code className="kbd">{t.workflowKey}</code> : "Manual" },
                { label: t.workflowKey === "content_draft" ? "Stage" : "Progress", value: t.workflowKey === "content_draft" ? t.nextAction ?? "Queued" : `${t.progressPct}%` },
                { label: "Next action", value: t.nextAction ?? "—" },
                { label: "Created", value: fmtDateTime(t.createdAt) },
                { label: "Updated", value: `${fmtDateTime(t.updatedAt)} (${timeAgo(t.updatedAt)})` },
              ]}
            />
            {Object.keys(t.input).length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-medium text-ink-2">Inputs</summary>
                <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(t.input, null, 2)}</pre>
              </details>
            )}
          </Card>

          {t.artifacts.length > 0 && (
            <Card>
              <CardTitle description="Evidence-linked output. Review it here; approve or reject from the approval request.">Output</CardTitle>
              <div className="space-y-6">
                {t.artifacts.map((a) => (
                  <div key={a.id}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-ink">{a.title} <span className="text-ink-3">· v{a.version}</span></div>
                      <ArtifactStatusBadge status={a.status} />
                    </div>
                    {a.reviewNote && <p className="mb-3 text-xs text-ink-2">Review note: {a.reviewNote}</p>}
                    <ArtifactView artifact={a} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {latestArtifact && latestArtifact.kind !== "content_draft" && latestArtifact.status === "reviewed" && t.employee && t.employee.status === "active" && can(role, "task.run_workflow") && (
            <Card>
              <CardTitle description="A reviewed draft is not an authorization to send. Each of these creates a new, exact proposal for a manager to approve.">Propose a follow-up action</CardTitle>
              {usableConnectors.length === 0 ? (
                <EmptyState title="No usable connector" description="This employee has no active grant on a Demo or Live connector." />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {usableConnectors.map((c) => {
                    const kinds: ("create_external_tasks" | "send_message")[] = [];
                    if (latestArtifact.kind === "draft_action_list" && c.key === "task_system" && allowed.includes("create_external_tasks")) kinds.push("create_external_tasks");
                    if ((c.key === "slack" || c.key === "email" || c.key === "teams") && allowed.includes("send_message")) kinds.push("send_message");
                    return kinds.map((kind) => (
                      <form key={`${c.id}-${kind}`} action={proposeFollowUpAction.bind(null, t.id)} className="rounded-xl border border-line p-3">
                        <input type="hidden" name="kind" value={kind} />
                        <input type="hidden" name="connectorKey" value={c.key} />
                        <input type="hidden" name="artifactId" value={latestArtifact.id} />
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-ink">{ACTION_TYPE_LABEL[kind]}</div>
                          <ModeBadge mode={c.eff.mode} />
                        </div>
                        <p className="mt-1 text-xs text-ink-2">via {c.name}. {c.eff.mode === "demo" ? "Simulated — nothing leaves the platform." : "Live."}</p>
                        {kind === "send_message" && (
                          <label className="mt-2 block text-xs text-ink-2">Destination<input name="destination" className="input mt-1" defaultValue={c.key === "slack" ? "slack:#ops-coordination" : c.key === "email" ? "email:ops-team@example.com" : ""} /></label>
                        )}
                        <div className="mt-3"><SubmitButton size="sm" variant="secondary">Propose for approval</SubmitButton></div>
                      </form>
                    ));
                  })}
                </div>
              )}
            </Card>
          )}

          {t.workflowKey === "content_draft" && (t.status === "blocked" || t.status === "paused") && <Card><CardTitle>Generate a revised draft</CardTitle><form action={reviseContentAction.bind(null, t.id)} className="space-y-3"><label className="label" htmlFor="revisionNote">Changes or resolved blocker</label><textarea id="revisionNote" name="revisionNote" className="textarea" required maxLength={2000} /><SubmitButton>Generate revision</SubmitButton></form></Card>}
          <Card>
            <CardTitle description="Every status change, checkpoint, artifact, approval and receipt — newest first.">Activity history</CardTitle>
            <ol className="space-y-3">
              {t.events.map((ev) => (
                <li key={ev.id} className="flex gap-3 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ev.kind === "error" ? "bg-rose" : ev.kind === "approval" ? "bg-amber" : ev.kind === "receipt" ? "bg-emerald" : ev.kind === "comment" ? "bg-violet" : "bg-line-strong"}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-ink">{ev.message}</div>
                    <div className="text-xs text-ink-3">{ev.actorType === "employee" ? `${t.employee?.name ?? "AI employee"} (AI)` : ev.actorType === "user" ? "Human" : "System"} · {ev.kind.replace(/_/g, " ")} · {fmtDateTime(ev.createdAt)}{ev.data?.internal ? " · internal comment" : ""}</div>
                  </div>
                </li>
              ))}
            </ol>
            <form action={addCommentAction.bind(null, t.id)} className="mt-4 flex gap-2">
              <label htmlFor="message" className="sr-only">Internal comment</label>
              <input id="message" name="message" className="input" placeholder="Add an internal comment (never leaves the company)…" maxLength={2000} />
              <SubmitButton variant="secondary">Comment</SubmitButton>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle description="Decisions bound to this task.">Approvals</CardTitle>
            {t.approvals.length === 0 ? (
              <EmptyState title="No approvals requested" />
            ) : (
              <ul className="space-y-3">
                {t.approvals.map((a) => (
                  <li key={a.id} className="text-sm">
                    <Link href={`/approvals/${a.id}`} className="font-medium text-ink hover:underline">{a.title}</Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-2"><ApprovalStatusBadge status={a.status} /><span>{ACTION_TYPE_LABEL[a.actionType]}</span></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle description="Durable checkpoints: the task can resume from here without the model conversation.">Steps & checkpoints</CardTitle>
            {t.steps.length === 0 ? (
              <EmptyState title="No steps recorded" description={t.workflowKey ? "The employee has not started yet." : "Manual task."} />
            ) : (
              <ol className="space-y-2">
                {t.steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${s.status === "done" ? "bg-emerald-soft text-emerald" : s.status === "failed" ? "bg-rose-soft text-rose" : "bg-surface-2 text-ink-3"}`}>{s.seq}</span>
                    <div>
                      <div className="text-ink">{s.name}</div>
                      <div className="text-xs text-ink-3">{s.status}{s.finishedAt ? ` · ${fmtDateTime(s.finishedAt)}` : ""}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {canEdit && (
            <Card>
              <CardTitle>Controls</CardTitle>
              <div className="flex flex-wrap gap-2">
                {t.status !== "paused" && t.status !== "completed" && <form action={setTaskStatusAction.bind(null, t.id, "paused")}><SubmitButton size="sm" variant="secondary">Pause</SubmitButton></form>}
                {t.workflowKey !== "content_draft" && (t.status === "paused" || t.status === "blocked" || t.status === "failed") && <form action={setTaskStatusAction.bind(null, t.id, "queued")}><SubmitButton size="sm" variant="secondary">{t.workflowKey ? "Re-queue (re-run)" : "Re-open"}</SubmitButton></form>}
                {t.workflowKey !== "content_draft" && t.status !== "completed" && <form action={setTaskStatusAction.bind(null, t.id, "completed")}><SubmitButton size="sm" variant="success">Mark completed</SubmitButton></form>}
                {t.status !== "blocked" && t.status !== "completed" && (
                  <form action={setTaskStatusAction.bind(null, t.id, "blocked")} className="flex w-full gap-2">
                    <input name="reason" className="input" placeholder="Reason for blocking" />
                    <SubmitButton size="sm" variant="danger">Block</SubmitButton>
                  </form>
                )}
              </div>
            </Card>
          )}
          <div className="text-xs text-ink-3 flex items-center gap-2"><PersonAvatar name={user.name} size={20} /> Viewing as {user.name} ({role})</div>
          <Badge>{t.id}</Badge>
        </div>
      </div>
    </div>
  );
}
