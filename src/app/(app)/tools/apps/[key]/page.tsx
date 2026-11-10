import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { mcpServers, users, workspaceMembers } from "@/db/schema";
import { APP_CATALOG } from "@/lib/workspace/app-catalog";
import { workContext } from "@/lib/services/workspace-context";
import { listApps, appSetupStatus } from "@/lib/services/apps";
import { Card, CardTitle, PageHeader, Notice } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { ScopeFields } from "@/components/workspace/scope-fields";
import { saveAppSetupAction } from "../../actions";
export const dynamic = "force-dynamic";
export default async function AppSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ setup?: string; error?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { key } = await params;
  const sp = await searchParams;
  const app = APP_CATALOG.find((a) => a.key === key);
  if (!app) notFound();
  const row = sp.setup
    ? listApps(ctx.db, ctx.workspace.id).find(
        (a) => a.id === sp.setup && a.appKey === key,
      )
    : undefined;
  if (sp.setup && !row) notFound();
  const manage = can(ctx.role, "connector.manage");
  const scope = workContext(ctx.db, ctx.workspace.id, {});
  const owners = dbOwners();
  function dbOwners() {
    return ctx.db
      .select({ id: users.id, name: users.name })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, ctx.workspace.id))
      .all();
  }
  const servers = manage
    ? ctx.db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.workspaceId, ctx.workspace.id))
        .all()
    : [];
  return (
    <div className="space-y-6">
      <Link href="/tools" className="text-sm text-accent hover:underline">
        ← Tools & apps
      </Link>
      <PageHeader
        eyebrow="App setup"
        title={app.name}
        description={app.summary}
      />
      <Flash error={sp.error} />
      <ol
        className="grid gap-3 text-sm sm:grid-cols-3"
        aria-label="Connection steps"
      >
        {[
          "Choose your app",
          "Save ownership and access",
          "Complete connection setup",
        ].map((text, i) => (
          <li
            key={text}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <span className="mr-2 text-accent">{i + 1}.</span>
            {text}
          </li>
        ))}
      </ol>
      {row && (
        <Notice
          tone={appSetupStatus(ctx.db, row).tone}
          title={appSetupStatus(ctx.db, row).label}
        >
          {appSetupStatus(ctx.db, row).detail}
        </Notice>
      )}
      <Card>
        <CardTitle>Ownership and requested access</CardTitle>
        {manage ? (
          <form
            action={saveAppSetupAction.bind(null, key)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div>
              <label className="label" htmlFor="accountLabel">
                Account label
              </label>
              <input
                className="input"
                id="accountLabel"
                name="accountLabel"
                required
                minLength={2}
                maxLength={120}
                placeholder="e.g. Marketing team account"
                defaultValue={row?.accountLabel ?? ""}
              />
            </div>
            <div>
              <label className="label" htmlFor="ownerUserId">
                Human connection owner
              </label>
              <select
                className="select"
                id="ownerUserId"
                name="ownerUserId"
                defaultValue={row?.ownerUserId ?? ctx.user.id}
              >
                {owners.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <ScopeFields
              teams={scope.teams}
              staff={scope.staff}
              departmentId={row?.departmentId ?? ""}
              employeeId={row?.employeeId ?? ""}
              prefix="app"
            />
            <fieldset className="rounded-xl border border-line p-4 sm:col-span-2">
              <legend className="px-1 text-sm font-medium">
                Requested permissions
              </legend>
              <div className="flex flex-wrap gap-5">
                {app.scopes.map((s, i) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="requestedScopes"
                      value={s}
                      defaultChecked={
                        row ? row.requestedScopes.includes(s) : i === 0
                      }
                    />
                    {s}
                  </label>
                ))}
              </div>
              <p className="hint mt-3">
                These record intended access. They do not authorize OAuth
                scopes, create employee grants or permit external actions.
              </p>
            </fieldset>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="mcpServerId">
                Existing MCP endpoint (optional)
              </label>
              <select
                className="select"
                id="mcpServerId"
                name="mcpServerId"
                defaultValue={row?.mcpServerId ?? ""}
              >
                <option value="">No endpoint linked</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="hint">
                Link an endpoint only when it supplies this app. Review its
                discovered tools and employee assignments separately.
              </p>
            </div>
            <div className="sm:col-span-2">
              <SubmitButton>Save app setup</SubmitButton>
              <p className="mt-3 text-xs text-ink-3">
                One setup per app and organization, team or employee. Saving the
                same scope updates it. Changing scope creates a separate setup;
                the original remains.
              </p>
            </div>
          </form>
        ) : (
          <Notice>
            An owner or admin manages app setup. You can browse the catalog and
            view connection status.
          </Notice>
        )}
      </Card>
      <Card>
        <CardTitle>Complete the connection</CardTitle>
        <p className="mb-4 text-sm text-ink-2">
          Account sign-in and synchronization for catalog apps are still to be
          built. Native adapters retain their current Demo or Planned mode. MCP
          supports approved metadata discovery and reviewed assignments;
          employee invocation is not available yet.
        </p>
        <div className="flex flex-wrap gap-2">
          {app.connectorKey && (
            <Link href="/integrations" className="btn btn-secondary">
              Review native adapter
            </Link>
          )}
          {manage && (
            <Link href="/integrations/mcp" className="btn btn-secondary">
              Manage MCP endpoints
            </Link>
          )}
          <Link href="/hq/setup" className="btn btn-secondary">
            Employee readiness
          </Link>
        </div>
      </Card>
    </div>
  );
}
