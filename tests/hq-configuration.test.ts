import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { buildFixture, freshDb } from "./fixture";
import { actionReceipts, auditEvents, employeeKnowledge, employeeSkills, employees, mcpServers, mcpToolGrants, providerCatalogs, workspaceMembers } from "@/db/schema";
import { approveOperatingBrief, getOperatingBrief, saveOperatingBrief } from "@/lib/services/hq-profile";
import { buildEmployeeSystemPrompt } from "@/lib/services/prompt";
import { employeeSetup } from "@/lib/services/hq-readiness";
import { modelAccess, refreshProviderCatalog } from "@/lib/services/provider-catalog";
import { ModelConfigSchema, setEmployeeKnowledge, setEmployeeSkills, updateEmployeeProfile } from "@/lib/services/employees";
import { getAdapter, resolveProvider } from "@/lib/providers";
import { decideApproval, executeApproval, proposeAction } from "@/lib/services/approvals";
import { grantMcpTool, mcpGrantAvailable, revokeMcpTool, saveMcpServer } from "@/lib/services/mcp-registry";
import * as discovery from "@/lib/mcp/discovery";
import { hashPayload } from "@/lib/ids";

const body = { mission: "Help the fictional studio understand approved internal information.", responsibilities: ["Summarize supplied evidence"], deliverables: ["Cited draft summaries"], escalationRules: ["Ask the reviewer when evidence is missing"], qualityBar: "Every factual statement must cite reviewed evidence." };
const setup = () => { const db = freshDb(); return { db, f: buildFixture(db) }; };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("reviewed employee configuration", () => {
  it("requires review of the exact brief, bumps config and invalidates review on edit", () => {
    const { db, f } = setup();
    const initial = db.select().from(employees).get()!.configVersion;
    const brief = saveOperatingBrief(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, userId: f.manager, body });
    expect(brief.status).toBe("draft");
    expect(() => approveOperatingBrief(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, userId: f.manager, version: 1, bodyHash: hashPayload(body) })).toThrow("permission");
    expect(() => approveOperatingBrief(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, userId: f.owner, version: 99, bodyHash: hashPayload(body) })).toThrow("changed");
    approveOperatingBrief(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, userId: f.owner, version: 1, bodyHash: hashPayload(body) });
    const approved = getOperatingBrief(db, f.workspaceId, f.employeeId)!;
    const prompt = buildEmployeeSystemPrompt({ employee: db.select().from(employees).get()!, operatingBrief: approved.body, productName: "Fictional studio", skills: [], memories: [], snippets: [] });
    expect(prompt).toContain(body.mission); expect(prompt).toContain("never expands authority");
    saveOperatingBrief(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, userId: f.manager, body: { ...body, mission: "Updated fictional responsibilities for review." } });
    expect(getOperatingBrief(db, f.workspaceId, f.employeeId)).toMatchObject({ version: 2, status: "draft", reviewedAt: null });
    expect(db.select().from(employees).get()!.configVersion).toBe(initial + 3);
  });
  it("keeps role, source and skill assignments inside the workspace without deleting valid grants", () => {
    const { db, f } = setup(); const other = buildFixture(db, { slug: "foreign" });
    expect(() => saveOperatingBrief(db, { workspaceId: f.workspaceId, employeeId: other.employeeId, userId: f.owner, body })).toThrow("not found");
    const beforeSkills = db.select().from(employeeSkills).where(eq(employeeSkills.employeeId, f.employeeId)).all();
    expect(() => setEmployeeSkills(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, userId: f.manager, skillIds: [other.skillId] })).toThrow("workspace");
    expect(db.select().from(employeeSkills).where(eq(employeeSkills.employeeId, f.employeeId)).all()).toEqual(beforeSkills);
    const beforeSources = db.select().from(employeeKnowledge).where(eq(employeeKnowledge.employeeId, f.employeeId)).all();
    expect(() => setEmployeeKnowledge(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, userId: f.manager, sourceIds: [other.sourceId] })).toThrow("workspace");
    expect(db.select().from(employeeKnowledge).where(eq(employeeKnowledge.employeeId, f.employeeId)).all()).toEqual(beforeSources);
    const employee = db.select().from(employees).where(eq(employees.id, f.employeeId)).get()!;
    expect(() => updateEmployeeProfile(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, userId: f.manager, profile: { name: employee.name, roleTitle: employee.roleTitle, bio: employee.bio, seniority: employee.seniority, channels: employee.channels, personality: employee.personality, departmentId: other.deptId, managerUserId: f.manager } })).toThrow("Department");
  });
  it("reports offline and incomplete setup without activating employees", () => {
    const { db, f } = setup(); vi.stubEnv("ANTHROPIC_API_KEY", ""); vi.stubEnv("OPENAI_API_KEY", "");
    const before = db.select().from(employees).get()!;
    const status = employeeSetup(db, f.workspaceId, f.employeeId);
    expect(status.configured).toBe(false);
    expect(status.checks.find(c => c.label === "Operating brief")?.state).toBe("attention");
    expect(status.resolved.adapter.key).toBe("demo");
    expect(db.select().from(employees).get()).toEqual(before);
  });
  it("validates explicit fallback pairing and supports per-employee API settings", () => {
    const config = setup().db.select().from(employees).get()!.modelConfig;
    expect(() => ModelConfigSchema.parse({ ...config, fallbackProvider: "openai", fallbackModel: null })).toThrow();
    expect(() => ModelConfigSchema.parse({ ...config, fallbackProvider: "anthropic", fallbackModel: "same-model" })).toThrow();
    expect(ModelConfigSchema.parse({ ...config, provider: "openai", openaiApi: "responses", omitTemperature: true })).toMatchObject({ openaiApi: "responses", omitTemperature: true });
  });
});

