"use server";
import { requirePermission } from "@/lib/auth/context";
import { describeError, flashRedirect, list, str } from "@/lib/actions-util";
import { startContentTask } from "@/lib/services/content";

export async function submitContentBrief(employeeId: string, data: FormData) {
  const ctx = await requirePermission("task.run_workflow");
  let taskId: string;
  try {
    const brandGuideId = str(data, "brandGuideId");
    const task = startContentTask(ctx.db, { workspaceId: ctx.workspace.id, employeeId, requestedByUserId: ctx.user.id, submissionKey: str(data, "submissionKey"), input: {
      title: str(data, "title"), brief: str(data, "brief"), audience: str(data, "audience"), channel: str(data, "channel"), objective: str(data, "objective"), callToAction: str(data, "callToAction"), brandGuideId, sourceIds: [...new Set([brandGuideId, ...list(data, "sourceIds")])],
    } });
    taskId = task.id;
  } catch (error) {
    flashRedirect(`/employees/${employeeId}/content/new`, { error: describeError(error) });
  }
  flashRedirect(`/office?employee=${encodeURIComponent(employeeId)}`, { ok: `Content brief queued. Open its task to inspect draft and review. ${taskId}` });
}
