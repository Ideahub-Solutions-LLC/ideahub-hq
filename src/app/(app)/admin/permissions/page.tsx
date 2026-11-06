import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { ACTION_TYPES, connectorGrants, employees } from "@/db/schema";
import { Card, PageHeader, Notice } from "@/components/ui/card";
import { AiAvatar } from "@/components/ui/ai-avatar";
import { Badge, EmployeeStatusBadge, ModeBadge } from "@/components/ui/badge";
import { ACTION_TYPE_LABEL } from "@/lib/format";
import { effectiveConnectorMode } from "@/lib/connectors";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const { db, workspace } = await requireWorkspace();
  const staff = db.select().from(employees).where(eq(employees.workspaceId, workspace.id)).all();
  const grants = await db.query.connectorGrants.findMany({ where: eq(connectorGrants.workspaceId, workspace.id), with: { connector: true } });
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Employee permissions" description="One view of what every AI employee may propose and which connectors it can reach. Edit from each employee's Authority tab or the Integrations page." />
      <div className="mb-4"><Notice tone="accent">Every allowed action still requires a human approval before it executes. Personality never changes these limits.</Notice></div>
      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Employee</th><th>Status</th>{ACTION_TYPES.map((a) => <th key={a} title={ACTION_TYPE_LABEL[a]}>{a.replace(/_/g, " ")}</th>)}<th>Connector grants</th><th>Reviews drafts</th></tr></thead>
            <tbody>
              {staff.map((e) => {
                const g = grants.filter((x) => x.employeeId === e.id && x.status === "active");
                return (
                  <tr key={e.id}>
                    <td><Link href={`/employees/${e.id}/edit?tab=authority`} className="flex items-center gap-2 text-ink hover:underline"><AiAvatar seed={e.avatarSeed} name={e.name} size={24} />{e.name}</Link></td>
                    <td><EmployeeStatusBadge status={e.status} /></td>
                    {ACTION_TYPES.map((a) => <td key={a} className="text-center">{e.authority.allowedActionTypes.includes(a) ? <span className="text-emerald">✓</span> : <span className="text-ink-3">·</span>}</td>)}
                    <td>{g.length === 0 ? <span className="text-ink-3">none</span> : g.map((x) => { const eff = effectiveConnectorMode(x.connector.key, x.connector.mode); return <span key={x.id} className="mr-1 inline-flex items-center gap-1 text-xs">{x.connector.name} <ModeBadge mode={eff.mode} /></span>; })}</td>
                    <td>{e.authority.requireReviewForDrafts ? <Badge tone="emerald">always</Badge> : <Badge tone="amber">no</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
