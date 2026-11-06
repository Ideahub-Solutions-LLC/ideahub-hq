/**
 * Pilot workflow B — "Draft weekly status summary" from approved task records.
 *
 * Built only from platform records (tasks, approvals, events). Every line points at the
 * record it came from (`evidence`), and the draft separates completed work, blockers and
 * decisions needed. No external sources, no invented progress, no promised dates.
 */
import type { Approval, Task, TaskEvent } from "@/db/schema";

export type SummaryLine = { text: string; taskId: string | null; evidence: string; owner: string | null };

export type DraftStatusSummary = {
  kind: "draft_status_summary";
  period: { start: string; end: string };
  generatedBy: string;
  headline: string;
  completed: SummaryLine[];
  inProgress: SummaryLine[];
  blockers: SummaryLine[];
  decisionsNeeded: SummaryLine[];
  paused: SummaryLine[];
  stats: { completed: number; inProgress: number; blockers: number; decisionsNeeded: number; paused: number; recordsScanned: number };
  notes: string[];
  disclaimer: string;
};

export type SummaryInput = {
  periodStart: string; // ISO
  periodEnd: string; // ISO
  tasks: Task[];
  approvals: Approval[];
  events: TaskEvent[];
  ownerNames: Record<string, string>; // userId -> name
  employeeNames: Record<string, string>; // employeeId -> name
};

const DISCLAIMER = "Draft prepared by an AI employee from task records in this workspace. Each statement cites its record. A human must review and approve before this summary is shared anywhere.";

export function buildWeeklySummary(input: SummaryInput): DraftStatusSummary {
  const { periodStart, periodEnd } = input;
  const inPeriod = (iso: string | null | undefined) => Boolean(iso && iso >= periodStart && iso <= periodEnd);
  const ownerOf = (t: Task): string | null => {
    const human = t.ownerUserId ? (input.ownerNames[t.ownerUserId] as string | undefined) : undefined;
    if (human) return human;
    if (t.employeeId) return `${(input.employeeNames[t.employeeId] as string | undefined) ?? "AI employee"} (AI)`;
    return null;
  };

  const completed = input.tasks
    .filter((t) => t.status === "completed" && inPeriod(t.completedAt))
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""))
    .map<SummaryLine>((t) => ({ text: `${t.title} — completed ${fmtDate(t.completedAt)}`, taskId: t.id, evidence: `task:${t.id}`, owner: ownerOf(t) }));

  const inProgress = input.tasks
    .filter((t) => (t.status === "working" || t.status === "queued" || t.status === "needs_approval") && inPeriod(t.updatedAt))
    .map<SummaryLine>((t) => ({
      text: `${t.title} — ${t.status === "needs_approval" ? "awaiting review" : t.status}${t.progressPct ? ` (${t.progressPct}%)` : ""}${t.nextAction ? `; next: ${t.nextAction}` : ""}`,
      taskId: t.id,
      evidence: `task:${t.id}`,
      owner: ownerOf(t),
    }));

  const blockers = input.tasks
    .filter((t) => t.status === "blocked")
    .map<SummaryLine>((t) => ({ text: `${t.title} — blocked${t.blockedReason ? `: ${t.blockedReason}` : " (no reason recorded)"}`, taskId: t.id, evidence: `task:${t.id}`, owner: ownerOf(t) }));

  const pendingApprovals = input.approvals
    .filter((a) => a.status === "pending" || a.status === "changes_requested")
    .map<SummaryLine>((a) => ({
      text: `${a.title} — ${a.status === "pending" ? "approval pending" : "changes requested"} (${labelAction(a.actionType)} → ${a.destination})`,
      taskId: a.taskId,
      evidence: `approval:${a.id}`,
      owner: null,
    }));
  const needsApprovalTasks = input.tasks
    .filter((t) => t.status === "needs_approval" && !input.approvals.some((a) => a.taskId === t.id && (a.status === "pending" || a.status === "changes_requested")))
    .map<SummaryLine>((t) => ({ text: `${t.title} — waiting for a human decision`, taskId: t.id, evidence: `task:${t.id}`, owner: ownerOf(t) }));
  const decisionsNeeded = [...pendingApprovals, ...needsApprovalTasks];

  const paused = input.tasks
    .filter((t) => t.status === "paused")
    .map<SummaryLine>((t) => ({ text: `${t.title} — paused`, taskId: t.id, evidence: `task:${t.id}`, owner: ownerOf(t) }));

  const errorEvents = input.events.filter((e) => e.kind === "error" && inPeriod(e.createdAt));
  const notes: string[] = [`Generated from ${input.tasks.length} task record(s) and ${input.approvals.length} approval record(s) between ${fmtDate(periodStart)} and ${fmtDate(periodEnd)}.`];
  if (errorEvents.length) notes.push(`${errorEvents.length} task error event(s) were recorded in the period; see the task activity logs.`);
  if (completed.length === 0) notes.push("No tasks were completed in this period according to the records.");

  const headline = `${completed.length} completed · ${inProgress.length} in progress · ${blockers.length} blocked · ${decisionsNeeded.length} decision(s) needed`;

  return {
    kind: "draft_status_summary",
    period: { start: periodStart, end: periodEnd },
    generatedBy: "deterministic-summary-v1",
    headline,
    completed,
    inProgress,
    blockers,
    decisionsNeeded,
    paused,
    stats: { completed: completed.length, inProgress: inProgress.length, blockers: blockers.length, decisionsNeeded: decisionsNeeded.length, paused: paused.length, recordsScanned: input.tasks.length + input.approvals.length },
    notes,
    disclaimer: DISCLAIMER,
  };
}

export function summaryToMarkdown(s: DraftStatusSummary): string {
  const section = (title: string, lines: SummaryLine[]) =>
    lines.length ? [`## ${title}`, ...lines.map((l) => `- ${l.text}${l.owner ? ` _(owner: ${l.owner})_` : ""} \`${l.evidence}\``), ""] : [`## ${title}`, "_None recorded._", ""];
  return [
    `# Weekly status — ${fmtDate(s.period.start)} to ${fmtDate(s.period.end)}`,
    "",
    `**${s.headline}**`,
    "",
    ...section("Completed", s.completed),
    ...section("In progress", s.inProgress),
    ...section("Blockers", s.blockers),
    ...section("Decisions needed", s.decisionsNeeded),
    ...(s.paused.length ? section("Paused", s.paused) : []),
    "---",
    ...s.notes.map((n) => `_${n}_`),
    "",
    `_${s.disclaimer}_`,
  ].join("\n");
}

function labelAction(type: string) {
  return type.replace(/_/g, " ");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "unknown date";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}
