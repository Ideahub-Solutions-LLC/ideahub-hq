"use server";

import { requirePermission } from "@/lib/auth/context";
import { describeError, flashRedirect, optStr } from "@/lib/actions-util";
import { decideApproval, executeApproval, type Decision } from "@/lib/services/approvals";
import { enqueueJob } from "@/lib/jobs/queue";
import { drainJobs } from "@/lib/jobs/worker";
import { isMcpDiscovery } from "@/lib/services/mcp-registry";

export async function decideApprovalAction(approvalId: string, decision: Decision, fd: FormData) {
  const ctx = await requirePermission("approval.decide");
  let message = "";
  try {
    const approval = decideApproval(ctx.db, { workspaceId: ctx.workspace.id, approvalId, userId: ctx.user.id, role: ctx.role, decision, note: optStr(fd, "note") ?? undefined });
    if (decision === "approve" && approval.actionType !== "review_draft") {
      // Execution is durable (job) and idempotent; inline mode drains immediately for a responsive demo.
      enqueueJob(ctx.db, { workspaceId: ctx.workspace.id, kind: "approval.execute", payload: { approvalId, actorUserId: ctx.user.id } });
      if ((process.env.JOB_WORKER_MODE ?? "inline") === "inline") await drainJobs(ctx.db, { limit: 3, workspaceId: ctx.workspace.id, workerId: `inline-${ctx.user.id}` });
      message = isMcpDiscovery(approval) ? "Discovery approved. Check the connection result and receipt below; no tool invocation is authorized." : "Approved and executed through the connector. Check the receipt below — demo connectors record a simulated result.";
    } else if (decision === "approve") {
      message = "Draft marked as reviewed. Nothing was published, sent or created externally.";
    } else if (decision === "reject") {
      message = "Rejected. The task is blocked until a human decides how to proceed.";
    } else {
      message = "Changes requested. The employee's task is blocked with your note.";
    }
  } catch (e) {
    flashRedirect(`/approvals/${approvalId}`, { error: describeError(e) });
  }
  flashRedirect(`/approvals/${approvalId}`, { ok: message });
}

/** Manual retry for approvals whose execution outcome is unknown (reconciles before re-running). */
export async function retryExecutionAction(approvalId: string) {
  const ctx = await requirePermission("approval.execute");
  let note = "";
  try {
    const outcome = await executeApproval(ctx.db, { workspaceId: ctx.workspace.id, approvalId, actorUserId: ctx.user.id });
    note = outcome.skipped ?? "Executed.";
  } catch (e) {
    flashRedirect(`/approvals/${approvalId}`, { error: describeError(e) });
  }
  flashRedirect(`/approvals/${approvalId}`, { ok: note });
}
