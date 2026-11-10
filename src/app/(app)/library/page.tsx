import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/context";
import { approvals, artifacts } from "@/db/schema";
import { listWorkRecords } from "@/lib/services/workspace-records";
import {
  workContext,
  workUrl,
  type WorkParams,
} from "@/lib/services/workspace-context";
import { libraryColumn } from "@/lib/workspace/library";
import { CONTENT_TYPES } from "@/lib/workspace/records";
import { Card, CardTitle, PageHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { ScopeBar } from "@/components/workspace/scope-bar";
import { RecordEditor } from "@/components/workspace/record-editor";
import {
  ArtifactView,
  ArtifactStatusBadge,
} from "@/components/artifacts/artifact-view";
export const dynamic = "force-dynamic";
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<WorkParams & { type?: string }>;
}) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const scope = workContext(ctx.db, ctx.workspace.id, sp);
  const drafts = listWorkRecords(ctx.db, ctx.workspace.id, ["content"], {
    ...scope.scope,
    q: sp.q,
    archived: sp.archived === "1",
  });
  const outputs = ctx.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.workspaceId, ctx.workspace.id))
    .orderBy(desc(artifacts.createdAt))
    .all()
    .filter(
      (a) =>
        (!scope.scope.employeeId || a.employeeId === scope.scope.employeeId) &&
        (!scope.scope.departmentId ||
          scope.staff.some(
            (e) =>
              e.id === a.employeeId &&
              e.departmentId === scope.scope.departmentId,
          )) &&
        (!sp.q || a.title.toLowerCase().includes(sp.q.toLowerCase())) &&
        (sp.archived === "1"
          ? ["superseded", "rejected"].includes(a.status)
          : !["superseded", "rejected"].includes(a.status)),
    );
  const pending = ctx.db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.workspaceId, ctx.workspace.id),
        eq(approvals.status, "pending"),
      ),
    )
    .all();
  const selected = sp.artifact
    ? outputs.find((a) => a.id === sp.artifact)
    : null;
  if (sp.artifact && !selected)
    throw new Error("Output not found in the selected scope.");
  const url = (changes: Partial<WorkParams & { type?: string }>) =>
    workUrl("/library", {
      departmentId: sp.departmentId,
      employeeId: sp.employeeId,
      view: sp.view,
      archived: sp.archived,
      ...changes,
    });
  const type = CONTENT_TYPES.includes(sp.type as (typeof CONTENT_TYPES)[number])
    ? sp.type!
    : "document";
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace / Library"
        title="Library"
        description="A shared home for content drafts and the AI outputs your team has already produced."
        actions={
          <>
            <Link className="btn btn-secondary" href="/drive?view=files">
              Media and files in Drive
            </Link>
            <a className="btn btn-primary" href="#create-content">
              Create content
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
        hidden={{ view: sp.view, archived: sp.archived }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link
            className={`btn btn-sm ${sp.view !== "list" ? "btn-primary" : "btn-secondary"}`}
            href={url({ view: undefined })}
          >
            Board
          </Link>
          <Link
            className={`btn btn-sm ${sp.view === "list" ? "btn-primary" : "btn-secondary"}`}
            href={url({ view: "list" })}
          >
            List
          </Link>
        </div>
        <Link
          className="btn btn-ghost btn-sm"
          href={url({ archived: sp.archived === "1" ? undefined : "1" })}
        >
          {sp.archived === "1" ? "Current content" : "Archived and superseded"}
        </Link>
      </div>
      {selected && (
        <Card>
          <CardTitle action={<ArtifactStatusBadge status={selected.status} />}>
            {selected.title}
          </CardTitle>
          <ArtifactView artifact={selected} />
          <Link
            className="btn btn-secondary btn-sm mt-4"
            href={`/tasks/${selected.taskId}`}
          >
            Open original task and review
          </Link>
        </Card>
      )}
      <div
        className={
          sp.view === "list" ? "space-y-4" : "grid gap-4 lg:grid-cols-3"
        }
      >
        {["Drafts", "Needs review", "Reviewed"].map((column) => {
          const native = column === "Drafts" ? drafts : [];
          const generated = outputs.filter(
            (a) => libraryColumn(a, pending) === column,
          );
          return (
            <Card key={column}>
              <CardTitle
                action={<Badge>{native.length + generated.length}</Badge>}
              >
                {column}
              </CardTitle>
              <div className="space-y-3">
                {native.map((r) => (
                  <Link
                    key={r.id}
                    href={`/work/records/${r.id}`}
                    className="block rounded-xl border border-line p-3"
                  >
                    <h3 className="break-words text-sm font-medium">
                      {r.title}
                    </h3>
                    <p className="mt-2 text-xs text-ink-3">
                      {String(r.data.contentType).replaceAll("_", " ")} · saved
                      by a human
                    </p>
                  </Link>
                ))}
                {generated.map((a) => (
                  <Link
                    key={a.id}
                    href={url({ artifact: a.id })}
                    className="block rounded-xl border border-line p-3"
                  >
                    <h3 className="break-words text-sm font-medium">
                      {a.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ArtifactStatusBadge status={a.status} />
                      <Badge>AI output · v{a.version}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-ink-3">
                      {scope.staff.find((e) => e.id === a.employeeId)?.name ??
                        "Employee output"}
                    </p>
                  </Link>
                ))}
                {!native.length && !generated.length && (
                  <p className="py-6 text-center text-xs text-ink-3">
                    No items in this column.
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {!drafts.length && !outputs.length && (
        <EmptyState
          title="Your content library is ready"
          description="Start a working draft below. Existing AI outputs appear here with their original review status."
        />
      )}
      {sp.archived !== "1" && (
        <Card>
          <div id="create-content" className="scroll-mt-20">
            <CardTitle description="These are local working drafts. Publishing and scheduling require a separate live connector and approval.">
              Create content
            </CardTitle>
            <div className="mb-5 flex flex-wrap gap-2">
              {CONTENT_TYPES.map((t) => (
                <Link
                  key={t}
                  className={`btn btn-sm ${type === t ? "btn-primary" : "btn-secondary"}`}
                  href={`${url({ type: t })}#create-content`}
                >
                  {t.replaceAll("_", " ")}
                </Link>
              ))}
            </div>
            <RecordEditor
              key={type}
              kind="content"
              contentType={type}
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
