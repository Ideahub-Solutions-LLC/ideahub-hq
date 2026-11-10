import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import { listApps, appSetupStatus } from "@/lib/services/apps";
import { workContext, type WorkParams } from "@/lib/services/workspace-context";
import { catalogApp } from "@/lib/workspace/app-catalog";
import { Card, CardTitle, PageHeader, Notice } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { AddAppsButton } from "@/components/workspace/app-catalog";
import { ScopeBar } from "@/components/workspace/scope-bar";
import { setAppDisabledAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<WorkParams>;
}) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const scope = workContext(ctx.db, ctx.workspace.id, sp);
  const installed = listApps(ctx.db, ctx.workspace.id).filter(
    (a) =>
      (!scope.scope.departmentId ||
        a.departmentId === scope.scope.departmentId) &&
      (!scope.scope.employeeId || a.employeeId === scope.scope.employeeId) &&
      (!sp.q ||
        `${catalogApp(a.appKey).name} ${a.accountLabel}`
          .toLowerCase()
          .includes(sp.q.toLowerCase())),
  );
  const manage = can(ctx.role, "connector.manage");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workforce / Tools"
        title="Tools & apps"
        description="A single place to discover apps, organize account setup and review employee access."
        actions={<AddAppsButton primary />}
      />
      <Flash ok={sp.ok} error={sp.error} />
      <ScopeBar
        teams={scope.teams}
        staff={scope.staff}
        departmentId={sp.departmentId}
        employeeId={sp.employeeId}
        q={sp.q}
      />
      <Notice tone="neutral">
        Adding an app saves its ownership, scope and requested permissions. Its
        status tells you whether setup, discovery or a live connection is still
        needed.
      </Notice>
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your app setups</h2>
          <Badge>{installed.length}</Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {installed.map((row) => {
            const app = catalogApp(row.appKey);
            const state = appSetupStatus(ctx.db, row);
            return (
              <Card key={row.id}>
                <h3 className="mb-2 text-base font-semibold">{app.name}</h3>
                <div className="mb-3">
                  <Badge tone={state.tone}>{state.label}</Badge>
                </div>
                <p className="text-sm text-ink-2">{row.accountLabel}</p>
                <p className="mt-2 text-xs text-ink-3">
                  {scope.staff.find((e) => e.id === row.employeeId)?.name ??
                    scope.teams.find((t) => t.id === row.departmentId)?.name ??
                    "Organization"}{" "}
                  · requested: {row.requestedScopes.join(", ")}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-ink-2">
                  {state.detail}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={`/tools/apps/${app.key}?setup=${row.id}`}
                  >
                    Configure
                  </Link>
                  {manage && (
                    <form
                      action={setAppDisabledAction.bind(
                        null,
                        row.id,
                        row.version,
                        row.status !== "disabled",
                      )}
                    >
                      <SubmitButton variant="ghost" size="sm">
                        {row.status === "disabled"
                          ? "Enable setup"
                          : "Disable setup"}
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        {!installed.length && (
          <Card>
            <CardTitle>Add the apps your team uses</CardTitle>
            <p className="mb-4 text-sm text-ink-2">
              Browse by category, choose the owner and scope, and review the
              next connection step.
            </p>
            <AddAppsButton primary />
          </Card>
        )}
      </div>
      <div>
        <h2 className="mb-4 text-lg font-semibold">Built into HQ</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              name: "Task board",
              href: "/tasks",
              detail: "Human and AI tasks with review history.",
            },
            {
              name: "Drive",
              href: "/drive",
              detail: "Local folders, documents and uploads.",
            },
            {
              name: "Calendar",
              href: "/calendar",
              detail: "Internal events and task due dates.",
            },
            {
              name: "CRM",
              href: "/crm",
              detail: "Contacts, companies and deal stages.",
            },
            {
              name: "Library",
              href: "/library",
              detail: "Content drafts and saved AI outputs.",
            },
            {
              name: "Mailbox drafts",
              href: "/mailbox",
              detail: "Shared drafts; no external delivery.",
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="card card-hover p-4"
            >
              <div className="flex justify-between gap-2">
                <h3 className="font-medium">{item.name}</h3>
                <Badge tone="emerald">Built in</Badge>
              </div>
              <p className="mt-2 text-xs text-ink-2">{item.detail}</p>
            </Link>
          ))}
        </div>
      </div>
      <Card>
        <CardTitle>Advanced connections and access</CardTitle>
        <div className="flex flex-wrap gap-3">
          {manage && (
            <Link href="/integrations/mcp" className="btn btn-secondary">
              MCP servers
            </Link>
          )}
          <Link href="/integrations" className="btn btn-secondary">
            Native connector settings
          </Link>
          <Link href="/hq/setup" className="btn btn-secondary">
            Employee readiness
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          MCP supports approved tool discovery and reviewed assignments.
          Employee tool invocation remains unavailable.
        </p>
      </Card>
    </div>
  );
}
