import type { ApprovalStatus, ConnectorMode, EmployeeStatus, TaskStatus } from "@/db/schema";
import { APPROVAL_STATUS_LABEL, CONNECTOR_MODE_LABEL, EMPLOYEE_STATUS_LABEL, TASK_STATUS_LABEL } from "@/lib/format";
import type { ReactNode } from "react";

export type Tone = "slate" | "blue" | "teal" | "amber" | "rose" | "emerald" | "violet" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  slate: "bg-slate-soft text-slate",
  blue: "bg-blue-soft text-blue",
  teal: "bg-accent-2-soft text-accent-2",
  amber: "bg-amber-soft text-amber",
  rose: "bg-rose-soft text-rose",
  emerald: "bg-emerald-soft text-emerald",
  violet: "bg-violet-soft text-violet",
  neutral: "bg-surface-2 text-ink-2 border border-line",
};

export function Badge({ tone = "neutral", children, dot, title }: { tone?: Tone; children: ReactNode; dot?: boolean; title?: string }) {
  return (
    <span className={`badge ${TONE_CLASS[tone]}`} title={title}>
      {dot && <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export const TASK_TONE: Record<TaskStatus, Tone> = { queued: "slate", working: "blue", needs_approval: "amber", blocked: "rose", completed: "emerald", paused: "neutral", failed: "rose" };
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge tone={TASK_TONE[status]} dot>
      {TASK_STATUS_LABEL[status]}
    </Badge>
  );
}

export const EMPLOYEE_TONE: Record<EmployeeStatus, Tone> = { draft: "neutral", active: "emerald", paused: "amber", archived: "slate" };
export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return (
    <Badge tone={EMPLOYEE_TONE[status]} dot>
      {EMPLOYEE_STATUS_LABEL[status]}
    </Badge>
  );
}

const APPROVAL_TONE: Record<ApprovalStatus, Tone> = { pending: "amber", approved: "blue", rejected: "rose", changes_requested: "amber", expired: "neutral", executed: "emerald", execution_unknown: "rose", execution_failed: "rose" };
export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <Badge tone={APPROVAL_TONE[status]} dot>
      {APPROVAL_STATUS_LABEL[status]}
    </Badge>
  );
}

const MODE_TONE: Record<ConnectorMode, Tone> = { live: "emerald", demo: "amber", disconnected: "rose", planned: "neutral" };
export function ModeBadge({ mode }: { mode: ConnectorMode }) {
  return (
    <Badge tone={MODE_TONE[mode]} dot title={mode === "demo" ? "Simulated — nothing leaves the platform" : undefined}>
      {CONNECTOR_MODE_LABEL[mode]}
    </Badge>
  );
}

/** Marks anything an AI employee produced or that runs on the demo provider. */
export function AiBadge({ children = "AI" }: { children?: ReactNode }) {
  return (
    <span className="badge bg-accent-soft text-accent" title="AI employee — software, not a person">
      {children}
    </span>
  );
}
