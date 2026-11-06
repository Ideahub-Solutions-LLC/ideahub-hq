"use server";

import { requirePermission, requireWorkspace } from "@/lib/auth/context";
import { describeError, flashRedirect, optStr, str } from "@/lib/actions-util";
import { addTaskComment, createTask, proposeFollowUp, setTaskStatus } from "@/lib/services/tasks";
import { TASK_STATUSES, type TaskStatus } from "@/db/schema";
import { drainJobs } from "@/lib/jobs/worker";

export async function createTaskAction(fd: FormData) {
  const ctx = await requirePermission("task.create");
  let id: string;
  try {
    const title = str(fd, "title");
    const objective = str(fd, "objective");
    if (title.length < 3) throw new Error("Give the task a title.");
    id = createTask(ctx.db, { workspaceId: ctx.workspace.id, title, objective: objective || title, employeeId: optStr(fd, "employeeId"), departmentId: optStr(fd, "departmentId"), ownerUserId: optStr(fd, "ownerUserId"), requestedByUserId: ctx.user.id, priority: (optStr(fd, "priority") as "low" | "normal" | "high" | null) ?? "normal", dueAt: optStr(fd, "dueAt") }).id;
  } catch (e) {
    flashRedirect("/tasks", { error: describeError(e) });
  }
  flashRedirect(`/tasks/${id}`, { ok: "Task created." });
}

export async function setTaskStatusAction(taskId: string, status: TaskStatus, fd: FormData) {
  const ctx = await requirePermission("task.edit");
  if (!TASK_STATUSES.includes(status)) flashRedirect(`/tasks/${taskId}`, { error: "Invalid status." });
  try {
    setTaskStatus(ctx.db, { workspaceId: ctx.workspace.id, taskId, status, userId: ctx.user.id, reason: optStr(fd, "reason") ?? undefined });
    if (status === "queued" && (process.env.JOB_WORKER_MODE ?? "inline") === "inline") await drainJobs(ctx.db, { limit: 3, workspaceId: ctx.workspace.id, workerId: `inline-${ctx.user.id}` });
  } catch (e) {
    flashRedirect(`/tasks/${taskId}`, { error: describeError(e) });
  }
  flashRedirect(`/tasks/${taskId}`, { ok: `Task ${status.replace(/_/g, " ")}.` });
}

export async function addCommentAction(taskId: string, fd: FormData) {
  const ctx = await requireWorkspace();
  const message = str(fd, "message");
  if (!message) flashRedirect(`/tasks/${taskId}`, { error: "Write a comment first." });
  try {
    addTaskComment(ctx.db, { workspaceId: ctx.workspace.id, taskId, userId: ctx.user.id, message: message.slice(0, 2000) });
  } catch (e) {
    flashRedirect(`/tasks/${taskId}`, { error: describeError(e) });
  }
  flashRedirect(`/tasks/${taskId}`, { ok: "Internal comment added." });
}

export async function proposeFollowUpAction(taskId: string, fd: FormData) {
  const ctx = await requirePermission("task.run_workflow");
  const kind = str(fd, "kind") as "create_external_tasks" | "send_message";
  let approvalId: string;
  let created: boolean;
  try {
    if (kind !== "create_external_tasks" && kind !== "send_message") throw new Error("Unknown follow-up.");
    const connectorKey = str(fd, "connectorKey");
    const destination = str(fd, "destination") || `connector:${connectorKey}`;
    const res = proposeFollowUp(ctx.db, { workspaceId: ctx.workspace.id, taskId, artifactId: str(fd, "artifactId"), userId: ctx.user.id, kind, connectorKey, destination });
    approvalId = res.approval.id;
    created = res.created;
  } catch (e) {
    flashRedirect(`/tasks/${taskId}`, { error: describeError(e) });
  }
  flashRedirect(`/approvals/${approvalId}`, { ok: created ? "Proposal created. Review the exact action below — nothing has been executed." : "An identical proposal already exists; showing it instead of creating a duplicate." });
}
