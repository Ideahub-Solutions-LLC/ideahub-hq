import { z } from "zod";

export const CONTENT_WORKFLOW = "content_draft";
export const ContentBriefSchema = z.object({
  title: z.string().trim().min(3).max(120),
  brief: z.string().trim().min(20).max(6000),
  audience: z.string().trim().min(3).max(300),
  channel: z.string().trim().min(2).max(100),
  objective: z.string().trim().min(3).max(500),
  callToAction: z.string().trim().min(3).max(300),
  brandGuideId: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1).max(8),
  revisionNote: z.string().trim().max(2000).default(""),
});
export type ContentBrief = z.infer<typeof ContentBriefSchema>;
export const ContentOutputSchema = z.object({
  headlines: z.array(z.string().min(1).max(200)).min(1).max(5),
  outline: z.array(z.object({ heading: z.string().min(1).max(200), notes: z.string().min(1).max(1200) })).min(1).max(10),
  draft: z.string().min(1).max(12000),
  claims: z.array(z.object({ text: z.string().min(1).max(1000), sourceId: z.string(), quote: z.string().min(1).max(2000) })).max(30),
  reviewNotes: z.array(z.string().max(1000)).max(12),
});
export type ContentOutput = z.infer<typeof ContentOutputSchema>;
export type ContentSource = { id: string; title: string; version: number; hash: string; content: string; sourceRef: string; verifiedAt: string };
export type ContentDraft = {
  kind: "content_draft"; brief: ContentBrief; output: ContentOutput;
  sources: ContentSource[]; employeeConfigVersion: number;
  skill: { id: string; version: number; hash: string };
  generatedBy: string; provider: string; model: string;
  checks: { claim: string; supported: boolean; sourceId: string; quote: string }[];
  notes: string[];
};

/** Offline examples reuse supplied facts verbatim; they are never presented as live model output. */
export function demoContent(brief: ContentBrief, sources: ContentSource[]): ContentOutput {
  const source = sources.find((s) => s.id !== brief.brandGuideId) ?? sources[0];
  const quote = source.content.split(/\n/).map((s) => s.trim()).find(Boolean)!.slice(0, 600);
  return {
    headlines: [brief.title, `An introduction for ${brief.audience}`],
    outline: [{ heading: "Opening", notes: `Introduce the topic for ${brief.audience}.` }, { heading: "Approved source material", notes: quote }, { heading: "Next step", notes: brief.callToAction }],
    draft: `${brief.title}\n\n${quote}\n\n${brief.callToAction}`,
    claims: [{ text: quote, sourceId: source.id, quote }],
    reviewNotes: ["Offline Demo: this is a deterministic draft assembled from the brief and an exact source excerpt. Review brand voice, suitability and all claims before accepting."],
  };
}
export function checkContentClaims(output: ContentOutput, sources: ContentSource[]) {
  return output.claims.map((claim) => ({ claim: claim.text, sourceId: claim.sourceId, quote: claim.quote,
    supported: !!sources.find((s) => s.id === claim.sourceId && s.content.includes(claim.quote)),
  }));
}
