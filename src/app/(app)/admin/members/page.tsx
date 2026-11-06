import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can, PERMISSIONS } from "@/lib/authz";
import { WORKSPACE_ROLES, users, workspaceMembers } from "@/db/schema";
import { Card, CardTitle, PageHeader, Notice } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { ConfirmSubmitButton, SubmitButton } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui/ai-avatar";
import { addMemberAction, removeMemberAction, setRoleAction } from "../actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { db, workspace, role, user } = await requireWorkspace();
  const sp = await searchParams;
  const members = db.select({ m: workspaceMembers, u: users }).from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspace.id)).all();
  const canRoles = can(role, "admin.roles");
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Members & roles" description="Server-verified membership decides workspace access. Roles are least-privilege: owner > admin > manager > member." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <table className="table">
            <thead><tr><th>Person</th><th>Role</th><th>Since</th><th></th></tr></thead>
            <tbody>
              {members.map(({ m, u }) => (
                <tr key={m.id}>
                  <td><div className="flex items-center gap-2"><PersonAvatar name={u.name} size={28} /><div><div className="font-medium text-ink">{u.name}{u.id === user.id ? " (you)" : ""}</div><div className="text-xs text-ink-3">{u.email}{u.title ? ` · ${u.title}` : ""}</div></div></div></td>
                  <td>
                    {canRoles ? (
                      <form action={setRoleAction.bind(null, m.id)} className="flex gap-1">
                        <select name="role" defaultValue={m.role} className="select w-auto" aria-label={`Role for ${u.name}`}>{WORKSPACE_ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}</select>
                        <SubmitButton size="sm" variant="secondary">Set</SubmitButton>
                      </form>
                    ) : <Badge>{m.role}</Badge>}
                  </td>
                  <td className="text-ink-3">{fmtDate(m.createdAt)}</td>
                  <td>{m.role !== "owner" && u.id !== user.id && <form action={removeMemberAction.bind(null, m.id)}><ConfirmSubmitButton size="sm" confirm={`Remove ${u.name} from this workspace?`}>Remove</ConfirmSubmitButton></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardTitle>Add a member</CardTitle>
            <form action={addMemberAction} className="space-y-3">
              <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" required className="input" /></div>
              <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" /></div>
              <div><label className="label" htmlFor="role">Role</label><select id="role" name="role" defaultValue="member" className="select">{WORKSPACE_ROLES.filter((r) => r !== "owner" || role === "owner").map((r) => (<option key={r} value={r}>{r}</option>))}</select></div>
              <SubmitButton>Add member</SubmitButton>
              <p className="hint">No email delivery exists yet: a temporary password is shown once after adding. SSO/invites are on the roadmap.</p>
            </form>
          </Card>
          <Card>
            <CardTitle>Permission matrix</CardTitle>
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              <table className="table text-xs">
                <thead><tr><th>Permission</th>{WORKSPACE_ROLES.map((r) => <th key={r}>{r}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(PERMISSIONS).map(([perm, roles]) => (
                    <tr key={perm}><td className="font-mono">{perm}</td>{WORKSPACE_ROLES.map((r) => <td key={r} className="text-center">{(roles as readonly string[]).includes(r) ? "✓" : <span className="text-ink-3">·</span>}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Notice tone="neutral">Enforced in <code className="kbd">src/lib/authz.ts</code> on every server action and page.</Notice>
        </div>
      </div>
    </div>
  );
}
