import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
/** Loopback-only protocol fixture. Never connects to an external service. */
export async function startMcpFixture(options: { sse?: boolean; redirect?: string } = {}) {
  const requests: { method: string; authorization?: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as Record<string, unknown>;
    requests.push({ method: req.method ?? "", authorization: req.headers.authorization, body });
    if (options.redirect) { res.writeHead(302, { Location: options.redirect }); res.end(); return; }
    if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
    if (!("id" in body)) { res.writeHead(202); res.end(); return; }
    const params = (body.params ?? {}) as Record<string, unknown>;
    const result = body.method === "initialize" ? { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fictional-studio-fixture", version: "1.0.0" } } : body.method === "tools/list" ? { tools: [{ name: params.cursor ? "find_record" : "read_brief", description: "Read fictional test records only.", inputSchema: { type: "object", properties: { recordId: { type: "string" } } }, annotations: { readOnlyHint: true } }], ...(params.cursor ? {} : { nextCursor: "second-page" }) } : null;
    const message = { jsonrpc: "2.0", id: body.id, ...(result ? { result } : { error: { code: -32601, message: "Only metadata discovery is supported by this fixture." } }) };
    res.writeHead(200, { "Content-Type": options.sse ? "text/event-stream" : "application/json" });
    res.end(options.sse ? `data: ${JSON.stringify(message)}\n\n` : JSON.stringify(message));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { server, requests, origin, endpoint: `${origin}/mcp`, close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }) };
}
