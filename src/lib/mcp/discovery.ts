import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { hashPayload } from "@/lib/ids";
import type { McpToolDefinition } from "@/db/schema";

export function validateMcpEndpoint(raw: string) {
  const url = new URL(raw);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) throw new Error("Use an HTTPS MCP endpoint without credentials, query strings or fragments. HTTP is allowed only for loopback development.");
  return url;
}
export function assertMcpOriginAllowed(endpoint: string) {
  const url = validateMcpEndpoint(endpoint);
  const allowed = (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(url.origin)) throw new Error(`Server operator must add ${url.origin} to MCP_ALLOWED_ORIGINS before discovery.`);
  return url;
}
export function normalizeTools(items: { name: string; description?: string; inputSchema: Record<string, unknown>; annotations?: { readOnlyHint?: boolean } }[]): McpToolDefinition[] {
  if (items.length > 500 || new Set(items.map(t => t.name)).size !== items.length) throw new Error("Tool inventory has duplicates or exceeds 500 tools.");
  const tools = items.map(t => {
    if (!/^[a-zA-Z0-9_.:/-]{1,128}$/.test(t.name) || JSON.stringify(t.inputSchema).length > 50000) throw new Error("Unsupported tool name or oversized schema.");
    const definition = { name: t.name, description: (t.description ?? "").slice(0, 2000), inputSchema: t.inputSchema, readOnlyHint: t.annotations?.readOnlyHint === true };
    return { ...definition, hash: hashPayload(definition) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  if (JSON.stringify(tools).length > 1_000_000) throw new Error("Tool inventory exceeds the supported size.");
  return tools;
}
/** Metadata discovery only. No callTool, prompts, resources, sampling, or subprocesses. */
export async function discoverMcpTools(input: { endpoint: string; credentialEnvVar: string | null }): Promise<McpToolDefinition[]> {
  const endpoint = assertMcpOriginAllowed(input.endpoint);
  if (input.credentialEnvVar && !/^MCP_[A-Z0-9_]+_TOKEN$/.test(input.credentialEnvVar)) throw new Error("MCP credential reference must use MCP_<NAME>_TOKEN.");
  const token = input.credentialEnvVar ? process.env[input.credentialEnvVar] : null;
  if (input.credentialEnvVar && !token?.trim()) throw new Error("Referenced MCP credential is not configured on the server.");
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 15000);
  const guardedFetch: typeof fetch = async (target, init) => {
    const address = typeof target === "string" ? target : target instanceof URL ? target.href : target.url;
    if (new URL(address).href !== endpoint.href) throw new Error("MCP transport attempted a different endpoint. Redirects and OAuth discovery are not enabled.");
    assertMcpOriginAllowed(address);
    const response = await fetch(target, { ...init, cache: "no-store", redirect: "error", signal: init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal });
    if (!response.body) return response;
    let bytes = 0;
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, stream) { bytes += chunk.byteLength; if (bytes > 2_000_000) throw new Error("MCP metadata response exceeds the supported size."); stream.enqueue(chunk); } }));
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  const client = new Client({ name: "hq-connection-discovery", version: "0.1.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} }, fetch: guardedFetch });
  try {
    await client.connect(transport, { timeout: 15000 });
    const tools: Parameters<typeof normalizeTools>[0] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await client.listTools(cursor ? { cursor } : {}, { signal: controller.signal, timeout: 15000 });
      tools.push(...result.tools);
      if (!result.nextCursor) return normalizeTools(tools);
      if (result.nextCursor === cursor || page === 9 || tools.length > 500) throw new Error("MCP inventory pagination did not finish.");
      cursor = result.nextCursor;
    }
    throw new Error("MCP inventory incomplete.");
  } finally {
    controller.abort(); clearTimeout(deadline);
    await client.close().catch(() => {});
  }
}
