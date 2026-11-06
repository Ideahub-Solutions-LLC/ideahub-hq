import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { knowledgeSources, memories, memoryProposals, skillVersions, skills, type ReviewStatus } from "@/db/schema";
import { newId, nowIso, slugify } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/authz";

export const KnowledgeSourceSchema = z.object({
  title: z.string().min(2).max(120),
  type: z.enum(["document", "note", "url", "meeting_record", "procedure"]),
  content: z.string().min(1).max(50_000),
  sourceRef: z.string().max(300).nullable(),
  departmentId: z.string().nullable(),
});

export function createKnowledgeSource(db: Db, input: { workspaceId: string; userId: string; data: z.infer<typeof KnowledgeSourceSchema> }) {
  const id = newId("ks");
  const now = nowIso();
  db.insert(knowledgeSources).values({ id, workspaceId: input.workspaceId, departmentId: input.data.departmentId, title: input.data.title, type: input.data.type, content: input.data.content, sourceRef: input.data.sourceRef, ownerUserId: input.userId, reviewStatus: "pending", version: 1, lastVerifiedAt: null, createdAt: now, updatedAt: now }).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "knowledge.create", entityType: "knowledge_source", entityId: id, data: { title: input.data.title, type: input.data.type } });
  return id;
}

export function updateKnowledgeSource(db: Db, input: { workspaceId: string; id: string; userId: string; data: z.infer<typeof KnowledgeSourceSchema> }) {
  const existing = db.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, input.id), eq(knowledgeSources.workspaceId, input.workspaceId))).get();
  if (!existing) throw new NotFoundError("Knowledge source not found.");
  const contentChanged = existing.content !== input.data.content;
  db.update(knowledgeSources)
    .set({ ...input.data, version: contentChanged ? existing.version + 1 : existing.version, reviewStatus: contentChanged ? "pending" : existing.reviewStatus, updatedAt: nowIso() })
    .where(eq(knowledgeSources.id, existing.id))
    .run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "knowledge.update", entityType: "knowledge_source", entityId: existing.id, data: { contentChanged, version: contentChanged ? existing.version + 1 : existing.version } });
}

export function setKnowledgeReview(db: Db, input: { workspaceId: string; id: string; userId: string; status: ReviewStatus }) {
  const existing = db.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, input.id), eq(knowledgeSources.workspaceId, input.workspaceId))).get();
  if (!existing) throw new NotFoundError("Knowledge source not found.");
  db.update(knowledgeSources).set({ reviewStatus: input.status, lastVerifiedAt: input.status === "approved" ? nowIso() : existing.lastVerifiedAt, updatedAt: nowIso() }).where(eq(knowledgeSources.id, existing.id)).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: `knowledge.${input.status}`, entityType: "knowledge_source", entityId: existing.id });
}

export const SkillSchema = z.object({
  name: z.string().min(2).max(80),
  purpose: z.string().min(2).max(400),
  instructions: z.string().min(1).max(20_000),
  inputs: z.string().max(1000),
  outputs: z.string().max(1000),
  requiredTools: z.array(z.string().max(60)).max(10),
  changeNote: z.string().max(300).nullable(),
});

export function createSkill(db: Db, input: { workspaceId: string; userId: string; data: z.infer<typeof SkillSchema> }) {
  const id = newId("skl");
  const now = nowIso();
  const base = slugify(input.data.name) || "skill";
  let slug = base;
  for (let i = 2; db.select().from(skills).where(and(eq(skills.workspaceId, input.workspaceId), eq(skills.slug, slug))).get(); i++) slug = `${base}-${i}`;
  db.insert(skills).values({ id, workspaceId: input.workspaceId, name: input.data.name, slug, purpose: input.data.purpose, workflowKey: null, ownerUserId: input.userId, status: "draft", currentVersion: 1, createdAt: now, updatedAt: now }).run();
  db.insert(skillVersions).values({ id: newId("skv"), workspaceId: input.workspaceId, skillId: id, version: 1, instructions: input.data.instructions, inputs: input.data.inputs, outputs: input.data.outputs, requiredTools: input.data.requiredTools, requiredApprovals: ["review_draft"], reviewStatus: "pending", changeNote: input.data.changeNote ?? "Initial version", createdByUserId: input.userId, createdAt: now }).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "skill.create", entityType: "skill", entityId: id, data: { name: input.data.name } });
  return id;
}

