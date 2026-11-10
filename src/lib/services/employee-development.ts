import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditEvents, departments, employeeKnowledge, employeeSkills, employees, knowledgeSources, skills, skillVersions, workspaceMembers } from "@/db/schema";
import { assertCan, can, NotFoundError } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { newId, nowIso } from "@/lib/ids";
import { matchExpertisePack, type ExpertiseModule, type ExpertisePack } from "@/lib/employee-development/catalog";

/** Only the approved current version may influence runtime behavior. */
export function listApprovedEmployeeSkills(db: Db, workspaceId: string, employeeId: string) {
  return db.select({ skill: skills, version: skillVersions }).from(employeeSkills)
    .innerJoin(employees, and(eq(employees.id, employeeSkills.employeeId), eq(employees.workspaceId, workspaceId)))
    .innerJoin(skills, and(eq(skills.id, employeeSkills.skillId), eq(skills.workspaceId, workspaceId)))
    .innerJoin(skillVersions, and(eq(skillVersions.skillId, skills.id), eq(skillVersions.workspaceId, workspaceId), eq(skillVersions.version, skills.currentVersion)))
    .where(and(eq(employeeSkills.workspaceId, workspaceId), eq(employeeSkills.employeeId, employeeId), eq(skills.status, "approved"), eq(skillVersions.reviewStatus, "approved"))).all();
}

function moduleSlug(employeeId: string, pack: ExpertisePack, module: ExpertiseModule) {
  return `development-${employeeId}-${pack.key}-${module.key}-v${pack.version}`;
}

function belongsToModule(db: Db, workspaceId: string, skillId: string, employeeId: string, pack: ExpertisePack, module: ExpertiseModule) {
  return db.select().from(auditEvents).where(and(eq(auditEvents.workspaceId, workspaceId), eq(auditEvents.entityType, "skill"), eq(auditEvents.entityId, skillId), eq(auditEvents.action, "employee.development.create_skill"))).all()
    .some(({ data }) => data?.employeeId === employeeId && data?.packKey === pack.key && data?.packVersion === pack.version && data?.moduleKey === module.key);
}

export function getEmployeeDevelopment(db: Db, workspaceId: string, employeeId: string) {
  const employee = db.select().from(employees).where(and(eq(employees.workspaceId, workspaceId), eq(employees.id, employeeId))).get();
  if (!employee) return null;
  const department = employee.departmentId ? db.select().from(departments).where(and(eq(departments.workspaceId, workspaceId), eq(departments.id, employee.departmentId))).get() ?? null : null;
  const pack = department ? matchExpertisePack(employee.roleTitle, department.slug) : null;
  const manager = employee.managerUserId ? db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, employee.managerUserId))).get() : undefined;
  const modules = (pack?.modules ?? []).map((module) => {
    const candidate = db.select().from(skills).where(and(eq(skills.workspaceId, workspaceId), eq(skills.slug, moduleSlug(employeeId, pack!, module)))).get();
    const skill = candidate && belongsToModule(db, workspaceId, candidate.id, employeeId, pack!, module) ? candidate : null;
    const version = skill ? db.select().from(skillVersions).where(and(eq(skillVersions.workspaceId, workspaceId), eq(skillVersions.skillId, skill.id), eq(skillVersions.version, skill.currentVersion))).get() ?? null : null;
    const assigned = !!skill && !!db.select().from(employeeSkills).where(and(eq(employeeSkills.workspaceId, workspaceId), eq(employeeSkills.employeeId, employeeId), eq(employeeSkills.skillId, skill.id))).get();
    return { module, skill, version, assigned };
  });
  const sources = db.select({ source: knowledgeSources }).from(employeeKnowledge)
    .innerJoin(knowledgeSources, and(eq(knowledgeSources.id, employeeKnowledge.knowledgeSourceId), eq(knowledgeSources.workspaceId, workspaceId)))
    .where(and(eq(employeeKnowledge.workspaceId, workspaceId), eq(employeeKnowledge.employeeId, employeeId))).all().map(({ source }) => source);
  return { employee, department, pack, modules, approvedSkills: listApprovedEmployeeSkills(db, workspaceId, employeeId), sources, managerReady: can(manager?.role, "employee.edit") && can(manager?.role, "skill.edit") };
}

