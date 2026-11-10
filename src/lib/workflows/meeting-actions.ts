/**
 * Pilot workflow A — "Meeting record → draft action list".
 *
 * Deterministic, source-linked extraction. Every item carries the line number and the exact
 * excerpt it came from. Owners are only "identified" when they match a workspace roster entry;
 * a name that appears in the source but is not a roster member is "unverified"; no name at all
 * is "missing". Nothing is invented: unknown owners and dates stay blank and are flagged.
 *
 * Model-generated drafts pass through `groundDraft`: unsupported fields stay visible as
 * suggestions with review flags. Lexical checks do not establish semantic correctness.
 */

export type RosterEntry = { userId: string; name: string; aliases?: string[] };

export type OwnerStatus = "identified" | "unverified" | "missing";
export type DueStatus = "stated" | "relative" | "missing";

export type ActionItem = {
  id: string;
  title: string;
  proposedOwner: string | null;
  proposedOwnerUserId: string | null;
  ownerStatus: OwnerStatus;
  ownerNote: string | null;
  dueText: string | null;
  dueStatus: DueStatus;
  sourceLine: number;
  sourceExcerpt: string;
  confidence: "high" | "medium" | "low";
  flags: string[];
};

export type SourcedStatement = {
  text: string;
  sourceLine: number;
  sourceExcerpt: string;
  // Optional for existing stored drafts. A text match is not a truth/entailment check.
  groundingStatus?: "source_text_match" | "needs_review";
  flags?: string[];
};

export type DraftActionList = {
  kind: "draft_action_list";
  sourceId: string;
  sourceTitle: string;
  generatedBy: string; // "deterministic-extractor-v1" or "<provider>:<model> + grounding"
  items: ActionItem[];
  decisions: SourcedStatement[];
  openQuestions: SourcedStatement[];
  stats: { items: number; missingOwners: number; unverifiedOwners: number; missingDueDates: number; decisions: number; openQuestions: number };
  notes: string[];
  disclaimer: string;
};

const DISCLAIMER = "AI-generated draft for human review. Source matches check wording, not meaning. Unsupported suggestions, blanks and flags must be resolved before anything is assigned or sent.";

type Section = "actions" | "decisions" | "questions" | "other";

