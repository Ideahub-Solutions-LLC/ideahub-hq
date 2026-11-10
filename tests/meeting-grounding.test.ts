import { describe, expect, it } from "vitest";
import { extractMeetingActions, groundDraft, type ActionItem, type RosterEntry } from "@/lib/workflows/meeting-actions";

const roster: RosterEntry[] = [
  { userId: "sam", name: "Sam Okafor", aliases: ["ops"] },
  { userId: "riley", name: "Riley Chen" },
];
function draft(content: string) {
  return extractMeetingActions({ content, roster, sourceId: "source", sourceTitle: "Fictional sync" });
}
function groundItem(content: string, changes: Partial<ActionItem>) {
  const proposed = draft(content);
  proposed.items[0] = { ...proposed.items[0], ...changes };
  return groundDraft(proposed, content, roster).items[0];
}

describe("meeting draft evidence boundaries", () => {
  it("preserves deterministic evidence and corrects an incorrect unique line citation", () => {
    const content = "Action items\n- **Sam** will send the packet by Friday.\nDecisions\n- Decision: Keep the pilot local.\nOpen questions\n- Question: Who reviews it?";
    const proposed = draft(content);
    proposed.items[0].sourceLine = 99;
    const result = groundDraft(proposed, content, roster);
    expect(result.items[0]).toMatchObject({ sourceLine: 2, ownerStatus: "identified", proposedOwnerUserId: "sam", dueStatus: "relative", confidence: "high" });
    expect(result.decisions[0]).toMatchObject({ sourceLine: 4, groundingStatus: "source_text_match", flags: [] });
    expect(result.openQuestions[0]).toMatchObject({ sourceLine: 6, groundingStatus: "source_text_match", flags: [] });
  });

  it("does not borrow an owner or a date from another action", () => {
    const content = "Action items\n- Riley will prepare the agenda.\n- Sam will send the packet by Friday.";
    const item = groundItem(content, { proposedOwner: "Sam Okafor", proposedOwnerUserId: "sam", dueText: "Friday", dueStatus: "relative" });
    expect(item).toMatchObject({ ownerStatus: "unverified", proposedOwnerUserId: null, dueStatus: "missing", confidence: "low" });
    expect(item.flags).toEqual(expect.arrayContaining(["owner_unverified", "due_not_in_source"]));
  });

  it("does not identify a recipient as the owner even on the same line", () => {
    const item = groundItem("Action items\n- Riley will send the packet to Sam by Friday.", { proposedOwner: "Sam Okafor" });
    expect(item).toMatchObject({ ownerStatus: "unverified", proposedOwnerUserId: null });
  });

  it("does not match first-name substrings or resolve ambiguous first names", () => {
    expect(groundItem("Action items\n- Samantha will prepare the agenda.", { proposedOwner: "Sam Okafor" }).ownerStatus).toBe("unverified");
    const content = "Action items\n- Sam will prepare the agenda.";
    const proposed = draft(content);
    const result = groundDraft(proposed, content, [...roster, { userId: "other", name: "Sam Owens" }]);
    expect(result.items[0]).toMatchObject({ ownerStatus: "unverified", proposedOwnerUserId: null });
  });

  it("accepts a unique roster alias with explicit owner syntax", () => {
    const item = groundItem("Action items\n- Send the packet @ops by Friday.", {});
    expect(item).toMatchObject({ ownerStatus: "identified", proposedOwnerUserId: "sam" });
  });

  it.each([
    "Sam will send the packet by Friday.",
    "NOT Sam will send the packet by Friday.",
    "Sam will send the packet by Friday.\nAnother sentence.",
  ])("rejects altered, partial or multiline evidence: %s", (sourceExcerpt) => {
    const content = "Action items\n- Do NOT Sam will send the packet by Friday.";
    const item = groundItem(content, { sourceExcerpt, proposedOwner: "Sam Okafor", dueText: "Friday" });
    expect(item).toMatchObject({ sourceLine: 0, confidence: "low", ownerStatus: "unverified", dueStatus: "missing" });
    expect(item.flags).toContain("excerpt_not_in_source");
  });

  it("does not arbitrarily repair an ambiguous excerpt citation", () => {
    const content = "Action items\n- Sam will send the packet.\n- Sam will send the packet.";
    expect(groundItem(content, { sourceLine: 99 })).toMatchObject({ sourceLine: 0, ownerStatus: "unverified", flags: expect.arrayContaining(["excerpt_ambiguous"]) });
    expect(groundItem(content, { sourceLine: 3 })).toMatchObject({ sourceLine: 3, ownerStatus: "identified" });
  });

  it("rejects partial or unrelated dates even when they occur in the cited line", () => {
    const content = "Action items\n- Sam will review Friday's notes by 2026-11-14.";
    for (const dueText of ["Friday", "2026", "2026-11"]) {
      expect(groundItem(content, { dueText })).toMatchObject({ dueStatus: "missing", flags: expect.arrayContaining(["due_not_in_source"]) });
    }
    expect(groundItem(content, { dueText: "2026-11-14" }).dueStatus).toBe("stated");
  });

  it("flags a fabricated title even when its citation is real", () => {
    const item = groundItem("Action items\n- Sam will review the draft.", { title: "Publish the approved draft" });
    expect(item).toMatchObject({ confidence: "low", flags: expect.arrayContaining(["title_needs_review"]) });
  });

  it("flags fabricated decisions and questions without discarding their review evidence", () => {
    const content = "Decisions\n- Decision: Do not publish the draft.\nOpen questions\n- Question: Who reviews it?";
    const proposed = draft(content);
    proposed.decisions[0].text = "Publish the draft.";
    proposed.openQuestions[0].sourceExcerpt = "Who funds it?";
    const result = groundDraft(proposed, content, roster);
    expect(result.decisions[0]).toMatchObject({ text: "Publish the draft.", sourceLine: 2, groundingStatus: "needs_review", flags: ["statement_needs_review"] });
    expect(result.openQuestions[0]).toMatchObject({ sourceLine: 0, groundingStatus: "needs_review", flags: expect.arrayContaining(["excerpt_not_in_source"]) });
    expect(result.notes.join(" ")).toContain("2 decision/question statement(s)");
  });

  it("does not accept a negation-stripping substring as a supported statement", () => {
    const content = "Decisions\n- Decision: Never publish the draft.";
    const proposed = draft(content);
    proposed.decisions[0].text = "publish the draft.";
    expect(groundDraft(proposed, content, roster).decisions[0].groundingStatus).toBe("needs_review");
  });
});
