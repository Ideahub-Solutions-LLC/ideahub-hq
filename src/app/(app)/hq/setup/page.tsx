import Link from "next/link";
import { eq, ne, and } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { employees } from "@/db/schema";
import { employeeSetup } from "@/lib/services/hq-readiness";
import { Card, CardTitle, Notice, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export default async function HqSetupPage() {
  const ctx = await requireWorkspace();
  const staff = ctx.db.select().from(employees).where(and(eq(employees.workspaceId, ctx.workspace.id), ne(employees.status, "archived"))).all().map(e => employeeSetup(ctx.db, ctx.workspace.id, e.id));
  return <div className="space-y-6"><PageHeader eyebrow="Headquarters" title="HQ readiness" description="Configure the people, models and tool access behind the office. These are configuration checks, not proof of live quality or a production security review." actions={<>{can(ctx.role, "connector.manage") && <Link className="btn btn-secondary" href="/integrations/mcp">MCP connections</Link>}{can(ctx.role, "admin.providers") && <Link className="btn btn-primary" href="/admin/providers">Provider access</Link>}</>} />
    <Notice tone="amber" title="Connection and execution are separate">Provider credentials, model access, reviewed employee instructions and tool assignments are checked separately. MCP discovery can be real while employee tool invocation remains unavailable.</Notice>
    <div className="grid gap-5 xl:grid-cols-2">{staff.map(s => <Card key={s.employee.id}><CardTitle action={<Badge tone={s.configured ? "emerald" : "amber"}>{s.configured ? "Configuration checks complete" : "Setup needs attention"}</Badge>} description={s.employee.roleTitle}><Link className="text-accent hover:underline" href={`/employees/${s.employee.id}`}>{s.employee.name}</Link></CardTitle><ul className="divide-y divide-line">{s.checks.map(c => <li key={c.label} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><Link href={can(ctx.role, c.href.includes("tab=model") ? "employee.model.edit" : c.href.includes("tab=authority") ? "employee.authority.edit" : "employee.edit") ? c.href : `/employees/${s.employee.id}/setup`} className="text-sm font-medium text-accent hover:underline">{c.label}</Link><Badge tone={c.state === "ready" ? "emerald" : "amber"}>{c.state === "ready" ? "Configured" : c.state === "offline" ? "Offline Demo" : "Needs attention"}</Badge></div><p className="mt-1 break-words text-xs text-ink-2">{c.detail}</p></li>)}</ul><p className="mt-4 text-xs text-ink-3">MCP: {s.currentAssignments.length} current reviewed assignment(s), {s.assignments.length - s.currentAssignments.length} stale. Invocation is not enabled.</p><Link className="btn btn-secondary btn-sm mt-4" href={`/employees/${s.employee.id}/setup`}>Open configuration desk</Link></Card>)}</div>
  </div>;
}
