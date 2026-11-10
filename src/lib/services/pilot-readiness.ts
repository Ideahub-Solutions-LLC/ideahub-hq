import { and, count, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvals, artifacts, employeeSkills, employees, skills, skillVersions, tasks, users, workspaceMembers, workspaces } from "@/db/schema";
import { approvedSourcesForEmployee } from "./retrieval";
import { NotFoundError } from "@/lib/authz";

export type PilotCheck = { key: string; label: string; configured: boolean; detail: string; href: string };

/** Read-only configuration diagnostics, never an authorization or launch certification. */
export function getPilotReadiness(db: Db, workspaceId: string) {
  const workspace = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
  if (!workspace) throw new NotFoundError("Workspace not found.");
  const pilots = db.select().from(employees).where(and(eq(employees.workspaceId, workspaceId), eq(employees.isPilot, true))).all().filter((e) => e.status !== "archived");
  // Do not silently choose between multiple pilot employees.
  const employee = pilots.length === 1 ? pilots[0] : null;
  const profileHref = employee ? `/employees/${employee.id}` : "/employees";
  const manager = employee?.managerUserId ? db.select({ name: users.name, role: workspaceMembers.role }).from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, employee.managerUserId))).get() : null;
  const qualified = employee ? db.select({ workflowKey: skills.workflowKey }).from(employeeSkills)
    .innerJoin(skills, and(eq(skills.id, employeeSkills.skillId), eq(skills.workspaceId, workspaceId)))
    .innerJoin(skillVersions, and(eq(skillVersions.skillId, skills.id), eq(skillVersions.workspaceId, workspaceId), eq(skillVersions.version, skills.currentVersion)))
    .where(and(eq(employeeSkills.workspaceId, workspaceId), eq(employeeSkills.employeeId, employee.id), eq(skills.status, "approved"), eq(skillVersions.reviewStatus, "approved"))).all() : [];
  const workflowKeys = new Set(qualified.map((s) => s.workflowKey));
  const sources = employee ? approvedSourcesForEmployee(db, workspaceId, employee.id).filter((s) => s.type === "meeting_record") : [];
  const members = new Set(db.select({ id: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)).all().map((m) => m.id));
  const verifiedSources = sources.filter((s) => s.content.trim() && s.sourceRef?.trim() && s.lastVerifiedAt && s.ownerUserId && members.has(s.ownerUserId));
  const reviewPolicy = Boolean(employee?.authority.requireReviewForDrafts && employee.authority.allowedActionTypes.includes("review_draft"));
  const checks: PilotCheck[] = [
    { key: "employee", label: "One pilot employee", configured: Boolean(employee), detail: employee ? `${employee.name} · ${employee.roleTitle}` : pilots.length ? `${pilots.length} pilot employees are marked. Confirm one pilot before expanding.` : "No pilot employee is marked yet. Confirm the Operations Coordinator with the team.", href: profileHref },
    { key: "manager", label: "Accountable human manager", configured: Boolean(manager && ["owner", "admin", "manager"].includes(manager.role)), detail: manager ? `${manager.name} · ${manager.role}. Confirm this person owns the pilot.` : "Assign a manager who belongs to this workspace and can review drafts.", href: profileHref },
    { key: "active", label: "Employee active", configured: employee?.status === "active", detail: employee ? `Employee status: ${employee.status}.` : "Select the pilot employee first.", href: profileHref },
    { key: "skills", label: "Two approved workflow versions", configured: workflowKeys.has("meeting_actions") && workflowKeys.has("weekly_summary"), detail: `Meeting actions: ${workflowKeys.has("meeting_actions") ? "approved" : "missing"}. Work summary: ${workflowKeys.has("weekly_summary") ? "approved" : "missing"}.`, href: employee ? `${profileHref}/edit?tab=skills` : "/skills" },
    { key: "sources", label: "Approved, traceable meeting source", configured: verifiedSources.length > 0, detail: `${verifiedSources.length} accessible meeting record(s) have an owner, reference and verification date. Confirm authorization and accuracy before using real records.`, href: "/knowledge" },
    { key: "review", label: "Human review required", configured: reviewPolicy, detail: reviewPolicy ? "Draft review is required. Accepting a draft does not authorize sending or task creation." : "Enable required draft review and the review_draft proposal permission.", href: profileHref },
    { key: "stop", label: "Emergency stop clear", configured: !workspace.settings.emergencyStop, detail: workspace.settings.emergencyStop ? "Emergency stop is active. Work remains stopped until an authorized admin lifts it." : "No emergency stop is active. An owner or admin can stop work in Admin.", href: "/dashboard" },
  ];
  const outputs = employee ? db.select({ id: artifacts.id, taskId: artifacts.taskId, kind: artifacts.kind, status: artifacts.status, createdAt: artifacts.createdAt }).from(artifacts)
    .where(and(eq(artifacts.workspaceId, workspaceId), eq(artifacts.employeeId, employee.id))).all() : [];
  const evidence = [
    { key: "meeting_actions", kind: "draft_action_list", name: "Meeting → reviewed actions", contract: "Extract supported actions, decisions and questions. Flag missing owners or dates. A human reviews the draft." },
    { key: "weekly_summary", kind: "draft_status_summary", name: "Executive work summary", contract: "Summarize platform task records for a defined period. Tracker and meeting-decision comparison is a later step." },
  ].map((workflow) => {
    const matching = outputs.filter((o) => o.kind === workflow.kind);
    const latest = matching.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return { ...workflow, drafts: matching.filter((o) => o.status === "draft").length, reviewed: matching.filter((o) => o.status === "reviewed").length, latestTaskId: latest?.taskId ?? null };
  });
  return { employee: employee ? { id: employee.id, name: employee.name, roleTitle: employee.roleTitle, configVersion: employee.configVersion } : null, checks, configured: checks.filter((c) => c.configured).length, evidence };
}

/** Counts are independent of the short preview lists on the dashboard. */
export function getDashboardCounts(db: Db, workspaceId: string) {
  const taskCount = (statuses: (typeof tasks.$inferSelect.status)[]) => db.select({ value: count() }).from(tasks).where(and(eq(tasks.workspaceId, workspaceId), inArray(tasks.status, statuses))).get()!.value;
  return {
    active: taskCount(["working", "queued"]),
    blocked: taskCount(["blocked", "failed"]),
    completed: taskCount(["completed"]),
    pending: db.select({ value: count() }).from(approvals).where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "pending"))).get()!.value,
  };
}