const SECTION_PATTERNS: [RegExp, Section][] = [
  [/^(#+\s*)?(action items?|actions?|next steps?|follow[- ]?ups?|to[- ]?dos?)\b/i, "actions"],
  [/^(#+\s*)?(decisions?|agreed|agreements?|outcomes?)\b/i, "decisions"],
  [/^(#+\s*)?(open (questions|items|points)|questions?|unresolved|parking lot|risks?)\b/i, "questions"],
  [/^(#+\s*)?(attendees|participants|agenda|summary|notes|discussion|context|overview|recap)\b/i, "other"],
];

const BULLET = /^\s*(?:[-*•▪◦]|\d+[.)]|\[[ xX]?\])\s+/;
const DAY_WORDS = "(?:mon|tues|tue|wednes|wed|thurs|thu|fri|satur|sat|sun)(?:day)?";
const MONTHS = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
const DATE_RE = new RegExp(
  `\\b(?:by|due|before|until|on|no later than)\\s+((?:next\\s+)?${DAY_WORDS}|tomorrow|today|next week|this week|end of (?:the )?(?:week|month|day|quarter)|eow|eod|eom|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|${MONTHS}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTHS}\\.?(?:\\s+\\d{4})?)`,
  "i",
);
const ABSOLUTE_DATE_RE = new RegExp(`^(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|${MONTHS}\\.?\\s+\\d{1,2}|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTHS})`, "i");
const NAME = "([A-Z][a-zA-Z'’.-]+(?:\\s+[A-Z][a-zA-Z'’.-]+)?)";
const OWNER_PATTERNS: RegExp[] = [
  new RegExp(`^owner\\s*[:\\-]\\s*${NAME}`, "i"),
  new RegExp(`^${NAME}\\s+(?:will|to|is going to|should|owns|takes|needs? to|has to|must|can|agreed to|volunteered to)\\b`),
  new RegExp(`\\(${NAME}\\)\\s*$`),
  /@([A-Za-z][\w.-]*)/,
  new RegExp(`\\b(?:assigned to|assignee|handled by|owned by|lead(?:er)?:)\\s*${NAME}`, "i"),
];
const NOT_A_NAME = new Set(["Decision", "Action", "Owner", "Note", "Open", "Question", "Next", "Follow", "Todo", "Task", "We", "The", "Team", "Client", "Everyone", "Someone", "Nobody", "Marketing", "Sales", "Ops", "Operations", "Dev", "Development", "Creative", "Support"]);

const ACTION_VERBS = /\b(will|to|should|needs? to|has to|must|owns?|send|prepare|draft|schedule|update|review|set up|create|follow up|confirm|share|write|finalize|book|collect|publish|fix|ship|deliver|circulate|post|email|call|check|complete|finish|coordinate|organize|document)\b/i;
const DECISION_RE = /^(decision|decided|agreed|we agreed|we decided|approved)\b|\b(decision:|was approved|is approved|agreed to proceed|will proceed with|going with)\b/i;
const QUESTION_RE = /\?\s*$|^(open|question|unresolved|tbd|to be decided|needs decision|pending decision)\b/i;
const ACTION_PREFIX = /^(action|todo|to do|task|follow[- ]?up|next step)\s*[:\-]\s*/i;
const DECISION_PREFIX = /^(decision|decided|agreed)\s*[:\-]\s*/i;
const QUESTION_PREFIX = /^(open question|question|open|unresolved|tbd)\s*[:\-]\s*/i;

function cleanLine(line: string) {
  return line.replace(BULLET, "").replace(/\*\*/g, "").trim();
}

function detectSection(line: string): Section | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Headings are short lines, optionally ending with ":", often markdown headers.
  const looksLikeHeading = /^#+\s/.test(trimmed) || /^[A-Za-z][A-Za-z /-]{2,40}:?\s*$/.test(trimmed);
  if (!looksLikeHeading) return null;
  for (const [re, section] of SECTION_PATTERNS) if (re.test(trimmed)) return section;
  return null;
}

export function findRosterMatch(candidate: string, roster: RosterEntry[]): RosterEntry | null {
  const c = candidate.trim().toLowerCase().replace(/[.’']/g, "");
  if (!c) return null;
  const normalize = (value: string) => value.toLowerCase().replace(/[.’']/g, "");
  const exact = roster.filter((entry) => normalize(entry.name) === c);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const matches = roster.filter((entry) => {
    const full = normalize(entry.name);
    const parts = full.split(/\s+/);
    return c === parts[0] || (entry.aliases ?? []).some((alias) => normalize(alias) === c)
      || (parts.length > 1 && c === `${parts[0]} ${parts[1][0]}`);
  });
  return matches.length === 1 ? matches[0] : null;
}

function detectOwner(text: string, roster: RosterEntry[]): { candidate: string | null; match: RosterEntry | null } {
  for (const re of OWNER_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const candidate = m[1]?.trim();
    if (!candidate || NOT_A_NAME.has(candidate.split(/\s+/)[0])) continue;
    return { candidate, match: findRosterMatch(candidate, roster) };
  }
  return { candidate: null, match: null };
}

function detectDue(text: string): { dueText: string | null; dueStatus: DueStatus } {
  const m = text.match(DATE_RE);
  if (!m) return { dueText: null, dueStatus: "missing" };
  const phrase = m[1].replace(/[.,;:]+$/, "");
  return { dueText: phrase, dueStatus: ABSOLUTE_DATE_RE.test(phrase) ? "stated" : "relative" };
}

function titleFrom(text: string, candidate: string | null): string {
  let t = text.replace(ACTION_PREFIX, "").replace(/^owner\s*[:\-]\s*[A-Za-z .'’-]+?\s*[:\-—]\s*/i, "");
  if (candidate) {
    t = t.replace(new RegExp(`^${escapeRe(candidate)}\\s+(?:will|to|is going to|should|owns|takes|needs? to|has to|must|can|agreed to|volunteered to)\\s+`), "");
    t = t.replace(new RegExp(`\\s*\\(${escapeRe(candidate)}\\)\\s*$`), "");
  }
  t = t.replace(/\s+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : text;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractMeetingActions(input: { content: string; roster: RosterEntry[]; sourceId: string; sourceTitle: string }): DraftActionList {
  const lines = input.content.split(/\r?\n/);
  const items: ActionItem[] = [];
  const decisions: SourcedStatement[] = [];
  const openQuestions: SourcedStatement[] = [];
  let section: Section = "other";
  let seq = 0;

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const sec = detectSection(raw);
    if (sec) {
      section = sec;
      return;
    }
    const text = cleanLine(raw);
    if (!text || text.length < 4) return;
    const isBullet = BULLET.test(raw);

    let kind: "action" | "decision" | "question" | null = null;
    if (ACTION_PREFIX.test(text)) kind = "action";
    else if (DECISION_PREFIX.test(text) || DECISION_RE.test(text)) kind = "decision";
    else if (QUESTION_PREFIX.test(text) || QUESTION_RE.test(text)) kind = "question";
    else if (section === "actions" && isBullet) kind = "action";
    else if (section === "decisions" && isBullet) kind = "decision";
    else if (section === "questions" && isBullet) kind = "question";
    else if (isBullet && ACTION_VERBS.test(text) && detectOwner(text, input.roster).candidate) kind = "action";

    if (kind === "decision") {
      decisions.push({ text: text.replace(DECISION_PREFIX, ""), sourceLine: lineNo, sourceExcerpt: text });
      return;
    }
    if (kind === "question") {
      openQuestions.push({ text: text.replace(QUESTION_PREFIX, ""), sourceLine: lineNo, sourceExcerpt: text });
      return;
    }
    if (kind !== "action") return;

    const { candidate, match } = detectOwner(text, input.roster);
    const due = detectDue(text);
    const flags: string[] = [];
    let ownerStatus: OwnerStatus = "missing";
    let ownerNote: string | null = "No owner stated in the source. A human must assign one.";
    if (match) {
      ownerStatus = "identified";
      ownerNote = null;
    } else if (candidate) {
      ownerStatus = "unverified";
      ownerNote = `“${candidate}” appears in the source but cannot be uniquely matched to a workspace member. Confirm who this is before assigning.`;
      flags.push("owner_unverified");
    } else {
      flags.push("owner_missing");
    }
    if (due.dueStatus === "missing") flags.push("due_missing");
    if (due.dueStatus === "relative") flags.push("due_relative");

    seq += 1;
    items.push({
      id: `item-${seq}`,
      title: titleFrom(text, candidate),
      proposedOwner: match ? match.name : candidate,
      proposedOwnerUserId: match ? match.userId : null,
      ownerStatus,
      ownerNote,
      dueText: due.dueText,
      dueStatus: due.dueStatus,
      sourceLine: lineNo,
      sourceExcerpt: text,
      confidence: section === "actions" || ACTION_PREFIX.test(text) ? "high" : "medium",
      flags,
    });
  });

  const notes: string[] = [];
  if (items.length === 0) notes.push("No action items were detected. Check that the source uses an “Action items” section or explicit “Action:” lines.");
  const missingOwners = items.filter((i) => i.ownerStatus === "missing").length;
  const unverifiedOwners = items.filter((i) => i.ownerStatus === "unverified").length;
  const missingDueDates = items.filter((i) => i.dueStatus === "missing").length;
  if (missingOwners) notes.push(`${missingOwners} item(s) have no owner in the source.`);
  if (unverifiedOwners) notes.push(`${unverifiedOwners} item(s) have an owner who cannot be uniquely matched to a workspace member.`);
  if (missingDueDates) notes.push(`${missingDueDates} item(s) have no due date in the source.`);

  return {
    kind: "draft_action_list",
    sourceId: input.sourceId,
    sourceTitle: input.sourceTitle,
    generatedBy: "deterministic-extractor-v1",
    items,
    decisions,
    openQuestions,
    stats: { items: items.length, missingOwners, unverifiedOwners, missingDueDates, decisions: decisions.length, openQuestions: openQuestions.length },
    notes,
    disclaimer: DISCLAIMER,
  };
}

/**
 * Conservative lexical grounding, not semantic verification. Require a whole cleaned
 * source line: substring matching can erase a negation or attach another item's evidence.
 * Paraphrases remain visible for review, but never receive a verified text-match label.
 */
export function groundDraft(draft: DraftActionList, content: string, roster: RosterEntry[]): DraftActionList {
  const lines = content.split(/\r?\n/).map(cleanLine);
  function anchor(excerpt: string, claimedLine: number) {
    const text = normalize(excerpt);
    if (!text || /[\r\n]/.test(excerpt)) return { line: 0, evidence: "", flag: "excerpt_not_in_source" };
    const matches = lines.flatMap((line, index) => normalize(line) === text ? [index + 1] : []);
    if (Number.isInteger(claimedLine) && matches.includes(claimedLine)) {
      return { line: claimedLine, evidence: lines[claimedLine - 1], flag: null };
    }
    if (matches.length === 1) return { line: matches[0], evidence: lines[matches[0] - 1], flag: null };
    return { line: 0, evidence: "", flag: matches.length ? "excerpt_ambiguous" : "excerpt_not_in_source" };
  }
  const items = draft.items.map((item, i) => {
    const flags = new Set(item.flags ?? []);
    let confidence = item.confidence ?? "medium";
    const evidence = anchor(item.sourceExcerpt ?? "", item.sourceLine);
    if (evidence.flag) {
      flags.add(evidence.flag);
      confidence = "low";
    }
    const sourceOwner = detectOwner(evidence.evidence, roster);
    let ownerStatus: OwnerStatus = "missing";
    let proposedOwnerUserId: string | null = null;
    let proposedOwner = item.proposedOwner?.trim() || null;
    let ownerNote: string | null = "No supported owner provided. A human must confirm the source before assigning.";
    if (proposedOwner) {
      const match = findRosterMatch(proposedOwner, roster);
      if (match && sourceOwner.match?.userId === match.userId) {
        ownerStatus = "identified";
        proposedOwnerUserId = match.userId;
        proposedOwner = match.name;
        ownerNote = null;
      } else {
        ownerStatus = "unverified";
        ownerNote = `“${proposedOwner}” is not uniquely supported as the owner by this cited line and the workspace roster. Treat as a suggestion only.`;
        flags.add("owner_unverified");
        confidence = "low";
      }
    } else flags.add("owner_missing");

    const dueText = item.dueText?.trim() || null;
    const sourceDue = detectDue(evidence.evidence);
    let dueStatus: DueStatus = "missing";
    if (dueText) {
      if (sourceDue.dueText && normalize(sourceDue.dueText) === normalize(dueText)) {
        dueStatus = sourceDue.dueStatus;
        if (dueStatus === "relative") flags.add("due_relative");
      } else {
        flags.add("due_not_in_source");
        confidence = "low";
      }
    } else flags.add("due_missing");

    if (!evidence.line || normalize(item.title) !== normalize(titleFrom(evidence.evidence, sourceOwner.candidate))) {
      flags.add("title_needs_review");
      confidence = "low";
    }
    return {
      ...item,
      id: item.id || `item-${i + 1}`,
      proposedOwner,
      proposedOwnerUserId,
      ownerStatus,
      ownerNote,
      dueText,
      dueStatus,
      sourceLine: evidence.line,
      confidence,
      flags: [...flags],
    };
  });
  function groundStatements(statements: SourcedStatement[], prefix: RegExp): SourcedStatement[] {
    return statements.map((statement) => {
      const evidence = anchor(statement.sourceExcerpt ?? "", statement.sourceLine);
      const flags = new Set(statement.flags ?? []);
      if (evidence.flag) flags.add(evidence.flag);
      // Only accept the complete source wording, optionally without its category label.
      const textMatches = !!evidence.line && !!normalize(statement.text)
        && normalize(statement.text) === normalize(evidence.evidence.replace(prefix, ""));
      if (!textMatches) flags.add("statement_needs_review");
      return {
        ...statement,
        sourceLine: evidence.line,
        groundingStatus: textMatches && !flags.size ? "source_text_match" : "needs_review",
        flags: [...flags],
      };
    });
  }
  const decisions = groundStatements(draft.decisions, DECISION_PREFIX);
  const openQuestions = groundStatements(draft.openQuestions, QUESTION_PREFIX);
  const missingOwners = items.filter((i) => i.ownerStatus === "missing").length;
  const unverifiedOwners = items.filter((i) => i.ownerStatus === "unverified").length;
  const missingDueDates = items.filter((i) => i.dueStatus === "missing").length;
  const notes = new Set(draft.notes);
  notes.add("Grounding checks literal source wording only, not meaning, task scope, or whether a decision is valid. Review every draft before acting.");
  const reviewStatements = [...decisions, ...openQuestions].filter((s) => s.groundingStatus === "needs_review").length;
  if (reviewStatements) notes.add(`${reviewStatements} decision/question statement(s) could not be matched to the cited source wording and need human review.`);
  return {
    ...draft,
    items,
    decisions,
    openQuestions,
    notes: [...notes],
    stats: { ...draft.stats, items: items.length, missingOwners, unverifiedOwners, missingDueDates, decisions: decisions.length, openQuestions: openQuestions.length },
    disclaimer: DISCLAIMER,
  };
}

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