/** Every edit to instructions creates a new version (never overwrites history). */
export function addSkillVersion(db: Db, input: { workspaceId: string; skillId: string; userId: string; data: z.infer<typeof SkillSchema> }) {
  const skill = db.select().from(skills).where(and(eq(skills.id, input.skillId), eq(skills.workspaceId, input.workspaceId))).get();
  if (!skill) throw new NotFoundError("Skill not found.");
  const version = skill.currentVersion + 1;
  const now = nowIso();
  db.insert(skillVersions).values({ id: newId("skv"), workspaceId: input.workspaceId, skillId: skill.id, version, instructions: input.data.instructions, inputs: input.data.inputs, outputs: input.data.outputs, requiredTools: input.data.requiredTools, requiredApprovals: ["review_draft"], reviewStatus: "pending", changeNote: input.data.changeNote ?? null, createdByUserId: input.userId, createdAt: now }).run();
  db.update(skills).set({ name: input.data.name, purpose: input.data.purpose, currentVersion: version, status: skill.status === "approved" ? "review" : skill.status, updatedAt: now }).where(eq(skills.id, skill.id)).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "skill.new_version", entityType: "skill", entityId: skill.id, data: { version, changeNote: input.data.changeNote ?? null } });
  return version;
}

export function setSkillStatus(db: Db, input: { workspaceId: string; skillId: string; userId: string; status: "draft" | "review" | "approved" | "retired" }) {
  const skill = db.select().from(skills).where(and(eq(skills.id, input.skillId), eq(skills.workspaceId, input.workspaceId))).get();
  if (!skill) throw new NotFoundError("Skill not found.");
  db.update(skills).set({ status: input.status, updatedAt: nowIso() }).where(eq(skills.id, skill.id)).run();
  if (input.status === "approved") {
    db.update(skillVersions).set({ reviewStatus: "approved" }).where(and(eq(skillVersions.skillId, skill.id), eq(skillVersions.version, skill.currentVersion))).run();
  }
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: `skill.${input.status}`, entityType: "skill", entityId: skill.id, data: { version: skill.currentVersion } });
}

export function reviewMemoryProposal(db: Db, input: { workspaceId: string; proposalId: string; userId: string; decision: "approve" | "reject"; note?: string; scope?: "employee" | "department" | "workspace" }) {
  const proposal = db.select().from(memoryProposals).where(and(eq(memoryProposals.id, input.proposalId), eq(memoryProposals.workspaceId, input.workspaceId))).get();
  if (!proposal) throw new NotFoundError("Memory proposal not found.");
  if (proposal.status !== "proposed") throw new Error(`Proposal already ${proposal.status}.`);
  const now = nowIso();
  db.update(memoryProposals).set({ status: input.decision === "approve" ? "approved" : "rejected", reviewedByUserId: input.userId, reviewNote: input.note ?? null, reviewedAt: now }).where(eq(memoryProposals.id, proposal.id)).run();
  if (input.decision === "approve") {
    db.insert(memories).values({ id: newId("mem"), workspaceId: input.workspaceId, employeeId: proposal.employeeId, proposalId: proposal.id, kind: proposal.kind, content: proposal.content, sourceRef: proposal.sourceRef, scope: input.scope ?? "employee", approvedByUserId: input.userId, createdAt: now }).run();
  }
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: `memory.${input.decision}`, entityType: "memory_proposal", entityId: proposal.id, data: { kind: proposal.kind } });
}

export function forgetMemory(db: Db, input: { workspaceId: string; memoryId: string; userId: string }) {
  const m = db.select().from(memories).where(and(eq(memories.id, input.memoryId), eq(memories.workspaceId, input.workspaceId))).get();
  if (!m) throw new NotFoundError("Memory not found.");
  db.delete(memories).where(eq(memories.id, m.id)).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "memory.delete", entityType: "memory", entityId: m.id });
}
