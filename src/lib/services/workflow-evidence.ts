import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { employeeKnowledge, employees, knowledgeSources } from "@/db/schema";
import { nowIso } from "@/lib/ids";
import { ModelConfigSchema } from "./employees";

const MeetingSourceEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: z.string(),
  sourceId: z.string().min(1),
  sourceVersion: z.number().int().positive(),
  sourceTitle: z.string(),
  sourceRef: z.string().nullable(),
  sourceContent: z.string(),
  sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceLastVerifiedAt: z.string().nullable(),
  employee: z.object({ id: z.string().min(1), configVersion: z.number().int().positive(), modelConfig: ModelConfigSchema }),
});

export type MeetingSourceEvidence = z.infer<typeof MeetingSourceEvidenceSchema>;

/** Server-only: legacy or malformed evidence is never silently trusted. */
export function parseMeetingSourceEvidence(value: unknown): MeetingSourceEvidence | null {
  const parsed = MeetingSourceEvidenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function contentHash(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function captureMeetingSourceEvidence(source: typeof knowledgeSources.$inferSelect, employee: typeof employees.$inferSelect): MeetingSourceEvidence {
  return {
    schemaVersion: 1,
    capturedAt: nowIso(),
    sourceId: source.id,
    sourceVersion: source.version,
    sourceTitle: source.title,
    sourceRef: source.sourceRef,
    sourceContent: source.content,
    sourceContentHash: contentHash(source.content),
    sourceLastVerifiedAt: source.lastVerifiedAt,
    employee: { id: employee.id, configVersion: employee.configVersion, modelConfig: { ...employee.modelConfig } },
  };
}

/** Revalidate both the captured bytes and current authorization, without any side effects. */
export function assertMeetingSourceEvidenceCurrent(db: Db, input: { workspaceId: string; employeeId: string; sourceId: unknown; evidence: unknown }): MeetingSourceEvidence {
  const evidence = parseMeetingSourceEvidence(input.evidence);
  const rerun = "Rerun the meeting workflow with an approved source and review the new draft before proposing follow-up.";
  if (!evidence) throw new Error(`This draft has no valid captured source evidence. ${rerun}`);
  if (evidence.sourceId !== input.sourceId || evidence.employee.id !== input.employeeId || contentHash(evidence.sourceContent) !== evidence.sourceContentHash) {
    throw new Error(`The draft's captured source evidence does not match its source or employee. ${rerun}`);
  }
  const source = db.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, evidence.sourceId), eq(knowledgeSources.workspaceId, input.workspaceId))).get();
  if (!source || source.reviewStatus !== "approved") throw new Error(`The meeting source is missing or no longer approved. ${rerun}`);
  const employee = db.select().from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.workspaceId, input.workspaceId))).get();
  const access = db.select().from(employeeKnowledge).where(and(eq(employeeKnowledge.workspaceId, input.workspaceId), eq(employeeKnowledge.employeeId, input.employeeId), eq(employeeKnowledge.knowledgeSourceId, source.id))).get();
  if (!employee || !access) throw new Error(`The employee no longer has access to the meeting source. ${rerun}`);
  if (source.version !== evidence.sourceVersion || contentHash(source.content) !== evidence.sourceContentHash || source.title !== evidence.sourceTitle || source.sourceRef !== evidence.sourceRef || source.lastVerifiedAt !== evidence.sourceLastVerifiedAt) {
    throw new Error(`The meeting source has changed since this draft was generated. ${rerun}`);
  }
  return evidence;
}
