import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { CONNECTOR_MODES, communicationEvents, connectors, employees } from "@/db/schema";
import { Card, CardTitle, EmptyState, PageHeader, Notice } from "@/components/ui/card";
import { Badge, ModeBadge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { ConfirmSubmitButton, SubmitButton } from "@/components/ui/button";
import { effectiveConnectorMode, getConnectorAdapter } from "@/lib/connectors";
import { grantConnectorAction, revokeGrantAction, setConnectorModeAction } from "./actions";
import { CONNECTOR_MODE_LABEL, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const rows = await db.query.connectors.findMany({ where: eq(connectors.workspaceId, workspace.id), with: { owner: true, grants: { with: { employee: true } } }, orderBy: (c, { asc }) => [asc(c.name)] });
  const comms = await db.query.communicationEvents.findMany({ where: eq(communicationEvents.workspaceId, workspace.id), orderBy: [desc(communicationEvents.createdAt)], limit: 30 });
  const staff = db.select().from(employees).where(eq(employees.workspaceId, workspace.id)).all().filter((e) => e.status !== "archived");
  const empName = (id: string | null) => staff.find((e) => e.id === id)?.name ?? "—";
  const manage = can(role, "connector.manage");

  return (
    <div className="anim-rise">
      <PageHeader eyebrow="Connections" title="Integrations & communication" description="Each connection shows its owner, scope, permissions and an honest status. Live means credentials are configured and a real adapter exists; Demo means simulated; nothing here delivers a message externally today." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-5"><Notice tone="amber" title="Truth in labeling">In this version every connector is Demo, Disconnected or Planned. Live adapters are implemented only after authorized credentials and a sandbox exist — see docs/INTEGRATIONS.md for the exact steps.</Notice></div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((c) => {
          const eff = effectiveConnectorMode(c.key, c.mode);
          const adapter = getConnectorAdapter(c.key);
          const active = c.grants.filter((g) => g.status === "active");
          return (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">{c.name}</h2>
                  <p className="mt-0.5 text-xs text-ink-3">key <code className="kbd">{c.key}</code> · owner {c.owner?.name ?? "—"} · checked {fmtDateTime(c.lastCheckedAt)}</p>
                </div>
                <ModeBadge mode={eff.mode} />
              </div>
              <p className="mt-3 text-sm text-ink-2">{eff.detail}</p>
              <p className="mt-1 text-xs text-ink-3">{c.statusDetail}</p>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div><dt className="text-ink-3">Scopes</dt><dd className="text-ink">{c.scopes.length ? c.scopes.join(", ") : "none"}</dd></div>
                <div><dt className="text-ink-3">Permissions</dt><dd className="flex gap-1"><Badge tone={c.permissions.read ? "emerald" : "neutral"}>read</Badge><Badge tone={c.permissions.write ? "emerald" : "neutral"}>write</Badge><Badge tone={c.permissions.send ? "emerald" : "neutral"}>send</Badge></dd></div>
                <div><dt className="text-ink-3">Supported actions</dt><dd className="text-ink">{adapter?.supportedActions.join(", ") ?? "—"}</dd></div>
                <div><dt className="text-ink-3">Credential env vars (names only)</dt><dd className="text-ink">{c.credentialEnvVars.length ? c.credentialEnvVars.map((v) => <code key={v} className="kbd mr-1 break-all">{v}</code>) : "none required"}</dd></div>
              </dl>
              <div className="mt-3">
                <div className="text-xs font-medium uppercase tracking-wider text-ink-3">Employee grants</div>
                {active.length === 0 ? <p className="text-sm text-ink-3">No employee has access.</p> : (
                  <ul className="mt-1 space-y-1">
                    {active.map((g) => (
                      <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                        <span><Link href={`/employees/${g.employee.id}`} className="text-ink hover:underline">{g.employee.name}</Link> <span className="text-ink-3">· {g.scopes.join(", ")}</span></span>
                        {manage && <form action={revokeGrantAction.bind(null, g.id)}><ConfirmSubmitButton size="sm" confirm={`Revoke ${g.employee.name}'s access to ${c.name}?`}>Revoke</ConfirmSubmitButton></form>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {manage && (
                <div className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                  <form action={setConnectorModeAction.bind(null, c.id)} className="flex gap-2">
                    <select name="mode" defaultValue={c.mode} className="select" aria-label="Requested mode">
                      {CONNECTOR_MODES.map((m) => (<option key={m} value={m}>{CONNECTOR_MODE_LABEL[m]}</option>))}
                    </select>
                    <SubmitButton size="sm" variant="secondary">Set</SubmitButton>
                  </form>
                  {(eff.mode === "demo" || eff.mode === "live") && (
                    <form action={grantConnectorAction} className="flex gap-2">
                      <input type="hidden" name="connectorId" value={c.id} />
                      <input type="hidden" name="scopes" value={eff.mode === "demo" ? "simulated access" : "default"} />
                      <select name="employeeId" className="select" aria-label="Grant to employee" defaultValue="">
                        <option value="" disabled>Grant to…</option>
                        {staff.filter((e) => !active.some((g) => g.employeeId === e.id)).map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
                      </select>
                      <SubmitButton size="sm" variant="secondary">Grant</SubmitButton>
                    </form>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardTitle description="Inbound and outbound messages and simulated deliveries. Internal comments live on tasks and never appear here.">Communication activity</CardTitle>
        {comms.length === 0 ? <EmptyState title="No communication events yet" description="Approve a send_message proposal to see a simulated delivery recorded here." /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Direction</th><th>Channel</th><th>Employee</th><th>Subject / body</th><th>Status</th></tr></thead>
              <tbody>
                {comms.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-ink-3">{fmtDateTime(m.createdAt)}</td>
                    <td className="text-ink-2">{m.direction}</td>
                    <td><code className="kbd">{m.channel}</code></td>
                    <td className="text-ink-2">{empName(m.employeeId)}</td>
                    <td className="max-w-md"><div className="truncate text-ink">{m.subject ?? m.body.slice(0, 120)}</div>{m.approvalId && <Link href={`/approvals/${m.approvalId}`} className="text-xs text-accent hover:underline">approval</Link>}</td>
                    <td><Badge tone={m.status === "simulated" ? "amber" : m.status === "sent" ? "emerald" : m.status === "failed" ? "rose" : "neutral"}>{m.status === "simulated" ? "Simulated — not delivered" : m.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
