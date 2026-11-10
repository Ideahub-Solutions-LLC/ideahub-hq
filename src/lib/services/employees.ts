import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { ACTION_TYPES, EMPLOYEE_STATUSES, PROVIDERS, SENIORITY_LEVELS, employeeKnowledge, employeeSkills, employees, knowledgeSources, skills, type Employee, type EmployeeStatus } from "@/db/schema";
import { newId, nowIso, slugify } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/authz";
import { validateProfileReferences } from "./hq-profile";

export const PersonalitySchema = z.object({
  tone: z.enum(["warm", "neutral", "direct"]),
  verbosity: z.enum(["concise", "balanced", "detailed"]),
  reportingFormat: z.enum(["bullets", "narrative", "table"]),
  questionStyle: z.enum(["ask_before_acting", "batch_questions", "assume_and_flag"]),
  summary: z.string().min(1).max(600),
});

export const AuthoritySchema = z.object({
  allowedActionTypes: z.array(z.enum(ACTION_TYPES)),
  forbiddenActions: z.array(z.string().max(200)).max(20),
  requireReviewForDrafts: z.boolean(),
  maxActionsPerTask: z.number().int().min(1).max(50),
});

export const ModelConfigSchema = z.object({
  openaiApi: z.enum(["chat_completions", "responses"]).optional(),
  omitTemperature: z.boolean().optional(),
  provider: z.enum(PROVIDERS),
  model: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/, "Use an exact provider model ID without spaces."),
  temperature: z.number().min(0).max(1),
  maxOutputTokens: z.number().int().min(64).max(16000),
  fallbackProvider: z.enum(PROVIDERS).nullable(),
  fallbackModel: z.string().max(100).nullable(),
  perTaskBudgetCents: z.number().int().min(0).nullable(),
  monthlyBudgetCents: z.number().int().min(0).nullable(),
}).superRefine((v, ctx) => {
  if (v.fallbackProvider && (!v.fallbackModel?.trim() || v.fallbackProvider === v.provider)) ctx.addIssue({ code: "custom", message: "Choose a different fallback provider and an explicit fallback model.", path: ["fallbackModel"] });
  if (!v.fallbackProvider && v.fallbackModel) ctx.addIssue({ code: "custom", message: "Select a fallback provider or clear the fallback model.", path: ["fallbackModel"] });
});

export const EmployeeProfileSchema = z.object({
  name: z.string().min(2).max(60),
  roleTitle: z.string().min(2).max(80),
  departmentId: z.string().nullable(),
  managerUserId: z.string().nullable(),
  seniority: z.enum(SENIORITY_LEVELS),
  bio: z.string().min(1).max(1200),
  channels: z.array(z.string().max(60)).max(10),
  personality: PersonalitySchema,
});

export function getEmployee(db: Db, workspaceId: string, id: string) {
  return db.query.employees.findFirst({
    where: and(eq(employees.id, id), eq(employees.workspaceId, workspaceId)),
    with: { department: true, manager: true, skills: { with: { skill: true } }, knowledge: { with: { source: true } } },
  }).sync();
}

export function listEmployees(db: Db, workspaceId: string) {
  return db.query.employees.findMany({ where: eq(employees.workspaceId, workspaceId), with: { department: true, manager: true }, orderBy: (e, { asc }) => [asc(e.name)] }).sync();
}

export function createEmployee(db: Db, input: { workspaceId: string; userId: string; profile: z.infer<typeof EmployeeProfileSchema> }): Employee {
  validateProfileReferences(db, input.workspaceId, input.profile);
  const now = nowIso();
  const base = slugify(input.profile.name) || "employee";
  let slug = base;
  for (let i = 2; db.select().from(employees).where(and(eq(employees.workspaceId, input.workspaceId), eq(employees.slug, slug))).get(); i++) slug = `${base}-${i}`;
  const employee: Employee = {
    id: newId("emp"),
    workspaceId: input.workspaceId,
    departmentId: input.profile.departmentId,
    name: input.profile.name,
    slug,
    roleTitle: input.profile.roleTitle,
    status: "draft",
    seniority: input.profile.seniority,
    managerUserId: input.profile.managerUserId,
    avatarSeed: slug,
    bio: input.profile.bio,
    personality: input.profile.personality,
    // Least privilege: a new employee can only ask for draft reviews until an admin widens it.
    authority: { allowedActionTypes: ["review_draft"], forbiddenActions: ["Send external messages", "Make purchases", "Change access or permissions"], requireReviewForDrafts: true, maxActionsPerTask: 5 },
    modelConfig: { provider: "anthropic", model: process.env.ANTHROPIC_DEFAULT_MODEL || "claude-sonnet-4-5", temperature: 0.2, maxOutputTokens: 2000, fallbackProvider: null, fallbackModel: null, perTaskBudgetCents: 100, monthlyBudgetCents: 2000 },
    channels: input.profile.channels,
    configVersion: 1,
    isPilot: false,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(employees).values(employee).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "employee.create", entityType: "employee", entityId: employee.id, data: { name: employee.name } });
  return employee;
}

