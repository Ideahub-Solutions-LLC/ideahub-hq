import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverMcpTools } from "@/lib/mcp/discovery";
import { startMcpFixture } from "./helpers/mcp-server";
const fixtures: Awaited<ReturnType<typeof startMcpFixture>>[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.close(); vi.unstubAllEnvs(); });
describe("MCP Streamable HTTP discovery over real loopback transport", () => {
  it.each([false, true])("negotiates and paginates metadata with SSE=%s without calling tools", async sse => {
    const fixture = await startMcpFixture({ sse }); fixtures.push(fixture);
    vi.stubEnv("MCP_ALLOWED_ORIGINS", fixture.origin); vi.stubEnv("MCP_FIXTURE_TOKEN", "fictional-local-token");
    const tools = await discoverMcpTools({ endpoint: fixture.endpoint, credentialEnvVar: "MCP_FIXTURE_TOKEN" });
    expect(tools.map(t => t.name)).toEqual(["find_record", "read_brief"]);
    expect(fixture.requests.filter(r => r.body.method === "tools/list")).toHaveLength(2);
    expect(fixture.requests.filter(r => r.body.method === "initialize")).toHaveLength(1);
    expect(fixture.requests.some(r => r.body.method === "tools/call")).toBe(false);
    expect(fixture.requests.every(r => r.authorization === "Bearer fictional-local-token")).toBe(true);
    expect(JSON.stringify(tools)).not.toContain("fictional-local-token");
  });
  it("rejects redirects before any credential reaches another origin", async () => {
    const destination = await startMcpFixture(); fixtures.push(destination);
    const source = await startMcpFixture({ redirect: destination.endpoint }); fixtures.push(source);
    vi.stubEnv("MCP_ALLOWED_ORIGINS", `${source.origin},${destination.origin}`); vi.stubEnv("MCP_FIXTURE_TOKEN", "fictional-local-token");
    await expect(discoverMcpTools({ endpoint: source.endpoint, credentialEnvVar: "MCP_FIXTURE_TOKEN" })).rejects.toThrow();
    expect(destination.requests).toHaveLength(0);
  });
  it("blocks discovery to a registered but unapproved origin", async () => {
    const fixture = await startMcpFixture(); fixtures.push(fixture); vi.stubEnv("MCP_ALLOWED_ORIGINS", "");
    await expect(discoverMcpTools({ endpoint: fixture.endpoint, credentialEnvVar: null })).rejects.toThrow("MCP_ALLOWED_ORIGINS");
    expect(fixture.requests).toHaveLength(0);
  });
});
