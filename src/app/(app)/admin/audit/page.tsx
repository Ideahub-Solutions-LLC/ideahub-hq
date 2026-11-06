import { desc, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/context";
import { auditEvents, employees, users } from "@/db/schema";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { db, workspace } = await requirePermission("admin.audit.view");
  const { q } = await searchParams;
  const rows = db.select().from(auditEvents).where(eq(auditEvents.workspaceId, workspace.id)).orderBy(desc(auditEvents.createdAt)).limit(300).all().filter((r) => !q || `${r.action} ${r.entityType} ${r.entityId}`.toLowerCase().includes(q.toLowerCase()));
  const people = db.select().from(users).all();
  const staff = db.select().from(employees).where(eq(employees.workspaceId, workspace.id)).all();
  const actor = (r: typeof rows[number]) => (r.actorUserId ? people.find((p) => p.id === r.actorUserId)?.name ?? "user" : r.actorEmployeeId ? `${staff.find((e) => e.id === r.actorEmployeeId)?.name ?? "employee"} (AI)` : "system");
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Audit log" description="Append-only record of who did what. Secrets are redacted before anything is written." />
      <form className="mb-4"><input name="q" defaultValue={q ?? ""} placeholder="Filter by action or entity…" className="input max-w-sm" aria-label="Filter" /></form>
      <Card padded={false}>
        {rows.length === 0 ? <div className="p-6"><EmptyState title="No audit events" /></div> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-ink-3">{fmtDateTime(r.createdAt)}</td>
                    <td className="text-ink">{actor(r)}</td>
                    <td><code className="kbd">{r.action}</code></td>
                    <td className="text-ink-2">{r.entityType}{r.entityId ? ` · ${r.entityId}` : ""}</td>
                    <td className="max-w-md truncate text-xs text-ink-2">{r.data ? JSON.stringify(r.data) : ""}</td>
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
