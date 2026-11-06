import { desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { budgets, employees, usageEvents } from "@/db/schema";
import { Card, CardTitle, EmptyState, PageHeader, Notice, Stat } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { budgetAction } from "../actions";
import { fmtCents, monthToDate } from "@/lib/services/usage";
import { fmtDateTime, fmtTokens } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace } = await requireWorkspace();
  const sp = await searchParams;
  const staff = db.select().from(employees).where(eq(employees.workspaceId, workspace.id)).all();
  const rows = db.select().from(usageEvents).where(eq(usageEvents.workspaceId, workspace.id)).orderBy(desc(usageEvents.createdAt)).limit(100).all();
  const budgetRows = db.select().from(budgets).where(eq(budgets.workspaceId, workspace.id)).all();
  const mtd = monthToDate(db, workspace.id);
  const empName = (id: string | null) => staff.find((e) => e.id === id)?.name ?? "—";
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Usage & budgets" description="A basic usage ledger: workspace, employee, task, provider, units and estimated cost — with retries never double-recorded." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Input tokens (MTD)" value={fmtTokens(mtd.inputUnits)} />
        <Stat label="Output tokens (MTD)" value={fmtTokens(mtd.outputUnits)} />
        <Stat label="Estimated cost (MTD)" value={fmtCents(mtd.costCents)} hint={mtd.unavailable ? `${mtd.unavailable} event(s) without a price` : "all events priced"} />
        <Stat label="Events" value={mtd.events} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="border-b border-line px-5 py-4"><CardTitle description="Newest first. Costs appear only when a pricing table is configured.">Ledger</CardTitle></div>
          {rows.length === 0 ? <div className="p-6"><EmptyState title="No usage recorded yet" /></div> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>When</th><th>Employee</th><th>Provider · model</th><th>Meter</th><th>Units</th><th>Est. cost</th></tr></thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td className="whitespace-nowrap text-ink-3">{fmtDateTime(u.createdAt)}</td>
                      <td className="text-ink">{empName(u.employeeId)}</td>
                      <td><code className="kbd">{u.provider}:{u.model}</code></td>
                      <td className="text-ink-2">{u.meter.replace(/_/g, " ")}</td>
                      <td className="tabular-nums text-ink-2">{u.inputUnits} in · {u.outputUnits} out {u.unit}</td>
                      <td>{u.costStatus === "unavailable" ? <Badge tone="amber">unavailable</Badge> : <span className="tabular-nums">{fmtCents(u.estimatedCostCents)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardTitle>Budgets (monthly)</CardTitle>
            <ul className="space-y-2 text-sm">
              {budgetRows.map((b) => {
                const spent = monthToDate(db, workspace.id, b.scopeType === "employee" ? b.scopeId : undefined).costCents;
                const pct = b.limitCents ? Math.min(100, Math.round((spent / b.limitCents) * 100)) : 0;
                return (
                  <li key={b.id}>
                    <div className="flex justify-between"><span className="text-ink">{b.scopeType === "workspace" ? "Workspace" : empName(b.scopeId)}</span><span className="tabular-nums text-ink-2">{fmtCents(spent)} / {fmtCents(b.limitCents)}</span></div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"><div className={`h-full rounded-full ${pct >= b.alertThresholdPct ? "bg-amber" : "bg-accent-2"}`} style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
              {budgetRows.length === 0 && <li className="text-ink-3">No budgets set.</li>}
            </ul>
            <form action={budgetAction} className="mt-4 grid gap-2">
              <select name="scopeType" className="select" defaultValue="employee" aria-label="Scope"><option value="workspace">Workspace</option><option value="employee">Employee</option></select>
              <select name="scopeId" className="select" defaultValue="" aria-label="Employee"><option value="">— employee (if scope is employee) —</option>{staff.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}</select>
              <div className="grid grid-cols-2 gap-2">
                <input name="limitDollars" type="number" min={0} step="0.01" placeholder="Limit (USD)" className="input" aria-label="Limit in dollars" />
                <input name="alertThresholdPct" type="number" min={1} max={100} defaultValue={80} className="input" aria-label="Alert threshold percent" />
              </div>
              <SubmitButton size="sm">Save budget</SubmitButton>
            </form>
          </Card>
          <Notice tone="neutral">Future client billing separates AI usage, communications and third-party usage; see docs/BILLING_DESIGN.md. No checkout exists in this version.</Notice>
        </div>
      </div>
    </div>
  );
}
