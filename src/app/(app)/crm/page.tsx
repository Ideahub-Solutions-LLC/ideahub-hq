import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/context";
import { listWorkRecords } from "@/lib/services/workspace-records";
import {
  workContext,
  workUrl,
  type WorkParams,
} from "@/lib/services/workspace-context";
import { DEAL_STAGES } from "@/lib/workspace/records";
import { Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { ScopeBar } from "@/components/workspace/scope-bar";
import { AddAppsButton } from "@/components/workspace/app-catalog";
import { RecordEditor } from "@/components/workspace/record-editor";
export const dynamic = "force-dynamic";
export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<WorkParams>;
}) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const scope = workContext(ctx.db, ctx.workspace.id, sp);
  const kind =
    sp.tab === "companies"
      ? "company"
      : sp.tab === "deals"
        ? "deal"
        : "contact";
  const rows = listWorkRecords(ctx.db, ctx.workspace.id, [kind], {
    ...scope.scope,
    q: sp.q,
    archived: sp.archived === "1",
  });
  const companies = listWorkRecords(ctx.db, ctx.workspace.id, ["company"]);
  const url = (
    tab: string,
    archived: string | null | undefined = sp.archived,
  ) =>
    workUrl("/crm", {
      tab,
      archived,
      departmentId: sp.departmentId,
      employeeId: sp.employeeId,
    });
  const value = (row: (typeof rows)[number]) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: String(row.data.currency),
    }).format(Number(row.data.valueCents) / 100);
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace / CRM"
        title="CRM"
        description="Shared customer records, companies and a simple deal pipeline inside HQ."
        actions={
          <>
            <AddAppsButton label="Connect CRM" category="crm" />
            <a className="btn btn-primary" href="#create-crm">
              New {kind}
            </a>
          </>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />
      <ScopeBar
        teams={scope.teams}
        staff={scope.staff}
        departmentId={sp.departmentId}
        employeeId={sp.employeeId}
        q={sp.q}
        hidden={{ tab: sp.tab, archived: sp.archived }}
      />
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">
          {["contacts", "companies", "deals"].map((tab) => (
            <Link
              key={tab}
              className={`btn btn-sm ${(sp.tab ?? "contacts") === tab ? "btn-primary" : "btn-secondary"}`}
              href={url(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Link>
          ))}
        </div>
        <Link
          className="btn btn-ghost btn-sm"
          href={url(sp.tab ?? "contacts", sp.archived === "1" ? null : "1")}
        >
          {sp.archived === "1" ? "Active records" : "Archived records"}
        </Link>
      </div>
      {kind === "deal" && sp.archived !== "1" ? (
        <div
          className="overflow-x-auto pb-2"
          role="region"
          aria-label="Deal pipeline"
          tabIndex={0}
        >
          <div className="grid min-w-[1000px] grid-cols-5 gap-3">
            {DEAL_STAGES.map((stage) => (
              <section
                key={stage}
                className="min-h-48 rounded-2xl border border-line bg-surface-2 p-3"
              >
                <h2 className="mb-3 flex justify-between text-xs font-semibold uppercase text-ink-2">
                  {stage}
                  <span>
                    {rows.filter((r) => r.data.stage === stage).length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {rows
                    .filter((r) => r.data.stage === stage)
                    .map((r) => (
                      <Link
                        className="card card-hover block p-3"
                        key={r.id}
                        href={`/work/records/${r.id}`}
                      >
                        <h3 className="break-words text-sm font-semibold">
                          {r.title}
                        </h3>
                        <p className="mt-2 text-sm text-accent">{value(r)}</p>
                        <p className="mt-1 text-xs text-ink-3">
                          {companies.find((c) => c.id === r.data.companyId)
                            ?.title ?? "No company"}
                        </p>
                      </Link>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <Card padded={false}>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{kind === "company" ? "Company" : "Name"}</th>
                    <th>
                      {kind === "company"
                        ? "Website"
                        : kind === "deal"
                          ? "Value"
                          : "Email"}
                    </th>
                    <th>{kind === "company" ? "Industry" : "Company"}</th>
                    <th>Owner / scope</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link
                          className="font-medium text-accent"
                          href={`/work/records/${r.id}`}
                        >
                          {r.title}
                        </Link>
                      </td>
                      <td>
                        {kind === "company"
                          ? String(r.data.website || "—")
                          : kind === "deal"
                            ? value(r)
                            : String(r.data.email || "—")}
                      </td>
                      <td>
                        {kind === "company"
                          ? String(r.data.industry || "—")
                          : (companies.find((c) => c.id === r.data.companyId)
                              ?.title ?? "—")}
                      </td>
                      <td>
                        {scope.staff.find((e) => e.id === r.employeeId)?.name ??
                          scope.teams.find((t) => t.id === r.departmentId)
                            ?.name ??
                          "Organization"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState
                title={`No ${kind === "company" ? "companies" : kind === "contact" ? "contacts" : "deals"} here yet`}
                description="Create a native record or prepare an external CRM connection. No customer data has been imported automatically."
              />
            </div>
          )}
        </Card>
      )}
      {sp.archived !== "1" && (
        <Card>
          <div id="create-crm" className="scroll-mt-20">
            <CardTitle>New {kind}</CardTitle>
            <RecordEditor
              key={kind}
              kind={kind}
              teams={scope.teams}
              staff={scope.staff}
              companies={companies}
              departmentId={sp.departmentId}
              employeeId={sp.employeeId}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
