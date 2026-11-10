import { and, asc, eq, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvals, departments, employees, tasks, users, workspaceMembers, workspaces, workflowRuns, jobs, type Approval, type Employee, type Task } from "@/db/schema";
import { RUN_STALE_MS } from "@/lib/jobs/execution";
import { nowIso } from "@/lib/ids";
import type { OfficeActivity, OfficeSnapshot, SceneEmployee } from "@/lib/office/types";

const newestTask = (a: Task, b: Task) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);

/** Pure presentation of stored status, never evidence of real-time execution. */
export function deriveOfficeActivity(employee: Employee, taskRows: Task[], approvalRows: Approval[], emergencyStop: boolean): OfficeActivity {
  const assigned = taskRows.filter((t) => t.workspaceId === employee.workspaceId && t.employeeId === employee.id).sort(newestTask);
  const pending = approvalRows.filter((a) => a.workspaceId === employee.workspaceId && a.employeeId === employee.id && a.status === "pending" && (!a.taskId || assigned.some((t) => t.id === a.taskId)))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt) || a.id.localeCompare(b.id));
  const activity = (kind: OfficeActivity["kind"], label: string, detail: string, task?: Task, approvalId: string | null = null): OfficeActivity => ({
    kind, label, detail, approvalId,
    task: task ? { id: task.id, title: task.title, status: task.status, updatedAt: task.updatedAt, nextAction: task.nextAction } : null,
  });
  if (emergencyStop) return activity("stopped", "Emergency stop", "Workspace emergency stop is enabled. Employee execution is held.");
  if (employee.status === "paused" || employee.status === "archived") return activity("paused", "Paused", "This employee is not active.");
  if (employee.status === "draft") return activity("draft", "In development", "Draft employee. Not activated for work.");
  const working = assigned.find((t) => t.status === "working");
  if (working) return activity("working", "Task marked working", "Stored task status, not proof of real-time execution.", working);
  const blocked = assigned.find((t) => t.status === "blocked" || t.status === "failed");
  if (blocked) return activity("blocked", blocked.status === "failed" ? "Task failed" : "Task blocked", blocked.blockedReason || blocked.nextAction || "This task needs attention before it can proceed.", blocked);
  const review = assigned.find((t) => t.status === "needs_approval");
  if (review) return activity("review", "Awaiting review", "A task is recorded as needing human approval.", review, pending.find((a) => a.taskId === review.id)?.id ?? null);
  if (pending[0]) return activity("review", "Awaiting review", pending[0].title, assigned.find((t) => t.id === pending[0].taskId), pending[0].id);
  const queued = assigned.find((t) => t.status === "queued");
  if (queued) return activity("queued", "Task queued", "Waiting in the recorded task queue; execution is not confirmed.", queued);
  const paused = assigned.find((t) => t.status === "paused");
  if (paused) return activity("paused", "Task paused", "The assigned task is paused.", paused);
  return activity("idle", "No active task", "No working, queued, blocked or review task is recorded for this employee.");
}

/** Read-only, workspace-scoped snapshot. Department totals count tasks, not animations. */
export function getOfficeSnapshot(db: Db, workspaceId: string): OfficeSnapshot {
  const workspace = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
  const emergencyStop = workspace?.settings.emergencyStop ?? false;
  const depts = db.select().from(departments).where(eq(departments.workspaceId, workspaceId)).orderBy(asc(departments.id)).all();
  const staff = db.select().from(employees).where(and(eq(employees.workspaceId, workspaceId), ne(employees.status, "archived"))).orderBy(asc(employees.name), asc(employees.id)).all();
  const taskRows = db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId)).all();
  const pending = db.select().from(approvals).where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "pending"))).all()
    .filter((a) => (!a.employeeId || staff.some((e) => e.id === a.employeeId)) && (!a.taskId || taskRows.some((t) => t.id === a.taskId && (!a.employeeId || t.employeeId === a.employeeId))));
  const people = db.select({ id: users.id, name: users.name }).from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspaceId)).all();
  const runs = db.select().from(workflowRuns).where(eq(workflowRuns.workspaceId, workspaceId)).all();
  const runJobs = db.select().from(jobs).where(eq(jobs.workspaceId, workspaceId)).all();
  const stageLabels: Record<string, string> = { validating: "Checking the brief", reading: "Reading approved sources", drafting: "Drafting content", checking: "Checking claim citations" };
  const sceneEmployee = (e: Employee): SceneEmployee => {
    let activity = deriveOfficeActivity(e, taskRows, pending, emergencyStop);
    if (activity.kind === "working" && activity.task && taskRows.find((t) => t.id === activity.task!.id)?.workflowKey === "content_draft") {
      const run = runs.filter((r) => r.taskId === activity.task!.id && r.employeeId === e.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))[0];
      const job = runJobs.find((j) => j.id === run?.jobId);
      const live = !!run && run.status === "running" && job?.status === "running" && job.attempts === run.attempt && !!job.lockedBy && !!job.lockedAt && Date.now() - Date.parse(job.lockedAt) < RUN_STALE_MS && Date.now() - Date.parse(run.heartbeatAt) < RUN_STALE_MS;
      activity = { ...activity, kind: live ? "working" : "stalled", label: live ? stageLabels[run.stage] ?? "Content work running" : "Worker heartbeat stale", detail: live ? "A worker currently owns this content run. Open the task for its stages, source evidence and draft." : "Execution is not confirmed. Productive motion is stopped; inspect the run before retrying.", live, stage: run?.stage, heartbeatAt: run?.heartbeatAt, runId: run?.id };
    }
    if (activity.kind === "idle") {
      const completed = taskRows.filter((t) => t.employeeId === e.id && t.workflowKey === "content_draft" && t.status === "completed").sort(newestTask)[0];
      if (completed) activity = { kind: "completed", label: "Content draft reviewed", detail: "A human accepted the latest content draft. Nothing was published or sent.", task: { id: completed.id, title: completed.title, status: completed.status, updatedAt: completed.updatedAt, nextAction: completed.nextAction }, approvalId: null, live: false, stage: "completed" };
    }
    return { id: e.id, name: e.name, status: e.status, avatarSeed: e.avatarSeed, roleTitle: e.roleTitle, activity };
  };
  return {
    observedAt: nowIso(), emergencyStop,
    departments: depts.map((d) => {
      const departmentTasks = taskRows.filter((t) => t.departmentId === d.id);
      const reviewIds = new Set(departmentTasks.filter((t) => t.status === "needs_approval").map((t) => t.id));
      for (const a of pending) if (a.taskId && departmentTasks.some((t) => t.id === a.taskId)) reviewIds.add(a.taskId);
      return { id: d.id, slug: d.slug, name: d.name, color: d.color, layout: d.layout,
        managerName: people.find((p) => p.id === d.managerUserId)?.name ?? null,
        employees: staff.filter((e) => e.departmentId === d.id).map(sceneEmployee),
        counts: { active: departmentTasks.filter((t) => t.status === "working" || t.status === "queued").length, needsApproval: reviewIds.size, blocked: departmentTasks.filter((t) => t.status === "blocked" || t.status === "failed").length },
      };
    }),
    unassigned: staff.filter((e) => !depts.some((d) => d.id === e.departmentId)).map(sceneEmployee),
  };
}
