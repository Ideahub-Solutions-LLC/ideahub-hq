import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { auditEvents, connectorGrants, departments, employeeKnowledge, employeeSkills, employees, skills, skillVersions } from "@/db/schema";
import { getEmployeeDevelopment, listApprovedEmployeeSkills, prepareEmployeeDevelopment } from "@/lib/services/employee-development";
import { EXPERTISE_PACKS } from "@/lib/employee-development/catalog";
import { generateEmployeeReply, postUserMessage } from "@/lib/services/chat";
import { demoAdapter } from "@/lib/providers/demo";
import { buildFixture, freshDb } from "./fixture";

function setup() {
  const db = freshDb();
  const f = buildFixture(db);
  const pack = EXPERTISE_PACKS[0];
  db.update(employees).set({ roleTitle: pack.roleTitle }).where(eq(employees.id, f.employeeId)).run();
  db.update(departments).set({ slug: pack.departmentSlug }).where(eq(departments.id, f.deptId)).run();
  const input = { workspaceId: f.workspaceId, employeeId: f.employeeId, userId: f.owner };
  return { db, f, pack, input };
}
afterEach(() => vi.restoreAllMocks());

describe("employee expertise development", () => {
  it.each(EXPERTISE_PACKS)("prepares the $roleTitle pack for its department", (pack) => {
    const { db, f, input } = setup();
    db.update(employees).set({ roleTitle: pack.roleTitle, status: "draft" }).where(eq(employees.id, f.employeeId)).run();
    db.update(departments).set({ slug: pack.departmentSlug }).where(eq(departments.id, f.deptId)).run();
    expect(prepareEmployeeDevelopment(db, input)).toMatchObject({ created: 2, assigned: 2 });
    const view = getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!;
    expect(view.pack?.key).toBe(pack.key);
    expect(view.employee.status).toBe("draft");
    expect(view.modules).toHaveLength(2);
    for (const entry of view.modules) {
      expect(entry.assigned).toBe(true);
      expect(entry.skill?.status).toBe("draft");
      expect(entry.version?.reviewStatus).toBe("pending");
    }
  });

  it("prepares draft-only modules, preserves all grants/configuration, and is idempotent after human edits", () => {
    const { db, f, input, pack } = setup();
    const before = getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!;
    const grants = db.select().from(connectorGrants).all();
    const result = prepareEmployeeDevelopment(db, input);
    expect(result.created).toBe(pack.modules.length);
    expect(result.assigned).toBe(pack.modules.length);
    const after = getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!;
    expect(after.employee).toEqual({ ...before.employee, configVersion: before.employee.configVersion + 1, updatedAt: after.employee.updatedAt });
    expect(after.sources).toEqual(before.sources);
    expect(db.select().from(connectorGrants).all()).toEqual(grants);
    expect(after.approvedSkills.map(({ skill }) => skill.id)).toContain(f.skillId);
    for (const entry of after.modules) {
      expect(entry.assigned).toBe(true);
      expect(entry.skill).toMatchObject({ status: "draft", workflowKey: null, ownerUserId: f.manager });
      expect(entry.version).toMatchObject({ reviewStatus: "pending", requiredTools: [], requiredApprovals: ["review_draft"] });
    }
    const first = after.modules[0];
    db.update(skillVersions).set({ instructions: "Human revised procedure", reviewStatus: "approved" }).where(eq(skillVersions.id, first.version!.id)).run();
    db.update(skills).set({ status: "approved" }).where(eq(skills.id, first.skill!.id)).run();
    const auditCount = db.select().from(auditEvents).all().length;
    expect(prepareEmployeeDevelopment(db, input)).toEqual({ created: 0, assigned: 0, skillIds: result.skillIds });
    const again = getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!;
    expect(again.modules[0].version!.instructions).toBe("Human revised procedure");
    expect(again.modules[0].skill!.status).toBe("approved");
    expect(again.employee.configVersion).toBe(after.employee.configVersion);
    expect(db.select().from(auditEvents).all()).toHaveLength(auditCount);
  });

  it("reuses a detached edited module and only bumps configuration for reassignment", () => {
    const { db, f, input } = setup();
    const original = prepareEmployeeDevelopment(db, input);
    db.delete(employeeSkills).where(eq(employeeSkills.skillId, original.skillIds[0])).run();
    expect(getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!.modules[0].assigned).toBe(false);
    expect(prepareEmployeeDevelopment(db, input)).toEqual({ created: 0, assigned: 1, skillIds: original.skillIds });
    expect(getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!.employee.configVersion).toBe(3);
  });

  it("rejects archived employees but allows draft and paused preparation without activation", () => {
    const { db, f, input } = setup();
    db.update(employees).set({ status: "archived" }).where(eq(employees.id, f.employeeId)).run();
    expect(() => prepareEmployeeDevelopment(db, input)).toThrow(/Archived/);
    expect(db.select().from(auditEvents).all()).toHaveLength(0);
    for (const status of ["draft", "paused"] as const) {
      db.update(employees).set({ status }).where(eq(employees.id, f.employeeId)).run();
      prepareEmployeeDevelopment(db, input);
      expect(getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!.employee.status).toBe(status);
    }
  });

  it("requires actual workspace membership and both edit permissions", () => {
    const { db, f, input } = setup();
    const other = buildFixture(db, { slug: "other" });
    for (const userId of [f.member, other.owner, "nonexistent"]) expect(() => prepareEmployeeDevelopment(db, { ...input, userId })).toThrow(/permission/);
    expect(() => prepareEmployeeDevelopment(db, { ...input, employeeId: other.employeeId })).toThrow("Employee not found");
    expect(db.select().from(auditEvents).all()).toHaveLength(0);
    expect(prepareEmployeeDevelopment(db, { ...input, userId: f.manager }).created).toBeGreaterThan(0);
  });

  it("requires exact role and department, handles missing employees, and uses actor if manager is unavailable", () => {
    const { db, f, input, pack } = setup();
    expect(getEmployeeDevelopment(db, f.workspaceId, "missing")).toBeNull();
    db.update(employees).set({ roleTitle: "Unknown role" }).where(eq(employees.id, f.employeeId)).run();
    expect(() => prepareEmployeeDevelopment(db, input)).toThrow(/exact role/);
    db.update(employees).set({ roleTitle: pack.roleTitle, departmentId: null }).where(eq(employees.id, f.employeeId)).run();
    expect(() => prepareEmployeeDevelopment(db, input)).toThrow(/exact role/);
    db.update(employees).set({ departmentId: f.deptId, managerUserId: f.member }).where(eq(employees.id, f.employeeId)).run();
    expect(getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!.managerReady).toBe(false);
    prepareEmployeeDevelopment(db, input);
    expect(getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!.modules[0].skill!.ownerUserId).toBe(f.owner);
  });

  it("rolls back all preparation on an unrelated reserved-slug collision", () => {
    const { db, f, input, pack } = setup();
    const expertiseModule = pack.modules[pack.modules.length - 1];
    db.update(skills).set({ slug: `development-${f.employeeId}-${pack.key}-${expertiseModule.key}-v${pack.version}` }).where(eq(skills.id, f.skillId)).run();
    expect(() => prepareEmployeeDevelopment(db, input)).toThrow(/conflict/);
    expect(db.select().from(skills).all()).toHaveLength(1);
    expect(db.select().from(auditEvents).all()).toHaveLength(0);
    expect(getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!.employee.configVersion).toBe(1);
  });

  it("excludes cross-workspace sources, assignments, departments and skill versions", () => {
    const { db, f } = setup();
    const other = buildFixture(db, { slug: "other" });
    const now = new Date().toISOString();
    db.insert(employeeSkills).values({ workspaceId: f.workspaceId, employeeId: f.employeeId, skillId: other.skillId, createdAt: now }).run();
    db.insert(employeeKnowledge).values({ workspaceId: f.workspaceId, employeeId: f.employeeId, knowledgeSourceId: other.sourceId, createdAt: now }).run();
    let view = getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!;
    expect(view.approvedSkills.map(({ skill }) => skill.id)).toEqual([f.skillId]);
    expect(view.sources.map((source) => source.id).sort()).toEqual([f.sourceId, f.pendingSourceId].sort());
    expect(view.sources.find((source) => source.id === f.pendingSourceId)?.reviewStatus).toBe("pending");
    expect(listApprovedEmployeeSkills(db, f.workspaceId, other.employeeId)).toEqual([]);
    db.update(skillVersions).set({ workspaceId: other.workspaceId }).where(eq(skillVersions.skillId, f.skillId)).run();
    expect(listApprovedEmployeeSkills(db, f.workspaceId, f.employeeId)).toEqual([]);
    db.update(employees).set({ departmentId: other.deptId, managerUserId: other.manager }).where(eq(employees.id, f.employeeId)).run();
    view = getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!;
    expect(view.department).toBeNull();
    expect(view.pack).toBeNull();
    expect(view.managerReady).toBe(false);
  });

  it("only injects approved current versions into the actual chat system prompt", async () => {
    const { db, f, input } = setup();
    prepareEmployeeDevelopment(db, input);
    const entry = getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!.modules[0];
    const marker = "UNIQUE_REVIEWED_EXPERTISE_PROCEDURE";
    db.update(skillVersions).set({ instructions: marker }).where(eq(skillVersions.id, entry.version!.id)).run();
    const employee = getEmployeeDevelopment(db, f.workspaceId, f.employeeId)!.employee;
    db.update(employees).set({ modelConfig: { ...employee.modelConfig, provider: "demo" } }).where(eq(employees.id, f.employeeId)).run();
    const spy = vi.spyOn(demoAdapter, "complete");
    const run = async () => {
      const { messageId } = postUserMessage(db, { ...input, content: "Help with a draft." });
      await generateEmployeeReply(db, { ...input, messageId });
      return spy.mock.calls.at(-1)![0].system;
    };
    expect(await run()).not.toContain(marker);
    db.update(skills).set({ status: "approved" }).where(eq(skills.id, entry.skill!.id)).run();
    expect(await run()).not.toContain(marker); // parent status alone is insufficient
    db.update(skillVersions).set({ reviewStatus: "approved" }).where(eq(skillVersions.id, entry.version!.id)).run();
    expect(await run()).toContain(marker);
    db.insert(skillVersions).values({ ...entry.version!, id: "new-current-version", version: 2, instructions: "NEW_PENDING_PROCEDURE", reviewStatus: "pending" }).run();
    db.update(skills).set({ currentVersion: 2 }).where(eq(skills.id, entry.skill!.id)).run();
    const system = await run();
    expect(system).not.toContain(marker);
    expect(system).not.toContain("NEW_PENDING_PROCEDURE");
    expect(listApprovedEmployeeSkills(db, f.workspaceId, f.employeeId).some(({ skill }) => skill.id === entry.skill!.id)).toBe(false);
  });
});
