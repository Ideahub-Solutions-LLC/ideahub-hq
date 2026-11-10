import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { employees, knowledgeSources } from "@/db/schema";
import { approvedSourcesForEmployee, retrieveSnippets } from "@/lib/services/retrieval";
import { buildEmployeeSystemPrompt } from "@/lib/services/prompt";
import { buildFixture, freshDb } from "./fixture";
import { EXPERTISE_PACKS, matchExpertisePack } from "@/lib/employee-development/catalog";

describe("expertise source context", () => {
  it("supplies real citation metadata and makes excerpt limits explicit", () => {
    const db = freshDb();
    const f = buildFixture(db);
    db.update(knowledgeSources).set({ title: 'Guide <unsafe> "quoted"', content: `Introduction\n\nProcedure ${"evidence ".repeat(80)}`, version: 3, lastVerifiedAt: null }).where(eq(knowledgeSources.id, f.sourceId)).run();
    const snippets = retrieveSnippets(approvedSourcesForEmployee(db, f.workspaceId, f.employeeId), "procedure");
    expect(snippets).toHaveLength(1);
    expect(snippets[0]).toMatchObject({ sourceId: f.sourceId, version: 3, lastVerifiedAt: null, paragraph: 2, truncated: true });
    expect(snippets[0].excerpt).toHaveLength(400);
    const employee = db.select().from(employees).where(eq(employees.id, f.employeeId)).get()!;
    const prompt = buildEmployeeSystemPrompt({ employee, skills: [], memories: [], snippets, productName: "Test HQ" });
    expect(prompt).toContain(`source_id="${f.sourceId}" version="3" paragraph="2"`);
    expect(prompt).toContain("Guide &lt;unsafe&gt; &quot;quoted&quot;");
    expect(prompt).toContain("Recorded verification: not recorded. Excerpt is truncated.");
    expect(prompt).toContain("not a full source inventory or complete documents");
    expect(prompt).not.toContain('source="Guide <unsafe>');
  });

  it("covers all existing role categories without matching names or mismatched departments", () => {
    expect(EXPERTISE_PACKS).toHaveLength(7);
    expect(new Set(EXPERTISE_PACKS.map((p) => p.key)).size).toBe(7);
    expect(EXPERTISE_PACKS.flatMap((p) => p.modules)).toHaveLength(14);
    expect(EXPERTISE_PACKS.flatMap((p) => p.modules.flatMap((m) => m.practiceCases))).toHaveLength(28);
    for (const pack of EXPERTISE_PACKS) {
      expect(matchExpertisePack(`  ${pack.roleTitle.toUpperCase()}  `, pack.departmentSlug)).toBe(pack);
      expect(matchExpertisePack(pack.roleTitle, "unrelated")).toBeNull();
      for (const expertiseModule of pack.modules) {
        expect(expertiseModule.sourceRequirements.length).toBeGreaterThan(1);
        expect(expertiseModule.instructions).toContain("human review required");
        expect(expertiseModule.practiceCases.every((p) => p.expected.length >= 3)).toBe(true);
      }
    }
    expect(matchExpertisePack("Harper", "operations")).toBeNull();
  });
});
