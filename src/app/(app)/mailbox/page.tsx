import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { communicationEvents } from "@/db/schema";
import { listWorkRecords } from "@/lib/services/workspace-records";
import {
  workContext,
  workUrl,
  type WorkParams,
} from "@/lib/services/workspace-context";
import {
  Card,
  CardTitle,
  PageHeader,
  EmptyState,
  Notice,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { ScopeBar } from "@/components/workspace/scope-bar";
import { AddAppsButton } from "@/components/workspace/app-catalog";
import { RecordEditor } from "@/components/workspace/record-editor";
export const dynamic = "force-dynamic";
export default async function MailboxPage({
  searchParams,
}: {
  searchParams: Promise<WorkParams>;
}) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const scope = workContext(ctx.db, ctx.workspace.id, sp);
  const drafts = listWorkRecords(ctx.db, ctx.workspace.id, ["mail"], {
    ...scope.scope,
    q: sp.q,
    archived: sp.archived === "1",
  });
  const comms = ctx.db
    .select()
    .from(communicationEvents)
    .where(eq(communicationEvents.workspaceId, ctx.workspace.id))
    .orderBy(desc(communicationEvents.createdAt))
    .all()
    .filter(
      (m) =>
        m.connectorKey === "email" &&
        (!scope.scope.employeeId || m.employeeId === scope.scope.employeeId) &&
        (!scope.scope.departmentId ||
          scope.staff.some(
            (e) =>
              e.id === m.employeeId &&
              e.departmentId === scope.scope.departmentId,
          )) &&
        (!sp.q ||
          `${m.subject} ${m.body}`.toLowerCase().includes(sp.q.toLowerCase())),
    );
  const messages =
    sp.tab === "inbox" ? comms.filter((m) => m.direction === "inbound") : comms;
  const url = (changes: Partial<WorkParams>) =>
    workUrl("/mailbox", {
      departmentId: sp.departmentId,
      employeeId: sp.employeeId,
      tab: sp.tab,
      archived: sp.archived,
      ...changes,
    });
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace / Mailbox"
        title="Mailbox"
        description="Shared workspace email drafts and recorded email activity, with clear delivery status."
        actions={
          <>
            <AddAppsButton label="Connect email" category="mail" />
            <a className="btn btn-primary" href="#compose">
              New draft
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
      <Notice tone="amber" title="Shared drafts · no live mailbox connected">
        Drafts are visible to workspace members. Saving does not send email.
        Inbox synchronization and external delivery require a separately
        authorized live connection.
      </Notice>
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">
          {["drafts", "inbox", "activity"].map((tab) => (
            <Link
              key={tab}
              className={`btn btn-sm ${(sp.tab ?? "drafts") === tab ? "btn-primary" : "btn-secondary"}`}
              href={url({ tab })}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Link>
          ))}
        </div>
        <Link
          className="btn btn-ghost btn-sm"
          href={url({
            tab: "drafts",
            archived: sp.archived === "1" ? undefined : "1",
          })}
        >
          {sp.archived === "1" ? "Active drafts" : "Archived drafts"}
        </Link>
      </div>
      {sp.tab === "inbox" || sp.tab === "activity" ? (
        <Card>
          {messages.length ? (
            <ul className="divide-y divide-line">
              {messages.map((m) => (
                <li key={m.id} className="py-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h2 className="font-medium">
                      {m.subject || "Email activity"}
                    </h2>
                    <Badge tone={m.status === "sent" ? "emerald" : "amber"}>
                      {m.status === "simulated"
                        ? "Simulated · not delivered"
                        : m.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-3">
                    {m.direction} · {m.counterpart ?? ""} · {m.createdAt}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink-2">
                    {m.body}
                  </p>
                  {m.approvalId && (
                    <Link
                      className="mt-3 block text-xs text-accent"
                      href={`/approvals/${m.approvalId}`}
                    >
                      Review request and receipt →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={
                sp.tab === "inbox"
                  ? "No received email"
                  : "No email activity recorded"
              }
              description="Connect account setup is available above. An app setup card alone does not import or send messages."
            />
          )}
        </Card>
      ) : (
        <Card padded={false}>
          {drafts.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>To</th>
                    <th>Employee / team</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link
                          className="font-medium text-accent"
                          href={`/work/records/${r.id}`}
                        >
                          {r.title}
                        </Link>
                      </td>
                      <td>{String(r.data.to || "Recipient not set")}</td>
                      <td>
                        {scope.staff.find((e) => e.id === r.employeeId)?.name ??
                          scope.teams.find((t) => t.id === r.departmentId)
                            ?.name ??
                          "Organization"}
                      </td>
                      <td>
                        <Badge tone="amber">
                          {r.archivedAt ? "Archived" : "Draft · not sent"}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap text-xs text-ink-3">
                        {r.updatedAt.slice(0, 16).replace("T", " ")} UTC
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState
                title="No shared drafts here"
                description="Compose a draft below. It stays in HQ until an approved delivery path is available."
              />
            </div>
          )}
        </Card>
      )}
      {sp.archived !== "1" && (
        <Card>
          <div id="compose" className="scroll-mt-20">
            <CardTitle>Compose shared draft</CardTitle>
            <RecordEditor
              kind="mail"
              teams={scope.teams}
              staff={scope.staff}
              departmentId={sp.departmentId}
              employeeId={sp.employeeId}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