function bump(db: Db, employee: Employee, patch: Partial<Employee>, userId: string, action: string, data?: Record<string, unknown>) {
  db.update(employees).set({ ...patch, configVersion: employee.configVersion + 1, updatedAt: nowIso() }).where(eq(employees.id, employee.id)).run();
  recordAudit(db, { workspaceId: employee.workspaceId, actorUserId: userId, action, entityType: "employee", entityId: employee.id, data: { ...data, configVersion: employee.configVersion + 1 } });
}

function mustGet(db: Db, workspaceId: string, id: string) {
  const e = db.select().from(employees).where(and(eq(employees.id, id), eq(employees.workspaceId, workspaceId))).get();
  if (!e) throw new NotFoundError("Employee not found.");
  return e;
}

export function updateEmployeeProfile(db: Db, input: { workspaceId: string; employeeId: string; userId: string; profile: z.infer<typeof EmployeeProfileSchema> }) {
  validateProfileReferences(db, input.workspaceId, input.profile);
  const e = mustGet(db, input.workspaceId, input.employeeId);
  bump(db, e, { ...input.profile }, input.userId, "employee.update_profile", { fields: Object.keys(input.profile) });
}

export function updateEmployeeAuthority(db: Db, input: { workspaceId: string; employeeId: string; userId: string; authority: z.infer<typeof AuthoritySchema> }) {
  const e = mustGet(db, input.workspaceId, input.employeeId);
  bump(db, e, { authority: input.authority }, input.userId, "employee.update_authority", { allowedActionTypes: input.authority.allowedActionTypes });
}

export function updateEmployeeModelConfig(db: Db, input: { workspaceId: string; employeeId: string; userId: string; modelConfig: z.infer<typeof ModelConfigSchema> }) {
  input.modelConfig = ModelConfigSchema.parse(input.modelConfig);
  const e = mustGet(db, input.workspaceId, input.employeeId);
  bump(db, e, { modelConfig: input.modelConfig }, input.userId, "employee.update_model", { provider: input.modelConfig.provider, model: input.modelConfig.model });
}

export function setEmployeeStatus(db: Db, input: { workspaceId: string; employeeId: string; userId: string; status: EmployeeStatus; reason?: string }) {
  if (!EMPLOYEE_STATUSES.includes(input.status)) throw new Error("Invalid status");
  const e = mustGet(db, input.workspaceId, input.employeeId);
  bump(db, e, { status: input.status }, input.userId, `employee.${input.status}`, { reason: input.reason ?? null, from: e.status });
}

export function setEmployeeSkills(db: Db, input: { workspaceId: string; employeeId: string; userId: string; skillIds: string[] }) {
  const ids = [...new Set(input.skillIds)];
  return db.transaction((tx) => {
    const e = mustGet(tx, input.workspaceId, input.employeeId);
    for (const id of ids) if (!tx.select().from(skills).where(and(eq(skills.id, id), eq(skills.workspaceId, input.workspaceId))).get()) throw new NotFoundError("Skill not found in this workspace.");
    tx.delete(employeeSkills).where(eq(employeeSkills.employeeId, e.id)).run();
    for (const skillId of ids) tx.insert(employeeSkills).values({ employeeId: e.id, skillId, workspaceId: e.workspaceId, createdAt: nowIso() }).run();
    bump(tx, e, {}, input.userId, "employee.update_skills", { skillIds: input.skillIds });
  }, { behavior: "immediate" });
}

export function setEmployeeKnowledge(db: Db, input: { workspaceId: string; employeeId: string; userId: string; sourceIds: string[] }) {
  const ids = [...new Set(input.sourceIds)];
  return db.transaction((tx) => {
    const e = mustGet(tx, input.workspaceId, input.employeeId);
    for (const id of ids) if (!tx.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.workspaceId, input.workspaceId))).get()) throw new NotFoundError("Knowledge source not found in this workspace.");
    tx.delete(employeeKnowledge).where(eq(employeeKnowledge.employeeId, e.id)).run();
    for (const id of ids) tx.insert(employeeKnowledge).values({ employeeId: e.id, knowledgeSourceId: id, workspaceId: e.workspaceId, createdAt: nowIso() }).run();
    bump(tx, e, {}, input.userId, "employee.update_knowledge", { sourceIds: input.sourceIds });
  }, { behavior: "immediate" });
}