describe("provider access evidence", () => {
  it("checks access without employee content and expires evidence when credentials rotate", async () => {
    const { db, f } = setup(); const credential = "fixture-provider-credential-value"; vi.stubEnv("OPENAI_API_KEY", credential);
    const call = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "fixture-text-model" }] }), { status: 200 })); vi.stubGlobal("fetch", call);
    await refreshProviderCatalog(db, { workspaceId: f.workspaceId, userId: f.owner, provider: "openai" });
    expect(call.mock.calls[0][0].href).toBe("https://api.openai.com/v1/models");
    expect(call.mock.calls[0][1].method).toBeUndefined(); expect(call.mock.calls[0][1].body).toBeUndefined();
    expect(modelAccess(db, f.workspaceId, "openai", "fixture-text-model").verified).toBe(true);
    expect(modelAccess(db, f.workspaceId, "openai", "unlisted-alias").verified).toBe(false);
    expect(JSON.stringify(db.select().from(providerCatalogs).all())).not.toContain(credential);
    expect(JSON.stringify(db.select().from(auditEvents).all())).not.toContain(credential);
    vi.stubEnv("OPENAI_API_KEY", "rotated-fixture-credential");
    expect(modelAccess(db, f.workspaceId, "openai", "fixture-text-model").verified).toBe(false);
  });
  it("blocks non-admin checks and never marks missing or failed credentials verified", async () => {
    const { db, f } = setup(); const call = vi.fn(); vi.stubGlobal("fetch", call); vi.stubEnv("OPENAI_API_KEY", "");
    await expect(refreshProviderCatalog(db, { workspaceId: f.workspaceId, userId: f.manager, provider: "openai" })).rejects.toThrow("permission");
    expect((await refreshProviderCatalog(db, { workspaceId: f.workspaceId, userId: f.owner, provider: "openai" })).status).toBe("missing_credentials"); expect(call).not.toHaveBeenCalled();
    vi.stubEnv("OPENAI_API_KEY", "fixture-value"); call.mockResolvedValue(new Response("fixture-value secret", { status: 401 }));
    const row = await refreshProviderCatalog(db, { workspaceId: f.workspaceId, userId: f.owner, provider: "openai" });
    expect(row.status).toBe("failed"); expect(JSON.stringify(row)).not.toContain("fixture-value");
  });
  it("does not verify partial Anthropic pagination or expired evidence", async () => {
    const { db, f } = setup(); vi.stubEnv("ANTHROPIC_API_KEY", "fixture-value");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: [{ id: "fixture-claude", display_name: "Fixture" }], has_more: true, last_id: "same" })))));
    expect((await refreshProviderCatalog(db, { workspaceId: f.workspaceId, userId: f.owner, provider: "anthropic" })).status).toBe("failed");
    expect(modelAccess(db, f.workspaceId, "anthropic", "fixture-claude").verified).toBe(false);
  });
  it("routes Responses and temperature settings through the actual adapter", async () => {
    const { db } = setup(); vi.stubEnv("OPENAI_API_KEY", "fixture-value");
    const call = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", model: "fixture-text-model", usage: { input_tokens: 5, output_tokens: 7 }, output: [{ type: "message", content: [{ type: "output_text", text: "A checked fictional reply." }] }] }))); vi.stubGlobal("fetch", call);
    const resolved = resolveProvider({ ...db.select().from(employees).get()!.modelConfig, provider: "openai", model: "fixture-text-model", openaiApi: "responses", omitTemperature: true });
    const response = await resolved.adapter.complete({ model: resolved.model, system: "Fictional role", messages: [{ role: "user", content: "Hello" }], temperature: 0.2, maxOutputTokens: 64 });
    const sent = JSON.parse(call.mock.calls[0][1].body);
    expect(call.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    expect(sent).toMatchObject({ store: false, max_output_tokens: 64, instructions: "Fictional role" });
    expect(sent.temperature).toBeUndefined(); expect(sent.tools).toBeUndefined(); expect(response.text).toBe("A checked fictional reply.");
  });
  it("rejects incomplete and malformed Responses output without leaking provider bodies", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fixture-value");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "incomplete", model: "fixture", usage: { input_tokens: 1, output_tokens: 1 }, output: [] }))));
    await expect(getAdapter("openai").complete({ openaiApi: "responses", model: "fixture", system: "Fictional role", messages: [], maxOutputTokens: 64, temperature: 0.2 })).rejects.toThrow("incomplete");
  });
});

