import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { employees } from "@/db/schema";
import { Card, CardTitle, DescriptionList, PageHeader, Notice } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listProviders, resolveProvider } from "@/lib/providers";
import { loadPricingTable } from "@/lib/services/usage";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const { db, workspace } = await requireWorkspace();
  const providers = listProviders();
  const staff = db.select().from(employees).where(eq(employees.workspaceId, workspace.id)).all();
  const pricing = loadPricingTable();
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Model providers" description="Credentials live only in server environment variables. This page shows presence and status — never the key itself." />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {providers.map((p) => (
          <Card key={p.key}>
            <CardTitle action={<Badge tone={p.configured ? "emerald" : "amber"}>{p.key === "demo" ? "always available" : p.configured ? "configured" : "not configured"}</Badge>}>{p.displayName}</CardTitle>
            <DescriptionList items={[{ label: "Default model", value: <code className="kbd">{p.defaultModel}</code> }, { label: "Env var", value: p.envVar ? <code className="kbd">{p.envVar}</code> : "none" }, { label: "Employees using it", value: staff.filter((e) => e.modelConfig.provider === p.key).length }]} />
            {p.key !== "demo" && !p.configured && <p className="hint">Set {p.envVar} on the server (an API key from a developer account — never a consumer subscription login or session token) and restart.</p>}
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardTitle description="What each employee resolves to right now, given the configured keys.">Effective routing</CardTitle>
        <table className="table">
          <thead><tr><th>Employee</th><th>Configured</th><th>Fallback</th><th>Resolves to</th><th>Note</th></tr></thead>
          <tbody>
            {staff.map((e) => {
              const r = resolveProvider(e.modelConfig);
              return (
                <tr key={e.id}>
                  <td className="text-ink">{e.name}</td>
                  <td><code className="kbd">{e.modelConfig.provider}:{e.modelConfig.model}</code></td>
                  <td className="text-ink-2">{e.modelConfig.fallbackProvider ? `${e.modelConfig.fallbackProvider}:${e.modelConfig.fallbackModel ?? "default"}` : "—"}</td>
                  <td><Badge tone={r.degraded ? "amber" : "emerald"}>{r.adapter.key}:{r.model}</Badge></td>
                  <td className="text-xs text-ink-2">{r.note ?? "OK"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>Pricing table (estimates only)</CardTitle>
          {Object.keys(pricing).length === 0 ? <Notice tone="amber">No PROVIDER_PRICING_JSON configured. Token usage is recorded, but cost is marked unavailable and cost budgets cannot be enforced. We do not invent provider prices.</Notice> : (
            <table className="table text-xs"><thead><tr><th>provider:model</th><th>$/1M in</th><th>$/1M out</th></tr></thead><tbody>{Object.entries(pricing).map(([k, v]) => (<tr key={k}><td><code className="kbd">{k}</code></td><td>{v.input}</td><td>{v.output}</td></tr>))}</tbody></table>
          )}
        </Card>
        <Card>
          <CardTitle>Account and access rules</CardTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>API keys only. A consumer ChatGPT or Claude subscription does not authorize API usage.</li>
            <li>Never paste passwords or session tokens anywhere in this platform.</li>
            <li>Fallback to another provider is allowed only when the employee config permits it; output is not guaranteed to be identical across models.</li>
            <li>Client-owned provider accounts (future) will be stored in a secret store, never in the database.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
