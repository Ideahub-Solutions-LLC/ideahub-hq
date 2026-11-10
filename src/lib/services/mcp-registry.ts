import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { actionReceipts, approvals, employees, mcpServers, mcpToolGrants, workspaceMembers, workspaces, type Approval } from "@/db/schema";
import { hashPayload, newId, nowIso } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/authz";
import { requireActor } from "./hq-profile";
import { assertMcpOriginAllowed, discoverMcpTools, validateMcpEndpoint } from "@/lib/mcp/discovery";

export const McpServerSchema = z.object({ name: z.string().trim().min(2).max(80), endpoint: z.string().trim().url().max(500), credentialEnvVar: z.string().regex(/^MCP_[A-Z0-9_]+_TOKEN$/).nullable(), ownerUserId: z.string().min(1), enabled: z.boolean() });
export function getMcpServer(db: Db, workspaceId: string, serverId: string) {
  const server = db.select().from(mcpServers).where(and(eq(mcpServers.workspaceId, workspaceId), eq(mcpServers.id, serverId))).get();
  if (!server) throw new NotFoundError("MCP server not found in this workspace.");
  return server;
}
function bumpEmployee(db: Db, workspaceId: string, employeeId: string) {
  const employee = db.select().from(employees).where(and(eq(employees.workspaceId, workspaceId), eq(employees.id, employeeId))).get();
  if (employee) db.update(employees).set({ configVersion: employee.configVersion + 1, updatedAt: nowIso() }).where(eq(employees.id, employeeId)).run();
}
export function saveMcpServer(db: Db, input: { workspaceId: string; userId: string; serverId?: string; config: unknown }) {
  requireActor(db, input.workspaceId, input.userId, "connector.manage");
  const config = McpServerSchema.parse(input.config); validateMcpEndpoint(config.endpoint);
  if (!db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, config.ownerUserId))).get()) throw new Error("Choose an owner in this workspace.");
  return db.transaction(tx => {
    const old = input.serverId ? getMcpServer(tx, input.workspaceId, input.serverId) : null;
    const stamp = nowIso(); const id = old?.id ?? newId("mcp");
    const row = { ...config, id, workspaceId: input.workspaceId, configVersion: (old?.configVersion ?? 0) + 1, tools: [], discoveryStatus: "not_checked" as const, discoveryConfigVersion: null, discoveredAt: null, detail: "Configuration saved; discovery has not run.", createdAt: old?.createdAt ?? stamp, updatedAt: stamp };
    if (old) {
      const grants = tx.select().from(mcpToolGrants).where(and(eq(mcpToolGrants.serverId, id), eq(mcpToolGrants.workspaceId, input.workspaceId), eq(mcpToolGrants.status, "active"))).all();
      tx.update(mcpToolGrants).set({ status: "revoked", revokedAt: stamp }).where(and(eq(mcpToolGrants.serverId, id), eq(mcpToolGrants.workspaceId, input.workspaceId))).run();
      for (const employeeId of new Set(grants.map(g => g.employeeId))) bumpEmployee(tx, input.workspaceId, employeeId);
      tx.update(mcpServers).set(row).where(eq(mcpServers.id, id)).run();
    } else tx.insert(mcpServers).values(row).run();
    recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "mcp.configured", entityType: "mcp_server", entityId: id, data: { configVersion: row.configVersion, enabled: config.enabled } });
    return row;
  }, { behavior: "immediate" });
}
export function isMcpDiscovery(approval: Approval) {
  return approval.connectorKey === "mcp_registry" && approval.actionType === "access_service" && approval.payload.operation === "mcp.discover" && !approval.employeeId && !approval.taskId && !approval.artifactId;
}
export type McpDiscoveryProposal = { operation: "mcp.discover"; workspaceId: string; userId: string; serverId: string };
export function proposeMcpDiscovery(db: Db, input: McpDiscoveryProposal) {
  requireActor(db, input.workspaceId, input.userId, "connector.manage");
  const server = getMcpServer(db, input.workspaceId, input.serverId);
  if (!server.enabled) throw new Error("Enable this server configuration before requesting discovery.");
  assertMcpOriginAllowed(server.endpoint);
  const pending = db.select().from(approvals).where(and(eq(approvals.workspaceId, input.workspaceId), eq(approvals.status, "pending"), eq(approvals.connectorKey, "mcp_registry"))).all().find(a => a.payload.serverId === server.id && a.payload.configVersion === server.configVersion);
  if (pending && (!pending.expiresAt || pending.expiresAt > nowIso())) return { approval: pending, created: false };
  const payload = { operation: "mcp.discover", serverId: server.id, configVersion: server.configVersion, endpoint: server.endpoint, credentialEnvVar: server.credentialEnvVar };
  const stamp = nowIso();
  const approval: Approval = { id: newId("apr"), workspaceId: input.workspaceId, employeeId: null, taskId: null, artifactId: null, actionType: "access_service", connectorKey: "mcp_registry", destination: server.endpoint, title: `Discover tools: ${server.name}`, payload, payloadHash: hashPayload(payload), context: { requestedByUserId: input.userId, administrativeCheck: true, note: "Metadata only: initialize and tools/list. No tool is invoked and no employee data is sent." }, status: "pending", requestedByEmployeeId: null, decidedByUserId: null, decisionNote: null, idempotencyKey: newId("mcpcheck"), expiresAt: new Date(Date.now() + 3600000).toISOString(), requestedAt: stamp, decidedAt: null, executedAt: null };
  db.insert(approvals).values(approval).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "approval.propose", entityType: "approval", entityId: approval.id, data: { operation: "mcp.discover", serverId: server.id } });
  return { approval, created: true };
}
export function assertMcpReviewer(db: Db, approval: Approval, userId: string) {
  if (isMcpDiscovery(approval)) requireActor(db, approval.workspaceId, userId, "connector.manage");
}
export async function executeMcpDiscovery(db: Db, approval: Approval, actorUserId?: string | null) {
  const actor = actorUserId ?? approval.decidedByUserId;
  if (!actor || !isMcpDiscovery(approval)) throw new Error("Invalid discovery approval.");
  requireActor(db, approval.workspaceId, actor, "connector.manage");
  const deadline = Date.now() + 20000;
  const claimMarker = `Discovering tool inventory · check ${approval.id}`;
  let claimed = false;
  const guard = () => {
    requireActor(db, approval.workspaceId, actor, "connector.manage");
    if (!approval.decidedByUserId) throw new Error("Discovery approval has no reviewer.");
    requireActor(db, approval.workspaceId, approval.decidedByUserId, "connector.manage");
    const current = db.select().from(approvals).where(and(eq(approvals.id, approval.id), eq(approvals.workspaceId, approval.workspaceId))).get();
    if (current?.status !== "approved" || hashPayload(current.payload) !== approval.payloadHash || Date.now() > deadline || (current.expiresAt && current.expiresAt < nowIso())) throw new Error("Discovery approval expired or changed.");
    if (db.select().from(workspaces).where(eq(workspaces.id, approval.workspaceId)).get()?.settings.emergencyStop) throw new Error("Emergency stop is active.");
    const server = getMcpServer(db, approval.workspaceId, String(approval.payload.serverId));
    const expected = { operation: "mcp.discover", serverId: server.id, configVersion: server.configVersion, endpoint: server.endpoint, credentialEnvVar: server.credentialEnvVar };
    if (!server.enabled || hashPayload(expected) !== approval.payloadHash || approval.destination !== server.endpoint) throw new Error("Server configuration changed. Request a new discovery approval.");
    if (claimed && server.detail !== claimMarker) throw new Error("A newer discovery check superseded this result.");
    assertMcpOriginAllowed(server.endpoint);
    return server;
  };
  const server = guard();
  const existing = db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, approval.idempotencyKey)).get();
  if (existing) return { approval, receipt: existing, skipped: "Discovery already attempted. Request a new check to refresh." };
  const stamp = nowIso(); const receiptId = newId("rcp");
  const inserted = db.insert(actionReceipts).values({ id: receiptId, workspaceId: approval.workspaceId, approvalId: approval.id, idempotencyKey: approval.idempotencyKey, connectorKey: "mcp_registry", mode: "live", status: "executing", createdAt: stamp, updatedAt: stamp }).onConflictDoNothing().run();
  if (!inserted.changes) return { approval, receipt: db.select().from(actionReceipts).where(eq(actionReceipts.idempotencyKey, approval.idempotencyKey)).get()!, skipped: "Discovery is already in progress." };
  db.update(mcpServers).set({ discoveryStatus: "not_checked", detail: claimMarker, updatedAt: stamp }).where(eq(mcpServers.id, server.id)).run();
  claimed = true;
  try {
    const tools = await discoverMcpTools(server);
    db.transaction(tx => {
      guard(); const done = nowIso();
      const grants = tx.select().from(mcpToolGrants).where(and(eq(mcpToolGrants.workspaceId, approval.workspaceId), eq(mcpToolGrants.serverId, server.id), eq(mcpToolGrants.status, "active"))).all();
      for (const grant of grants) if (!tools.some(t => t.name === grant.toolName && t.hash === grant.toolHash)) {
        tx.update(mcpToolGrants).set({ status: "revoked", revokedAt: done }).where(eq(mcpToolGrants.id, grant.id)).run(); bumpEmployee(tx, approval.workspaceId, grant.employeeId);
      }
      tx.update(mcpServers).set({ tools, discoveryStatus: "discovered", discoveryConfigVersion: server.configVersion, discoveredAt: done, detail: `${tools.length} tool definitions discovered. Tool invocation is not enabled.`, updatedAt: done }).where(eq(mcpServers.id, server.id)).run();
      tx.update(actionReceipts).set({ status: "succeeded", externalRef: `mcp-inventory:${hashPayload(tools).slice(0, 16)}`, result: { toolCount: tools.length, simulated: false, discoveryOnly: true, summary: "MCP metadata discovered. No tool was invoked and no business data was sent." }, updatedAt: done }).where(eq(actionReceipts.id, receiptId)).run();
      tx.update(approvals).set({ status: "executed", executedAt: done }).where(eq(approvals.id, approval.id)).run();
      recordAudit(tx, { workspaceId: approval.workspaceId, actorUserId: actor, action: "mcp.discovered", entityType: "mcp_server", entityId: server.id, data: { toolCount: tools.length, inventoryHash: hashPayload(tools) } });
    }, { behavior: "immediate" });
  } catch {
    const detail = "Discovery failed or configuration/access changed. Check the endpoint, credential, allowlist and protocol support. No tool was invoked.";
    db.transaction(tx => {
      tx.update(actionReceipts).set({ status: "failed", result: { simulated: false, discoveryOnly: true, summary: detail }, updatedAt: nowIso() }).where(eq(actionReceipts.id, receiptId)).run();
      tx.update(approvals).set({ status: "execution_failed" }).where(eq(approvals.id, approval.id)).run();
      const current = getMcpServer(tx, approval.workspaceId, server.id);
      if (current.configVersion === server.configVersion && current.detail === claimMarker) tx.update(mcpServers).set({ discoveryStatus: "failed", detail, updatedAt: nowIso() }).where(eq(mcpServers.id, server.id)).run();
      recordAudit(tx, { workspaceId: approval.workspaceId, actorUserId: actor, action: "mcp.discovery_failed", entityType: "mcp_server", entityId: server.id });
    });
  }
  return { approval: db.select().from(approvals).where(eq(approvals.id, approval.id)).get()!, receipt: db.select().from(actionReceipts).where(eq(actionReceipts.id, receiptId)).get()!, skipped: null };
}
export function mcpGrantAvailable(db: Db, workspaceId: string, grant: typeof mcpToolGrants.$inferSelect) {
  const server = getMcpServer(db, workspaceId, grant.serverId);
  return grant.workspaceId === workspaceId && grant.status === "active" && mcpInventoryCurrent(server) && server.configVersion === grant.serverConfigVersion && server.tools.some(t => t.name === grant.toolName && t.hash === grant.toolHash);
}
export function mcpInventoryCurrent(server: typeof mcpServers.$inferSelect) {
  return server.enabled && server.discoveryStatus === "discovered" && server.discoveryConfigVersion === server.configVersion && !!server.discoveredAt && Date.now() - Date.parse(server.discoveredAt) < 86400000;
}
export function grantMcpTool(db: Db, input: { workspaceId: string; userId: string; serverId: string; employeeId: string; toolName: string; policy: "reviewed_read" | "approval_required"; toolHash: string; configVersion: number }) {
  requireActor(db, input.workspaceId, input.userId, "connector.grant");
  if (!["reviewed_read", "approval_required"].includes(input.policy)) throw new Error("Choose a reviewed tool policy.");
  const employee = db.select().from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.workspaceId, input.workspaceId))).get();
  if (!employee) throw new NotFoundError("Employee not found in this workspace.");
  const server = getMcpServer(db, input.workspaceId, input.serverId);
  const tool = server.tools.find(t => t.name === input.toolName);
  if (!tool || tool.hash !== input.toolHash || server.configVersion !== input.configVersion) throw new Error("Tool definition changed. Review the current inventory first.");
  const row = { id: newId("mcpg"), workspaceId: input.workspaceId, serverId: server.id, employeeId: employee.id, toolName: tool.name, toolHash: tool.hash, serverConfigVersion: server.configVersion, policy: input.policy, status: "active" as const, grantedByUserId: input.userId, createdAt: nowIso(), revokedAt: null };
  if (!mcpGrantAvailable(db, input.workspaceId, row)) throw new Error("Discover the enabled server's current tool inventory before assigning tools.");
  db.transaction(tx => {
    tx.insert(mcpToolGrants).values(row).onConflictDoUpdate({ target: [mcpToolGrants.workspaceId, mcpToolGrants.employeeId, mcpToolGrants.serverId, mcpToolGrants.toolName], set: { ...row, id: undefined } }).run();
    bumpEmployee(tx, input.workspaceId, employee.id);
    recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "mcp.tool_assigned", entityType: "employee", entityId: employee.id, data: { serverId: server.id, toolName: tool.name, toolHash: tool.hash, policy: input.policy } });
  });
}
export function revokeMcpTool(db: Db, input: { workspaceId: string; userId: string; grantId: string }) {
  requireActor(db, input.workspaceId, input.userId, "connector.grant");
  const grant = db.select().from(mcpToolGrants).where(and(eq(mcpToolGrants.id, input.grantId), eq(mcpToolGrants.workspaceId, input.workspaceId))).get();
  if (!grant) throw new NotFoundError("Tool assignment not found.");
  db.transaction(tx => { tx.update(mcpToolGrants).set({ status: "revoked", revokedAt: nowIso() }).where(eq(mcpToolGrants.id, grant.id)).run(); bumpEmployee(tx, input.workspaceId, grant.employeeId); recordAudit(tx, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "mcp.tool_revoked", entityType: "employee", entityId: grant.employeeId, data: { grantId: grant.id } }); });
}