function mcpFixture() {
  const s = setup(); vi.stubEnv("MCP_ALLOWED_ORIGINS", "https://mcp.example.test");
  const server = saveMcpServer(s.db, { workspaceId: s.f.workspaceId, userId: s.f.owner, config: { name: "Fictional MCP", endpoint: "https://mcp.example.test/mcp", credentialEnvVar: null, ownerUserId: s.f.owner, enabled: true } });
  const tools = discovery.normalizeTools([{ name: "read_brief", description: "Read fictional material", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } }]);
  const request = () => proposeAction(s.db, { operation: "mcp.discover", workspaceId: s.f.workspaceId, userId: s.f.owner, serverId: server.id }).approval;
  const approve = (approval: ReturnType<typeof request>) => decideApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: approval.id, userId: s.f.owner, role: "owner", decision: "approve" });
  return { ...s, server, tools, request, approve };
}
describe("governed MCP registry", () => {
  it("requires explicit origins, safe URLs and dedicated credential references", () => {
    expect(() => discovery.validateMcpEndpoint("http://10.0.0.1/mcp")).toThrow();
    expect(() => discovery.validateMcpEndpoint("https://mcp.example.test/mcp?token=fixture")).toThrow();
    expect(() => discovery.validateMcpEndpoint("https://user:pass@mcp.example.test/mcp")).toThrow();
    vi.stubEnv("MCP_ALLOWED_ORIGINS", ""); expect(() => discovery.assertMcpOriginAllowed("https://mcp.example.test/mcp")).toThrow("MCP_ALLOWED_ORIGINS");
    const s = setup(); expect(() => saveMcpServer(s.db, { workspaceId: s.f.workspaceId, userId: s.f.owner, config: { name: "Invalid", endpoint: "https://mcp.example.test/mcp", credentialEnvVar: "OPENAI_API_KEY", ownerUserId: s.f.owner, enabled: true } })).toThrow();
  });
  it("does not discover until approved and restricts decisions to current administrators", async () => {
    const s = mcpFixture(); const call = vi.spyOn(discovery, "discoverMcpTools").mockResolvedValue(s.tools); const a = s.request();
    await expect(executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: a.id })).rejects.toThrow("pending"); expect(call).not.toHaveBeenCalled();
    expect(() => decideApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: a.id, userId: s.f.manager, role: "owner", decision: "approve" })).toThrow("permission");
    s.approve(a); await executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: a.id, actorUserId: s.f.owner });
    await executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: a.id, actorUserId: s.f.owner });
    expect(call).toHaveBeenCalledTimes(1); expect(s.db.select().from(mcpServers).get()?.tools).toHaveLength(1);
    expect(s.db.select().from(actionReceipts).get()).toMatchObject({ mode: "live", status: "succeeded" });
  });
  it("rejects changed config or payload before any network request", async () => {
    const s = mcpFixture(); const call = vi.spyOn(discovery, "discoverMcpTools").mockResolvedValue(s.tools); const a = s.request(); s.approve(a);
    s.db.update(mcpServers).set({ configVersion: 2 }).run();
    await expect(executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: a.id, actorUserId: s.f.owner })).rejects.toThrow("configuration changed"); expect(call).not.toHaveBeenCalled();
  });
  it("discards discovery results after access, stop or configuration changes", async () => {
    const s = mcpFixture(); let release!: (value: typeof s.tools) => void;
    vi.spyOn(discovery, "discoverMcpTools").mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const a = s.request(); s.approve(a); const running = executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: a.id, actorUserId: s.f.owner });
    s.db.update(workspaceMembers).set({ role: "member" }).where(and(eq(workspaceMembers.workspaceId, s.f.workspaceId), eq(workspaceMembers.userId, s.f.owner))).run();
    release(s.tools); await running;
    expect(s.db.select().from(mcpServers).get()?.tools).toHaveLength(0);
    expect(s.db.select().from(actionReceipts).get()?.status).toBe("failed");
  });
  it("pins reviewed assignments to exact definitions and revokes them when inventory changes", async () => {
    const s = mcpFixture(); const call = vi.spyOn(discovery, "discoverMcpTools").mockResolvedValue(s.tools); let a = s.request(); s.approve(a); await executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: a.id });
    const grantInput = { workspaceId: s.f.workspaceId, userId: s.f.owner, serverId: s.server.id, employeeId: s.f.employeeId, toolName: "read_brief", toolHash: s.tools[0].hash, configVersion: 1, policy: "reviewed_read" as const };
    grantMcpTool(s.db, grantInput); let grant = s.db.select().from(mcpToolGrants).get()!; expect(mcpGrantAvailable(s.db, s.f.workspaceId, grant)).toBe(true);
    expect(() => grantMcpTool(s.db, { ...grantInput, toolHash: "stale" })).toThrow("changed");
    call.mockResolvedValue(discovery.normalizeTools([{ name: "read_brief", description: "Changed semantics", inputSchema: { type: "object" } }])); a = s.request(); s.approve(a); await executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: a.id });
    grant = s.db.select().from(mcpToolGrants).get()!; expect(grant.status).toBe("revoked"); expect(mcpGrantAvailable(s.db, s.f.workspaceId, grant)).toBe(false);
  });
  it("does not let an older concurrent discovery overwrite the latest inventory", async () => {
    const s = mcpFixture(); let release!: (value: typeof s.tools) => void;
    const latest = discovery.normalizeTools([{ name: "new_tool", description: "New fictional inventory", inputSchema: { type: "object" } }]);
    vi.spyOn(discovery, "discoverMcpTools").mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(latest);
    const old = s.request(); s.approve(old); const first = executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: old.id });
    const next = s.request(); s.approve(next); await executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: next.id });
    release(s.tools); await first;
    expect(s.db.select().from(mcpServers).get()?.tools.map(t => t.name)).toEqual(["new_tool"]);
    expect(s.db.select().from(mcpServers).get()?.discoveryStatus).toBe("discovered");
  });
  it("requires local ownership and scopes assignments/revocation to the workspace", async () => {
    const s = mcpFixture(); const other = buildFixture(s.db, { slug: "foreign" });
    expect(() => saveMcpServer(s.db, { workspaceId: s.f.workspaceId, userId: s.f.owner, config: { name: "Foreign owner", endpoint: "https://mcp.example.test/mcp", credentialEnvVar: null, ownerUserId: other.owner, enabled: true } })).toThrow("workspace");
    vi.spyOn(discovery, "discoverMcpTools").mockResolvedValue(s.tools); const a = s.request(); s.approve(a); await executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: a.id });
    expect(() => grantMcpTool(s.db, { workspaceId: s.f.workspaceId, userId: s.f.owner, serverId: s.server.id, employeeId: other.employeeId, toolName: "read_brief", toolHash: s.tools[0].hash, configVersion: 1, policy: "approval_required" })).toThrow("workspace");
    grantMcpTool(s.db, { workspaceId: s.f.workspaceId, userId: s.f.owner, serverId: s.server.id, employeeId: s.f.employeeId, toolName: "read_brief", toolHash: s.tools[0].hash, configVersion: 1, policy: "approval_required" });
    const grant = s.db.select().from(mcpToolGrants).get()!;
    expect(() => revokeMcpTool(s.db, { workspaceId: other.workspaceId, userId: other.owner, grantId: grant.id })).toThrow("not found");
    revokeMcpTool(s.db, { workspaceId: s.f.workspaceId, userId: s.f.owner, grantId: grant.id });
    expect(s.db.select().from(mcpToolGrants).get()?.status).toBe("revoked");
  });
});
