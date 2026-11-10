import Link from "next/link";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/context";
import { mcpServers, users, workspaceMembers } from "@/db/schema";
import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { McpServerForm } from "@/components/configuration/mcp-server-form";
import { saveMcpServerAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function McpRegistryPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requirePermission("connector.manage"); const sp = await searchParams;
  const servers = ctx.db.select().from(mcpServers).where(eq(mcpServers.workspaceId, ctx.workspace.id)).all();
  const people = ctx.db.select({ id: users.id, name: users.name }).from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, ctx.workspace.id)).all();
  return <div className="space-y-6"><PageHeader eyebrow={<Link href="/integrations">Integrations</Link>} title="MCP connections" description="Register a trusted endpoint, approve metadata discovery, then review and assign its tools to individual employees." actions={<Link className="btn btn-secondary" href="/hq/setup">HQ readiness</Link>} /><Flash ok={sp.ok} error={sp.error} /><Notice tone="amber" title="Discovery is not tool execution">This connection layer supports Streamable HTTP with optional server-managed bearer credentials. An approved discovery reads tool definitions only. Employee tool invocation, OAuth onboarding and stdio process launching are not enabled.</Notice><div className="grid gap-4 md:grid-cols-2">{servers.map(s => <Card key={s.id}><CardTitle action={<Badge tone={s.discoveryStatus === "discovered" && s.enabled ? "emerald" : "amber"}>{s.enabled ? s.discoveryStatus.replaceAll("_", " ") : "disabled"}</Badge>}><Link className="text-accent hover:underline" href={`/integrations/mcp/${s.id}`}>{s.name}</Link></CardTitle><p className="break-all text-xs text-ink-2">{s.endpoint}</p><p className="mt-2 text-sm text-ink-2">{s.detail}</p><p className="mt-2 text-xs text-ink-3">Configuration v{s.configVersion} · {s.tools.length} captured tools · {s.discoveredAt ? `last discovery ${s.discoveredAt}` : "no discovery yet"}</p></Card>)}</div>{!servers.length && <p className="text-sm text-ink-2">No MCP servers registered. Existing Slack, Teams and other connector adapters remain separate from this registry.</p>}<Card><CardTitle>Register a connection</CardTitle><McpServerForm people={people} action={saveMcpServerAction.bind(null, null)} /></Card></div>;
}
