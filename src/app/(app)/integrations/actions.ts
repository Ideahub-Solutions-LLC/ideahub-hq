"use server";

import { requirePermission } from "@/lib/auth/context";
import { csv, describeError, flashRedirect, str } from "@/lib/actions-util";
import { grantConnector, revokeGrant, setConnectorMode } from "@/lib/services/admin";
import { CONNECTOR_MODES, type ConnectorMode } from "@/db/schema";

export async function setConnectorModeAction(connectorId: string, fd: FormData) {
  const ctx = await requirePermission("connector.manage");
  const mode = str(fd, "mode") as ConnectorMode;
  if (!CONNECTOR_MODES.includes(mode)) flashRedirect("/integrations", { error: "Invalid mode." });
  try {
    setConnectorMode(ctx.db, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, connectorId, mode });
  } catch (e) {
    flashRedirect("/integrations", { error: describeError(e) });
  }
  flashRedirect("/integrations", { ok: "Requested mode saved. The effective mode shown is computed from what is actually implemented and configured on the server." });
}

export async function grantConnectorAction(fd: FormData) {
  const ctx = await requirePermission("connector.grant");
  try {
    grantConnector(ctx.db, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, connectorId: str(fd, "connectorId"), employeeId: str(fd, "employeeId"), scopes: csv(fd, "scopes") });
  } catch (e) {
    flashRedirect("/integrations", { error: describeError(e) });
  }
  flashRedirect("/integrations", { ok: "Grant recorded. The employee can now propose actions on this connector; execution still needs approval." });
}

export async function revokeGrantAction(grantId: string) {
  const ctx = await requirePermission("connector.grant");
  try {
    revokeGrant(ctx.db, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, grantId });
  } catch (e) {
    flashRedirect("/integrations", { error: describeError(e) });
  }
  flashRedirect("/integrations", { ok: "Grant revoked. Pending approvals on this connector can no longer execute." });
}
