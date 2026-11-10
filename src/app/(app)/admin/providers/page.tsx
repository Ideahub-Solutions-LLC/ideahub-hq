import Link from "next/link";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/context";
import { employees } from "@/db/schema";
import { Card, CardTitle, DescriptionList, PageHeader, Notice } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listProviders, resolveProvider } from "@/lib/providers";
import { loadPricingTable } from "@/lib/services/usage";
import { getProviderCatalog } from "@/lib/services/provider-catalog";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { refreshProviderAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProvidersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace } = await requirePermission("admin.providers");
  const sp = await searchParams;
  const providers = listProviders();
  const staff = db.select().from(employees).where(eq(employees.workspaceId, workspace.id)).all();
  const pricing = loadPricingTable();
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Model providers" description="Credentials live only in server environment variables. This page shows presence and status — never the key itself." />
      <Flash ok={sp.ok} error={sp.error} /><div className="mb-6"><Link href="/hq/setup" className="btn btn-secondary btn-sm">HQ readiness</Link></div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {providers.map((p) => (
          <Card key={p.key}>
            <CardTitle action={<Badge tone={p.configured ? "emerald" : "amber"}>{p.key === "demo" ? "always available" : p.configured ? "configured" : "not configured"}</Badge>}>{p.displayName}</CardTitle>
            <DescriptionList items={[{ label: "Default model", value: <code className="kbd">{p.defaultModel}</code> }, { label: "Env var", value: p.envVar ? <code className="kbd">{p.envVar}</code> : "none" }, { label: "Employees using it", value: staff.filter((e) => e.modelConfig.provider === p.key).length }]} />
            {p.key !== "demo" && <div className="mt-4 space-y-3"><p className="text-xs text-ink-2">{getProviderCatalog(db, workspace.id, p.key)?.detail ?? "Model access has not been checked. Credential presence alone is not validation."}</p><p className="text-xs text-ink-3">{getProviderCatalog(db, workspace.id, p.key)?.checkedAt ?? "No check recorded"}</p><form action={refreshProviderAction.bind(null, p.key)}><SubmitButton size="sm" variant="secondary">Refresh model access</SubmitButton></form><details className="text-xs"><summary className="cursor-pointer">Available model IDs</summary><ul className="mt-2 max-h-48 overflow-auto">{getProviderCatalog(db, workspace.id, p.key)?.models.map(m => <li className="break-all py-1" key={m.id}>{m.id}</li>)}</ul></details></div>}
            {p.key !== "demo" && !p.configured && <p className="hint">Set {p.envVar} on the server (an API key from a developer account — never a consumer subscription login or session token) and restart.</p>}
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardTitle description="What each employee resolves to right now, given the configured keys.">Effective routing</CardTitle>
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Employee</th><th>Configured</th><th>Fallback</th><th>Resolves to</th><th>Note</th></tr></thead>
          <tbody>
            {staff.map((e) => {
              const r = resolveProvider(e.modelConfig);
              return (
                <tr key={e.id}>
                  <td className="text-ink"><Link href={`/employees/${e.id}/setup`} className="text-accent hover:underline">{e.name}</Link></td>
                  <td><code className="kbd">{e.modelConfig.provider}:{e.modelConfig.model}</code></td>
                  <td className="text-ink-2">{e.modelConfig.fallbackProvider ? `${e.modelConfig.fallbackProvider}:${e.modelConfig.fallbackModel ?? "default"}` : "—"}</td>
                  <td><Badge tone={r.degraded ? "amber" : "emerald"}>{r.adapter.key}:{r.model}</Badge></td>
                  <td className="text-xs text-ink-2">{r.note ?? "OK"}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
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
