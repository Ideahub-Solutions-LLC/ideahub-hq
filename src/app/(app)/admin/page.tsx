import { eq, sql } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { employees, jobs } from "@/db/schema";
import { Card, CardTitle, DescriptionList, PageHeader, Notice } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { ConfirmSubmitButton, SubmitButton } from "@/components/ui/button";
import { brandingAction, emergencyStopAction } from "./actions";
import { queueStats } from "@/lib/jobs/queue";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role, settings } = await requireWorkspace();
  const sp = await searchParams;
  const stats = queueStats(db, workspace.id);
  const failed = db.select().from(jobs).where(eq(jobs.workspaceId, workspace.id)).all().filter((j) => j.status === "failed").slice(-5);
  const activeEmployees = db.select({ n: sql<number>`count(*)` }).from(employees).where(eq(employees.workspaceId, workspace.id)).get()?.n ?? 0;
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Controls" description="Emergency stop, workspace naming and background job health." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle description="Stops all AI employee work, replies and action execution immediately without destroying evidence. Queued jobs are held, not deleted.">Emergency stop</CardTitle>
          {settings.emergencyStop ? (
            <div className="space-y-3">
              <Notice tone="rose" title="Active">{settings.emergencyStopReason ?? "Emergency stop is active."}</Notice>
              {can(role, "admin.emergency_stop") && <form action={emergencyStopAction.bind(null, false)}><ConfirmSubmitButton variant="success" confirm="Lift the emergency stop and let held work resume?">Lift emergency stop</ConfirmSubmitButton></form>}
            </div>
          ) : (
            <form action={emergencyStopAction.bind(null, true)} className="space-y-3">
              <Notice tone="emerald">Not active. Employees work normally within their approved boundaries.</Notice>
              <label className="label" htmlFor="reason">Reason (recorded in the audit log)</label>
              <input id="reason" name="reason" className="input" placeholder="e.g. suspected permission violation" />
              {can(role, "admin.emergency_stop") && <ConfirmSubmitButton variant="danger" confirm="Activate the emergency stop for the whole workspace?">Activate emergency stop</ConfirmSubmitButton>}
            </form>
          )}
        </Card>
        <Card>
          <CardTitle description="Durable, DB-backed queue. Jobs survive restarts; failed jobs keep their error for review.">Background jobs</CardTitle>
          <DescriptionList items={[{ label: "Queued", value: stats.queued ?? 0 }, { label: "Running", value: stats.running ?? 0 }, { label: "Succeeded", value: stats.succeeded ?? 0 }, { label: "Failed", value: stats.failed ?? 0 }, { label: "Worker mode", value: <code className="kbd">{process.env.JOB_WORKER_MODE ?? "inline"}</code> }, { label: "Employees", value: activeEmployees }]} />
          {failed.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-rose">
              {failed.map((j) => (<li key={j.id}>{j.kind} · {fmtDateTime(j.updatedAt)} · {j.lastError}</li>))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle description="Working title: everything about naming is configurable. Colors are tokens in globals.css.">Workspace naming</CardTitle>
          <form action={brandingAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3"><label className="label" htmlFor="productName">Product name</label><input id="productName" name="productName" defaultValue={settings.productName} className="input" /></div>
            <div><label className="label" htmlFor="accent">Accent</label><input id="accent" name="accent" type="color" defaultValue={settings.branding.accent} className="input h-10 p-1" /></div>
            <div><label className="label" htmlFor="accentSecondary">Secondary accent</label><input id="accentSecondary" name="accentSecondary" type="color" defaultValue={settings.branding.accentSecondary} className="input h-10 p-1" /></div>
            <div className="flex items-end"><SubmitButton>Save</SubmitButton></div>
          </form>
          <p className="hint">Accent colors are stored for future theming; the current build reads colors from CSS tokens.</p>
        </Card>
        <Card>
          <CardTitle>Environment</CardTitle>
          <DescriptionList items={[{ label: "Workspace", value: `${workspace.name} (${workspace.slug})` }, { label: "Database", value: <code className="kbd">{process.env.DATABASE_URL ?? "./data/ideahub.db"}</code> }, { label: "Node env", value: process.env.NODE_ENV }, { label: "Pricing table", value: process.env.PROVIDER_PRICING_JSON ? "configured" : "not configured (costs recorded as unavailable)" }]} />
        </Card>
      </div>
    </div>
  );
}
