"use server";

import { requirePermission } from "@/lib/auth/context";
import { csv, describeError, flashRedirect, optStr, str } from "@/lib/actions-util";
import { KnowledgeSourceSchema, SkillSchema, addSkillVersion, createKnowledgeSource, createSkill, forgetMemory, reviewMemoryProposal, setKnowledgeReview, setSkillStatus, updateKnowledgeSource } from "@/lib/services/knowledge";
import type { ReviewStatus } from "@/db/schema";

function sourceFromForm(fd: FormData) {
  return KnowledgeSourceSchema.parse({ title: str(fd, "title"), type: str(fd, "type"), content: str(fd, "content"), sourceRef: optStr(fd, "sourceRef"), departmentId: optStr(fd, "departmentId") });
}

export async function createSourceAction(fd: FormData) {
  const ctx = await requirePermission("knowledge.edit");
  let id: string;
  try {
    id = createKnowledgeSource(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, data: sourceFromForm(fd) });
  } catch (e) {
    flashRedirect("/knowledge", { error: describeError(e) });
  }
  flashRedirect(`/knowledge/${id}`, { ok: "Source added as pending. Approve it before employees can use it." });
}

export async function updateSourceAction(id: string, fd: FormData) {
  const ctx = await requirePermission("knowledge.edit");
  try {
    updateKnowledgeSource(ctx.db, { workspaceId: ctx.workspace.id, id, userId: ctx.user.id, data: sourceFromForm(fd) });
  } catch (e) {
    flashRedirect(`/knowledge/${id}`, { error: describeError(e) });
  }
  flashRedirect(`/knowledge/${id}`, { ok: "Saved. Content changes create a new version and reset the review status to pending." });
}

export async function setSourceReviewAction(id: string, status: ReviewStatus) {
  const ctx = await requirePermission("knowledge.approve");
  try {
    setKnowledgeReview(ctx.db, { workspaceId: ctx.workspace.id, id, userId: ctx.user.id, status });
  } catch (e) {
    flashRedirect(`/knowledge/${id}`, { error: describeError(e) });
  }
  flashRedirect(`/knowledge/${id}`, { ok: `Source marked ${status}.` });
}

function skillFromForm(fd: FormData) {
  return SkillSchema.parse({ name: str(fd, "name"), purpose: str(fd, "purpose"), instructions: str(fd, "instructions"), inputs: str(fd, "inputs"), outputs: str(fd, "outputs"), requiredTools: csv(fd, "requiredTools"), changeNote: optStr(fd, "changeNote") });
}

export async function createSkillAction(fd: FormData) {
  const ctx = await requirePermission("skill.edit");
  let id: string;
  try {
    id = createSkill(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, data: skillFromForm(fd) });
  } catch (e) {
    flashRedirect("/skills/new", { error: describeError(e) });
  }
  flashRedirect(`/skills/${id}`, { ok: "Skill created as a draft (v1)." });
}

export async function newSkillVersionAction(skillId: string, fd: FormData) {
  const ctx = await requirePermission("skill.edit");
  let version: number;
  try {
    version = addSkillVersion(ctx.db, { workspaceId: ctx.workspace.id, skillId, userId: ctx.user.id, data: skillFromForm(fd) });
  } catch (e) {
    flashRedirect(`/skills/${skillId}`, { error: describeError(e) });
  }
  flashRedirect(`/skills/${skillId}`, { ok: `Version ${version} saved and sent for review. Employees keep using the last approved version until this one is approved.` });
}

export async function setSkillStatusAction(skillId: string, status: "draft" | "review" | "approved" | "retired") {
  const ctx = await requirePermission(status === "approved" || status === "retired" ? "skill.approve" : "skill.edit");
  try {
    setSkillStatus(ctx.db, { workspaceId: ctx.workspace.id, skillId, userId: ctx.user.id, status });
  } catch (e) {
    flashRedirect(`/skills/${skillId}`, { error: describeError(e) });
  }
  flashRedirect(`/skills/${skillId}`, { ok: `Skill is now ${status}.` });
}

export async function reviewMemoryAction(proposalId: string, decision: "approve" | "reject", fd: FormData) {
  const ctx = await requirePermission("memory.review");
  try {
    reviewMemoryProposal(ctx.db, { workspaceId: ctx.workspace.id, proposalId, userId: ctx.user.id, decision, note: optStr(fd, "note") ?? undefined, scope: (optStr(fd, "scope") as "employee" | "department" | "workspace" | null) ?? "employee" });
  } catch (e) {
    flashRedirect("/memory", { error: describeError(e) });
  }
  flashRedirect("/memory", { ok: decision === "approve" ? "Memory approved and now available to the employee." : "Proposal rejected." });
}

export async function forgetMemoryAction(memoryId: string) {
  const ctx = await requirePermission("memory.review");
  try {
    forgetMemory(ctx.db, { workspaceId: ctx.workspace.id, memoryId, userId: ctx.user.id });
  } catch (e) {
    flashRedirect("/memory", { error: describeError(e) });
  }
  flashRedirect("/memory", { ok: "Memory removed." });
}
