import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { employeeKnowledge, knowledgeSources, memories, type KnowledgeSource } from "@/db/schema";

/**
 * Permission-aware retrieval. Only knowledge sources that are (a) approved and (b) explicitly
 * linked to the employee are ever considered. This is a lightweight keyword scorer; the index
 * can later be replaced by a vector store without changing callers (treat the index as rebuildable).
 */
export type Snippet = { sourceId: string; title: string; excerpt: string; score: number; sourceRef: string | null; version: number; lastVerifiedAt: string | null; paragraph: number; truncated: boolean };

export function approvedSourcesForEmployee(db: Db, workspaceId: string, employeeId: string): KnowledgeSource[] {
  const links = db.select({ id: employeeKnowledge.knowledgeSourceId }).from(employeeKnowledge).where(and(eq(employeeKnowledge.employeeId, employeeId), eq(employeeKnowledge.workspaceId, workspaceId))).all();
  if (links.length === 0) return [];
  return db
    .select()
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.workspaceId, workspaceId), eq(knowledgeSources.reviewStatus, "approved"), inArray(knowledgeSources.id, links.map((l) => l.id))))
    .all();
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "we", "our", "you", "your", "it", "this", "that", "with", "as", "at", "be", "by", "do", "does", "what", "how", "can", "i", "me", "my", "please", "about", "from"]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

export function retrieveSnippets(sources: KnowledgeSource[], query: string, limit = 3): Snippet[] {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];
  const results: Snippet[] = [];
  for (const src of sources) {
    const paragraphs = src.content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let best: { score: number; text: string; paragraph: number } | null = null;
    for (const [index, p] of paragraphs.entries()) {
      const lower = p.toLowerCase();
      let score = 0;
      for (const t of terms) if (lower.includes(t)) score += 1;
      if (src.title.toLowerCase().split(/\s+/).some((w) => terms.includes(w))) score += 0.5;
      if (score > 0 && (!best || score > best.score)) best = { score, text: p, paragraph: index + 1 };
    }
    if (best) results.push({ sourceId: src.id, title: src.title, excerpt: best.text.length > 400 ? `${best.text.slice(0, 399)}…` : best.text, score: best.score, sourceRef: src.sourceRef, version: src.version, lastVerifiedAt: src.lastVerifiedAt, paragraph: best.paragraph, truncated: best.text.length > 400 });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function approvedMemories(db: Db, workspaceId: string, employeeId: string) {
  return db.select().from(memories).where(and(eq(memories.workspaceId, workspaceId), eq(memories.employeeId, employeeId))).all();
}
