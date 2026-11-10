import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { employees, mcpToolGrants, workspaceMembers, workspaces } from "@/db/schema";
import { can } from "@/lib/authz";
import { resolveProvider } from "@/lib/providers";
import { loadPricingTable } from "./usage";
import { listApprovedEmployeeSkills } from "./employee-development";
import { approvedSourcesForEmployee } from "./retrieval";
import { getOperatingBrief } from "./hq-profile";
import { modelAccess } from "./provider-catalog";
import { mcpGrantAvailable } from "./mcp-registry";

export type SetupCheck = { label: string; state: "ready" | "attention" | "offline"; detail: string; href: string };
export function employeeSetup(db: Db, workspaceId: string, employeeId: string) {
  const employee = db.select().from(employees).where(and(eq(employees.workspaceId, workspaceId), eq(employees.id, employeeId))).get();
  if (!employee) throw new Error("Employee not found in this workspace.");
  const edit = `/employees/${employee.id}/edit`;
  const brief = getOperatingBrief(db, workspaceId, employee.id);
  const manager = employee.managerUserId ? db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, employee.managerUserId))).get() : null;
  const resolved = resolveProvider(employee.modelConfig);
  const access = modelAccess(db, workspaceId, employee.modelConfig.provider, employee.modelConfig.model);
  const fallback = employee.modelConfig.fallbackProvider ? modelAccess(db, workspaceId, employee.modelConfig.fallbackProvider, employee.modelConfig.fallbackModel ?? "") : null;
  const price = loadPricingTable()[`${resolved.adapter.key}:${resolved.model}`] ?? loadPricingTable()[`${resolved.adapter.key}:*`];
  const priced = !!price && Number.isFinite(price.input) && Number.isFinite(price.output) && price.input >= 0 && price.output >= 0;
  const skills = listApprovedEmployeeSkills(db, workspaceId, employee.id);
  const sources = approvedSourcesForEmployee(db, workspaceId, employee.id).filter(s => s.content.trim() && s.sourceRef?.trim() && s.ownerUserId && s.lastVerifiedAt);
  const assignments = db.select().from(mcpToolGrants).where(and(eq(mcpToolGrants.workspaceId, workspaceId), eq(mcpToolGrants.employeeId, employee.id), eq(mcpToolGrants.status, "active"))).all();
  const currentAssignments = assignments.filter(g => mcpGrantAvailable(db, workspaceId, g));
  const stop = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get()?.settings.emergencyStop;
  const checks: SetupCheck[] = [
    { label: "Accountable reviewer", state: manager && can(manager.role, "approval.decide") ? "ready" : "attention", detail: manager && can(manager.role, "approval.decide") ? "Manager has review permission in this workspace." : "Assign a manager, admin or owner who can review outputs.", href: edit },
    { label: "Operating brief", state: brief?.status === "approved" ? "ready" : "attention", detail: brief ? `Version ${brief.version} · ${brief.status}. Only the reviewed brief shapes chat instructions.` : "Define mission, responsibilities, deliverables, escalation and quality criteria.", href: `${edit}?tab=operating` },
    { label: "Model access", state: access.verified ? "ready" : employee.modelConfig.provider === "demo" || resolved.adapter.key === "demo" ? "offline" : "attention", detail: `${employee.modelConfig.provider}:${employee.modelConfig.model}. ${access.detail}`, href: `${edit}?tab=model` },
    ...(fallback ? [{ label: "Fallback access", state: fallback.verified ? "ready" as const : "attention" as const, detail: fallback.detail, href: `${edit}?tab=model` }] : []),
    { label: "Cost controls", state: employee.modelConfig.perTaskBudgetCents !== null && employee.modelConfig.monthlyBudgetCents !== null && priced && resolved.adapter.key !== "demo" ? "ready" : "attention", detail: "Live spending controls need explicit budgets and valid pricing for the effective model. Review remaining spending-control limits before activation.", href: `${edit}?tab=model` },
    { label: "Approved skills", state: skills.length ? "ready" : "attention", detail: `${skills.length} current approved skill version(s).`, href: `${edit}?tab=skills` },
    { label: "Approved knowledge", state: sources.length ? "ready" : "attention", detail: `${sources.length} accessible approved source(s) with owner, reference and verification date.`, href: `${edit}?tab=knowledge` },
    { label: "Review policy", state: employee.authority.requireReviewForDrafts && employee.authority.allowedActionTypes.includes("review_draft") ? "ready" : "attention", detail: "Draft review must remain enabled; personality and tool assignments grant no execution authority.", href: `${edit}?tab=authority` },
    { label: "Operating state", state: employee.status === "active" && !stop ? "ready" : "attention", detail: stop ? "Workspace emergency stop is active." : `Employee is ${employee.status}. Readiness checks do not activate employees automatically.`, href: `/employees/${employee.id}` },
  ];
  return { employee, brief, checks, configured: checks.every(c => c.state === "ready"), access, resolved, assignments, currentAssignments };
}
