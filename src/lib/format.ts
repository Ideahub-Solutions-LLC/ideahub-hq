import type { ActionType, ApprovalStatus, ConnectorMode, EmployeeStatus, TaskStatus } from "@/db/schema";

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso);
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Queued",
  working: "Working",
  needs_approval: "Needs approval",
  blocked: "Blocked",
  completed: "Completed",
  paused: "Paused",
  failed: "Failed",
};

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = { draft: "Draft", active: "Active", paused: "Paused", archived: "Archived" };

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  expired: "Expired",
  executed: "Executed",
  execution_unknown: "Outcome unknown",
  execution_failed: "Execution failed",
};

export const ACTION_TYPE_LABEL: Record<ActionType, string> = {
  review_draft: "Review a draft (no external effect)",
  create_external_tasks: "Create tasks in an external system",
  send_message: "Send a message outside the platform",
  access_service: "Access a third-party service",
  update_external_record: "Update an external record",
};

export const CONNECTOR_MODE_LABEL: Record<ConnectorMode, string> = { live: "Live", demo: "Demo", disconnected: "Disconnected", planned: "Planned" };

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtTokens(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
