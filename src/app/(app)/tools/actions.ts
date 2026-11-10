"use server";
import { requirePermission } from "@/lib/auth/context";
import { describeError, flashRedirect, optStr, str } from "@/lib/actions-util";
import { saveAppSetup, setAppDisabled } from "@/lib/services/apps";
export async function saveAppSetupAction(appKey: string, fd: FormData) {
  const ctx = await requirePermission("connector.manage");
  try {
    saveAppSetup(ctx.db, {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      appKey,
      accountLabel: str(fd, "accountLabel"),
      ownerUserId: str(fd, "ownerUserId"),
      departmentId: optStr(fd, "departmentId"),
      employeeId: optStr(fd, "employeeId"),
      mcpServerId: optStr(fd, "mcpServerId"),
      requestedScopes: fd.getAll("requestedScopes").map(String),
    });
  } catch (e) {
    flashRedirect(`/tools/apps/${appKey}`, { error: describeError(e) });
  }
  flashRedirect("/tools", {
    ok: "App setup saved. Review the connection status before relying on external access; no account was authorized automatically.",
  });
}
export async function setAppDisabledAction(
  id: string,
  version: number,
  disabled: boolean,
) {
  const ctx = await requirePermission("connector.manage");
  try {
    setAppDisabled(ctx.db, {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      id,
      version,
      disabled,
    });
  } catch (e) {
    flashRedirect("/tools", { error: describeError(e) });
  }
  flashRedirect("/tools", {
    ok: disabled
      ? "Saved setup disabled. Native connector and MCP grants are managed separately."
      : "Setup enabled. Connection requirements still apply.",
  });
}
