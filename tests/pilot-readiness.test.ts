import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { artifacts, employeeSkills, employees, knowledgeSources, skills, skillVersions, workspaceMembers, workspaces } from "@/db/schema";
import { buildFixture, freshDb } from "./fixture";
import { newId, nowIso } from "@/lib/ids";
import { getDashboardCounts, getPilotReadiness } from "@/lib/services/pilot-readiness";
import { createTask } from "@/lib/services/tasks";

function setup() {
  const db = freshDb();
  const f = buildFixture(db);
  const skill = db.select().from(skills).where(eq(skills.id, f.skillId)).get()!;
  const version = db.select().from(skillVersions).where(eq(skillVersions.skillId, f.skillId)).get()!;
  const id = newId("skl");
  db.insert(skills).values({ ...skill, id, slug: "weekly-summary", name: "Weekly summary", workflowKey: "weekly_summary" }).run();
  db.insert(skillVersions).values({ ...version, id: newId("skv"), skillId: id }).run();
  db.insert(employeeSkills).values({ workspaceId: f.workspaceId, employeeId: f.employeeId, skillId: id, createdAt: nowIso() }).run();
  return { db, f, summarySkillId: id };
}

const configured = (result: ReturnType<typeof getPilotReadiness>, key: string) => result.checks.find((c) => c.key === key)?.configured;

describe("pilot configuration diagnostics", () => {
  it("reports both workflows and approved source without treating configuration as launch approval", () => {
    const { db, f } = setup();
    const result = getPilotReadiness(db, f.workspaceId);
    expect(result.configured).toBe(7);
    expect(result.employee?.name).toBe("Harper");
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.every((e) => e.reviewed === 0)).toBe(true);
  });

  it("does not choose an arbitrary pilot when multiple employees are marked", () => {
    const { db, f } = setup();
    const employee = db.select().from(employees).where(eq(employees.id, f.employeeId)).get()!;
    db.insert(employees).values({ ...employee, id: newId("emp"), slug: "second" }).run();
    const result = getPilotReadiness(db, f.workspaceId);
    expect(result.employee).toBeNull();
    expect(configured(result, "employee")).toBe(false);
  });

  it("requires a reviewer role in the same workspace", () => {
    const { db, f } = setup();
    const foreign = buildFixture(db, { slug: "foreign" });
    db.update(employees).set({ managerUserId: foreign.manager }).where(eq(employees.id, f.employeeId)).run();
    expect(configured(getPilotReadiness(db, f.workspaceId), "manager")).toBe(false);
    db.update(employees).set({ managerUserId: f.member }).where(eq(employees.id, f.employeeId)).run();
    expect(configured(getPilotReadiness(db, f.workspaceId), "manager")).toBe(false);
  });

  it("requires the current skill version approval, not an old approved version", () => {
    const { db, f, summarySkillId } = setup();
    db.update(skills).set({ currentVersion: 2 }).where(eq(skills.id, summarySkillId)).run();
    expect(configured(getPilotReadiness(db, f.workspaceId), "skills")).toBe(false);
  });

  it("does not count stale or untraceable meeting sources", () => {
    const { db, f } = setup();
    db.update(knowledgeSources).set({ reviewStatus: "stale" }).where(eq(knowledgeSources.id, f.sourceId)).run();
    expect(configured(getPilotReadiness(db, f.workspaceId), "sources")).toBe(false);
    db.update(knowledgeSources).set({ reviewStatus: "approved", sourceRef: "  " }).where(eq(knowledgeSources.id, f.sourceId)).run();
    expect(configured(getPilotReadiness(db, f.workspaceId), "sources")).toBe(false);
  });

  it("shows stop and review-policy gaps without changing state", () => {
    const { db, f } = setup();
    const ws = db.select().from(workspaces).where(eq(workspaces.id, f.workspaceId)).get()!;
    const employee = db.select().from(employees).where(eq(employees.id, f.employeeId)).get()!;
    db.update(workspaces).set({ settings: { ...ws.settings, emergencyStop: true } }).where(eq(workspaces.id, f.workspaceId)).run();
    db.update(employees).set({ authority: { ...employee.authority, requireReviewForDrafts: false } }).where(eq(employees.id, f.employeeId)).run();
    const result = getPilotReadiness(db, f.workspaceId);
    expect(configured(result, "stop")).toBe(false);
    expect(configured(result, "review")).toBe(false);
    expect(db.select().from(workspaces).where(eq(workspaces.id, f.workspaceId)).get()!.settings.emergencyStop).toBe(true);
  });

  it("keeps evidence and counts inside the selected workspace and beyond preview limits", () => {
    const { db, f } = setup();
    const other = buildFixture(db, { slug: "other" });
    for (let i = 0; i < 12; i++) createTask(db, { workspaceId: f.workspaceId, title: `Task ${i}`, objective: "Fictional test", requestedByUserId: f.manager });
    createTask(db, { workspaceId: other.workspaceId, title: "Other task", objective: "Fictional test", requestedByUserId: other.manager });
    const now = nowIso();
    db.insert(artifacts).values({ id: newId("art"), workspaceId: other.workspaceId, employeeId: other.employeeId, taskId: null, kind: "draft_action_list", title: "Other draft", content: {}, version: 1, status: "reviewed", reviewedByUserId: other.manager, reviewNote: null, createdAt: now, updatedAt: now }).run();
    expect(getDashboardCounts(db, f.workspaceId).active).toBe(12);
    expect(getPilotReadiness(db, f.workspaceId).evidence.every((e) => e.reviewed === 0)).toBe(true);
    db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, other.workspaceId)).run();
  });
});
