import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { listTasks } from "@/lib/services/tasks";
import { can } from "@/lib/authz";
import {
  TASK_STATUSES,
  users,
  workspaceMembers,
  type TaskStatus,
} from "@/db/schema";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { AiBadge, TaskStatusBadge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { createTaskAction } from "./actions";
import { TASK_STATUS_LABEL, timeAgo } from "@/lib/format";
import {
  workContext,
  workUrl,
  type WorkParams,
} from "@/lib/services/workspace-context";
import { ScopeBar } from "@/components/workspace/scope-bar";
import { ScopeFields } from "@/components/workspace/scope-fields";
import { AddAppsButton } from "@/components/workspace/app-catalog";
import { Columns3, List } from "lucide-react";

export const dynamic = "force-dynamic";

const COLUMN_ORDER: TaskStatus[] = [
  "queued",
  "working",
  "needs_approval",
  "blocked",
  "paused",
  "completed",
];
const STATUS_DOT: Record<TaskStatus, string> = {
  queued: "var(--slate)",
  working: "var(--blue)",
  needs_approval: "var(--amber)",
  blocked: "var(--rose)",
  paused: "var(--ink-3)",
  completed: "var(--emerald)",
  failed: "var(--rose)",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<WorkParams & { status?: string }>;
}) {
  const { db, workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const scope = workContext(db, workspace.id, sp);
  const all = listTasks(db, workspace.id).filter(
    (t) =>
      (!scope.scope.departmentId ||
        t.departmentId === scope.scope.departmentId) &&
      (!scope.scope.employeeId || t.employeeId === scope.scope.employeeId) &&
      (!sp.q ||
        `${t.title} ${t.objective}`.toLowerCase().includes(sp.q.toLowerCase())),
  );
  const url = (changes: Record<string, string | null | undefined>) =>
    workUrl("/tasks", {
      departmentId: sp.departmentId,
      employeeId: sp.employeeId,
      q: sp.q,
      view: sp.view,
      status: sp.status,
      ...changes,
    });
  const rows = sp.status ? all.filter((t) => t.status === sp.status) : all;
  const listView = sp.view === "list" || Boolean(sp.status);
  const people = db
    .select({ user: users })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspace.id))
    .all()
    .map((r) => r.user);

  return (
    <div className="anim-rise">
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        description="Queued, working, needs approval, blocked, paused and completed — for humans and AI employees alike."
        actions={
          <>
            <AddAppsButton label="Connect task tool" category="tasks" />
            <div
              className="inline-flex rounded-xl border border-line bg-surface p-0.5"
              role="group"
              aria-label="Task view"
            >
              <Link
                href={url({ view: undefined, status: undefined })}
                aria-current={!listView ? "page" : undefined}
                className={`btn btn-sm ${!listView ? "bg-surface-2 text-ink" : "btn-ghost"}`}
              >
                <Columns3 size={15} aria-hidden /> Board
              </Link>
              <Link
                href={url({ view: "list", status: undefined })}
                aria-current={listView ? "page" : undefined}
                className={`btn btn-sm ${listView ? "bg-surface-2 text-ink" : "btn-ghost"}`}
              >
                <List size={15} aria-hidden /> List
              </Link>
            </div>
          </>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-5">
        <ScopeBar
          teams={scope.teams}
          staff={scope.staff}
          departmentId={sp.departmentId}
          employeeId={sp.employeeId}
          q={sp.q}
          hidden={{ view: sp.view, status: sp.status }}
        />
      </div>

      {listView ? (
        <Card padded={false}>
          <div
            className="flex flex-wrap gap-1 border-b border-line px-3 py-2"
            aria-label="Filter by status"
          >
            <Link
              href={url({ view: "list", status: undefined })}
              className={`btn btn-sm ${!sp.status ? "bg-surface-2" : "btn-ghost"}`}
            >
              All
            </Link>
            {TASK_STATUSES.map((s) => (
              <Link
                key={s}
                href={url({ status: s, view: "list" })}
                className={`btn btn-sm ${sp.status === s ? "bg-surface-2" : "btn-ghost"}`}
              >
                {TASK_STATUS_LABEL[s]}
              </Link>
            ))}
          </div>
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No tasks here" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Owner</th>
                    <th>Department</th>
                    <th>Next action</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link
                          href={`/tasks/${t.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {t.title}
                        </Link>
                      </td>
                      <td>
                        <TaskStatusBadge status={t.status} />
                      </td>
                      <td>
                        {t.employee ? (
                          <span className="inline-flex items-center gap-1">
                            {t.employee.name} <AiBadge />
                          </span>
                        ) : (
                          (t.owner?.name ?? "—")
                        )}
                      </td>
                      <td className="text-ink-2">
                        {t.department?.name ?? "—"}
                      </td>
                      <td className="max-w-xs truncate text-ink-2">
                        {t.blockedReason ?? t.nextAction ?? "—"}
                      </td>
                      <td className="whitespace-nowrap text-ink-3">
                        {timeAgo(t.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <div
          className="overflow-x-auto pb-3"
          role="region"
          aria-label="Task board; scroll for all statuses"
          tabIndex={0}
        >
          <div className="grid min-w-[1320px] grid-cols-6 gap-3">
            {COLUMN_ORDER.map((status) => {
              const items = all.filter(
                (t) =>
                  t.status === status ||
                  (status === "blocked" && t.status === "failed"),
              );
              return (
                <section
                  key={status}
                  aria-label={TASK_STATUS_LABEL[status]}
                  className="min-h-40 rounded-2xl bg-surface-2/70 p-2"
                >
                  <h2 className="flex items-center justify-between px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-ink-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: STATUS_DOT[status] }}
                        aria-hidden
                      />
                      {TASK_STATUS_LABEL[status]}
                    </span>
                    <span className="rounded-full bg-surface px-1.5 text-[11px]">
                      {items.length}
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <Link
                        key={t.id}
                        href={`/tasks/${t.id}`}
                        className="card card-hover block p-3"
                      >
                        <div className="text-sm font-medium leading-snug text-ink">
                          {t.title}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-2">
                          {t.employee ? (
                            <span className="inline-flex items-center gap-1">
                              {t.employee.name} <AiBadge />
                            </span>
                          ) : (
                            <span>{t.owner?.name ?? "Unassigned"}</span>
                          )}
                        </div>
                        {t.blockedReason && (
                          <p className="mt-1 line-clamp-2 text-xs text-rose">
                            {t.blockedReason}
                          </p>
                        )}
                        {t.priority === "high" && (
                          <span className="badge mt-1.5 bg-rose-soft text-rose">
                            High priority
                          </span>
                        )}
                        <div className="mt-2 text-[11px] text-ink-3">
                          {t.department?.name ?? "No department"} ·{" "}
                          {timeAgo(t.updatedAt)}
                        </div>
                      </Link>
                    ))}
                    {items.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-ink-3">
                        Empty
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {can(role, "task.create") && (
        <Card className="mt-6">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Create a task (human-owned or assigned to an AI employee)
            </summary>
            <form
              action={createTaskAction}
              className="mt-4 grid gap-3 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <label className="label" htmlFor="title">
                  Title
                </label>
                <input
                  id="title"
                  name="title"
                  required
                  minLength={3}
                  maxLength={140}
                  className="input"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="objective">
                  Objective
                </label>
                <textarea
                  id="objective"
                  name="objective"
                  maxLength={2000}
                  className="textarea"
                />
              </div>
              <div>
                <label className="label" htmlFor="ownerUserId">
                  Accountable human
                </label>
                <select
                  id="ownerUserId"
                  name="ownerUserId"
                  className="select"
                  defaultValue=""
                >
                  <option value="">Me</option>
                  {people.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <ScopeFields
                teams={scope.teams}
                staff={scope.staff}
                departmentId={sp.departmentId}
                employeeId={sp.employeeId}
                prefix="task"
              />
              <div>
                <label className="label" htmlFor="task-due">
                  Due date (optional)
                </label>
                <input
                  className="input"
                  type="date"
                  id="task-due"
                  name="dueAt"
                />
              </div>
              <div>
                <label className="label" htmlFor="priority">
                  Priority
                </label>
                <select
                  id="priority"
                  name="priority"
                  className="select"
                  defaultValue="normal"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <SubmitButton>Create task</SubmitButton>
              </div>
            </form>
          </details>
        </Card>
      )}
    </div>
  );
}
