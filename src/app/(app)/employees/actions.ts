"use server";

import { requirePermission, requireWorkspace } from "@/lib/auth/context";
import { bool, csv, describeError, flashRedirect, list, num, optNum, optStr, str } from "@/lib/actions-util";
import { AuthoritySchema, EmployeeProfileSchema, ModelConfigSchema, createEmployee, setEmployeeKnowledge, setEmployeeSkills, setEmployeeStatus, updateEmployeeAuthority, updateEmployeeModelConfig, updateEmployeeProfile } from "@/lib/services/employees";
import { ACTION_TYPES, type EmployeeStatus } from "@/db/schema";
import { postUserMessage } from "@/lib/services/chat";
import { startWorkflowTask } from "@/lib/services/tasks";
import { drainJobs } from "@/lib/jobs/worker";
import { WORKFLOWS, type WorkflowKey } from "@/lib/workflows/runner";

function profileFromForm(fd: FormData) {
  return EmployeeProfileSchema.parse({
    name: str(fd, "name"),
    roleTitle: str(fd, "roleTitle"),
    departmentId: optStr(fd, "departmentId"),
    managerUserId: optStr(fd, "managerUserId"),
    seniority: str(fd, "seniority"),
    bio: str(fd, "bio"),
    channels: csv(fd, "channels"),
    personality: {
      tone: str(fd, "tone"),
      verbosity: str(fd, "verbosity"),
      reportingFormat: str(fd, "reportingFormat"),
      questionStyle: str(fd, "questionStyle"),
      summary: str(fd, "personalitySummary"),
    },
  });
}

export async function createEmployeeAction(fd: FormData) {
  const ctx = await requirePermission("employee.create");
  let id: string;
  try {
    const profile = profileFromForm(fd);
    id = createEmployee(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, profile }).id;
  } catch (e) {
    flashRedirect("/employees/new", { error: describeError(e) });
  }
  flashRedirect(`/employees/${id}`, { ok: "Employee profile created as a draft. Review authority and model settings before activating." });
}

export async function updateProfileAction(employeeId: string, fd: FormData) {
  const ctx = await requirePermission("employee.edit");
  try {
    updateEmployeeProfile(ctx.db, { workspaceId: ctx.workspace.id, employeeId, userId: ctx.user.id, profile: profileFromForm(fd) });
  } catch (e) {
    flashRedirect(`/employees/${employeeId}/edit`, { error: describeError(e) });
  }
  flashRedirect(`/employees/${employeeId}`, { ok: "Profile and personality saved (new configuration version)." });
}

export async function updateAuthorityAction(employeeId: string, fd: FormData) {
  const ctx = await requirePermission("employee.authority.edit");
  try {
    const allowed = list(fd, "allowedActionTypes").filter((a): a is (typeof ACTION_TYPES)[number] => (ACTION_TYPES as readonly string[]).includes(a));
    const authority = AuthoritySchema.parse({ allowedActionTypes: allowed, forbiddenActions: csv(fd, "forbiddenActions"), requireReviewForDrafts: bool(fd, "requireReviewForDrafts"), maxActionsPerTask: num(fd, "maxActionsPerTask", 5) });
    updateEmployeeAuthority(ctx.db, { workspaceId: ctx.workspace.id, employeeId, userId: ctx.user.id, authority });
  } catch (e) {
    flashRedirect(`/employees/${employeeId}/edit?tab=authority`, { error: describeError(e) });
  }
  flashRedirect(`/employees/${employeeId}`, { ok: "Authority policy saved. Personality never changes these limits." });
}

export async function updateModelConfigAction(employeeId: string, fd: FormData) {
  const ctx = await requirePermission("employee.model.edit");
  try {
    const modelConfig = ModelConfigSchema.parse({
      provider: str(fd, "provider"),
      model: str(fd, "model"),
      temperature: num(fd, "temperature", 0.2),
      maxOutputTokens: num(fd, "maxOutputTokens", 2000),
      fallbackProvider: optStr(fd, "fallbackProvider"),
      fallbackModel: optStr(fd, "fallbackModel"),
      perTaskBudgetCents: optNum(fd, "perTaskBudgetCents"),
      monthlyBudgetCents: optNum(fd, "monthlyBudgetCents"),
    });
    updateEmployeeModelConfig(ctx.db, { workspaceId: ctx.workspace.id, employeeId, userId: ctx.user.id, modelConfig });
  } catch (e) {
    flashRedirect(`/employees/${employeeId}/edit?tab=model`, { error: describeError(e) });
  }
  flashRedirect(`/employees/${employeeId}`, { ok: "Model configuration saved. The employee identity and history are unchanged." });
}