/** Preparation is explicit, draft-only, transactional, and safe to repeat after human edits. */
export function prepareEmployeeDevelopment(db: Db, input: { workspaceId: string; employeeId: string; userId: string }) {
  return db.transaction((tx) => {
    const { workspaceId, employeeId, userId } = input;
    const member = tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).get();
    assertCan(member?.role, "employee.edit");
    assertCan(member?.role, "skill.edit");
    const development = getEmployeeDevelopment(tx, workspaceId, employeeId);
    if (!development) throw new NotFoundError("Employee not found.");
    const { employee, pack, managerReady } = development;
    if (employee.status === "archived") throw new Error("Archived employees cannot prepare expertise drafts.");
    if (!pack) throw new Error("No expertise pack matches this employee's exact role and department.");
    let created = 0;
    let assigned = 0;
    const skillIds: string[] = [];
    const now = nowIso();
    for (const expertiseModule of pack.modules) {
      const slug = moduleSlug(employeeId, pack, expertiseModule);
      let skill = tx.select().from(skills).where(and(eq(skills.workspaceId, workspaceId), eq(skills.slug, slug))).get();
      const provenance = { employeeId, packKey: pack.key, packVersion: pack.version, moduleKey: expertiseModule.key };
      if (skill && !belongsToModule(tx, workspaceId, skill.id, employeeId, pack, expertiseModule)) throw new Error(`Development skill conflict: ${expertiseModule.name}. The reserved slug belongs to another record.`);
      if (!skill) {
        const skillId = newId("skl");
        tx.insert(skills).values({ id: skillId, workspaceId, slug, name: `${employee.name}: ${expertiseModule.name}`.slice(0, 80), purpose: expertiseModule.purpose, workflowKey: expertiseModule.key === "marketing-brand-outline" ? "content_draft" : null, ownerUserId: managerReady ? employee.managerUserId : userId, status: "draft", currentVersion: 1, createdAt: now, updatedAt: now }).run();
        tx.insert(skillVersions).values({ id: newId("skv"), workspaceId, skillId, version: 1, instructions: expertiseModule.instructions, inputs: expertiseModule.inputs, outputs: expertiseModule.outputs, requiredTools: [], requiredApprovals: ["review_draft"], reviewStatus: "pending", changeNote: `Expertise pack ${pack.key} v${pack.version}; module ${expertiseModule.key}. Human review required.`, createdByUserId: userId, createdAt: now }).run();
        recordAudit(tx, { workspaceId, actorUserId: userId, action: "employee.development.create_skill", entityType: "skill", entityId: skillId, data: { ...provenance, skillVersion: 1 } });
        skill = tx.select().from(skills).where(and(eq(skills.workspaceId, workspaceId), eq(skills.id, skillId))).get()!;
        created++;
      }
      const version = tx.select().from(skillVersions).where(and(eq(skillVersions.workspaceId, workspaceId), eq(skillVersions.skillId, skill.id), eq(skillVersions.version, skill.currentVersion))).get();
      if (!version) throw new Error(`Development skill conflict: ${expertiseModule.name} has no valid current version.`);
      // Check the composite key even if its workspace label is corrupt; never commandeer it.
      const assignment = tx.select().from(employeeSkills).where(and(eq(employeeSkills.employeeId, employeeId), eq(employeeSkills.skillId, skill.id))).get();
      if (assignment && assignment.workspaceId !== workspaceId) throw new Error("Development assignment workspace conflict.");
      if (!assignment) {
        tx.insert(employeeSkills).values({ workspaceId, employeeId, skillId: skill.id, createdAt: now }).run();
        recordAudit(tx, { workspaceId, actorUserId: userId, action: "employee.development.assign_skill", entityType: "employee", entityId: employeeId, data: { ...provenance, skillId: skill.id } });
        assigned++;
      }
      skillIds.push(skill.id);
    }
    if (assigned) {
      tx.update(employees).set({ configVersion: employee.configVersion + 1, updatedAt: now }).where(and(eq(employees.workspaceId, workspaceId), eq(employees.id, employeeId))).run();
      recordAudit(tx, { workspaceId, actorUserId: userId, action: "employee.development.prepare", entityType: "employee", entityId: employeeId, data: { packKey: pack.key, packVersion: pack.version, created, assigned, skillIds, configVersion: employee.configVersion + 1 } });
    }
    return { created, assigned, skillIds };
  });
}
