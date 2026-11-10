"use server";
import { requirePermission } from "@/lib/auth/context";
import { bool, describeError, flashRedirect, optStr, str } from "@/lib/actions-util";
import { grantMcpTool, revokeMcpTool, saveMcpServer } from "@/lib/services/mcp-registry";
import { proposeAction } from "@/lib/services/approvals";
export async function saveMcpServerAction(serverId: string | null, fd: FormData) {
  const ctx = await requirePermission("connector.manage"); let id = serverId;
  try { id = saveMcpServer(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, serverId: serverId ?? undefined, config: { name: str(fd, "name"), endpoint: str(fd, "endpoint"), credentialEnvVar: optStr(fd, "credentialEnvVar"), ownerUserId: str(fd, "ownerUserId"), enabled: bool(fd, "enabled") } }).id; }
  catch (e) { flashRedirect(serverId ? `/integrations/mcp/${serverId}` : "/integrations/mcp", { error: describeError(e) }); }
  flashRedirect(`/integrations/mcp/${id}`, { ok: "Server configuration saved. Discovery and tool assignment require review." });
}
export async function requestMcpDiscoveryAction(serverId: string) {
  const ctx = await requirePermission("connector.manage"); let approvalId = "";
  try { approvalId = proposeAction(ctx.db, { operation: "mcp.discover", workspaceId: ctx.workspace.id, userId: ctx.user.id, serverId }).approval.id; }
  catch (e) { flashRedirect(`/integrations/mcp/${serverId}`, { error: describeError(e) }); }
  flashRedirect(`/approvals/${approvalId}`, { ok: "Review the exact endpoint and metadata request before discovery runs." });
}
export async function grantMcpToolAction(serverId: string, toolName: string, toolHash: string, configVersion: number, fd: FormData) {
  const ctx = await requirePermission("connector.grant");
  try { grantMcpTool(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, serverId, employeeId: str(fd, "employeeId"), toolName, toolHash, configVersion, policy: str(fd, "policy") as "reviewed_read" | "approval_required" }); }
  catch (e) { flashRedirect(`/integrations/mcp/${serverId}`, { error: describeError(e) }); }
  flashRedirect(`/integrations/mcp/${serverId}`, { ok: "Reviewed assignment saved. Employee tool invocation is not enabled in this build." });
}
export async function revokeMcpToolAction(serverId: string, grantId: string) {
  const ctx = await requirePermission("connector.grant");
  try { revokeMcpTool(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, grantId }); }
  catch (e) { flashRedirect(`/integrations/mcp/${serverId}`, { error: describeError(e) }); }
  flashRedirect(`/integrations/mcp/${serverId}`, { ok: "Tool assignment revoked." });
}