export async function setStatusAction(employeeId: string, status: EmployeeStatus, fd: FormData) {
  const ctx = await requirePermission(status === "archived" ? "employee.archive" : "employee.pause");
  try {
    setEmployeeStatus(ctx.db, { workspaceId: ctx.workspace.id, employeeId, userId: ctx.user.id, status, reason: optStr(fd, "reason") ?? undefined });
  } catch (e) {
    flashRedirect(`/employees/${employeeId}`, { error: describeError(e) });
  }
  flashRedirect(status === "archived" ? "/employees" : `/employees/${employeeId}`, { ok: `Employee is now ${status}.` });
}

export async function updateSkillsAction(employeeId: string, fd: FormData) {
  const ctx = await requirePermission("employee.edit");
  try {
    setEmployeeSkills(ctx.db, { workspaceId: ctx.workspace.id, employeeId, userId: ctx.user.id, skillIds: list(fd, "skillIds") });
  } catch (e) {
    flashRedirect(`/employees/${employeeId}/edit?tab=skills`, { error: describeError(e) });
  }
  flashRedirect(`/employees/${employeeId}`, { ok: "Skills updated." });
}

export async function updateKnowledgeAction(employeeId: string, fd: FormData) {
  const ctx = await requirePermission("employee.edit");
  try {
    setEmployeeKnowledge(ctx.db, { workspaceId: ctx.workspace.id, employeeId, userId: ctx.user.id, sourceIds: list(fd, "sourceIds") });
  } catch (e) {
    flashRedirect(`/employees/${employeeId}/edit?tab=knowledge`, { error: describeError(e) });
  }
  flashRedirect(`/employees/${employeeId}`, { ok: "Knowledge access updated." });
}

export async function sendMessageAction(employeeId: string, fd: FormData) {
  const ctx = await requireWorkspace();
  const content = str(fd, "content");
  if (!content) flashRedirect(`/employees/${employeeId}/workspace`, { error: "Write a message first." });
  if (content.length > 4000) flashRedirect(`/employees/${employeeId}/workspace`, { error: "Keep messages under 4000 characters." });
  try {
    postUserMessage(ctx.db, { workspaceId: ctx.workspace.id, employeeId, userId: ctx.user.id, content });
    if ((process.env.JOB_WORKER_MODE ?? "inline") === "inline") await drainJobs(ctx.db, { limit: 3, workspaceId: ctx.workspace.id, workerId: `inline-${ctx.user.id}` });
  } catch (e) {
    flashRedirect(`/employees/${employeeId}/workspace`, { error: describeError(e) });
  }
  flashRedirect(`/employees/${employeeId}/workspace`, {});
}

export async function runWorkflowAction(employeeId: string, fd: FormData) {
  const ctx = await requirePermission("task.run_workflow");
  const workflowKey = str(fd, "workflowKey") as WorkflowKey;
  if (!(workflowKey in WORKFLOWS)) flashRedirect(`/employees/${employeeId}/workspace`, { error: "Unknown workflow." });
  if (workflowKey === "content_draft") flashRedirect(`/employees/${employeeId}/content/new`, {});
  let taskId: string;
  try {
    const input: Record<string, unknown> = workflowKey === "meeting_actions" ? { sourceId: str(fd, "sourceId"), useModel: bool(fd, "useModel") } : { periodStart: new Date(str(fd, "periodStart") || Date.now() - 7 * 86400_000).toISOString(), periodEnd: new Date(str(fd, "periodEnd") || Date.now()).toISOString() };
    if (workflowKey === "meeting_actions" && !input.sourceId) flashRedirect(`/employees/${employeeId}/workspace`, { error: "Choose an approved meeting record first." });
    const task = startWorkflowTask(ctx.db, { workspaceId: ctx.workspace.id, employeeId, workflowKey, input, requestedByUserId: ctx.user.id, title: optStr(fd, "title") ?? undefined });
    taskId = task.id;
    if ((process.env.JOB_WORKER_MODE ?? "inline") === "inline") await drainJobs(ctx.db, { limit: 3, workspaceId: ctx.workspace.id, workerId: `inline-${ctx.user.id}` });
  } catch (e) {
    flashRedirect(`/employees/${employeeId}/workspace`, { error: describeError(e) });
  }
  flashRedirect(`/tasks/${taskId}`, { ok: "Workflow started. The draft and its review request appear below as soon as the employee finishes." });
}
