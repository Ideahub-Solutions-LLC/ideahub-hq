import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/context";
import { can } from "@/lib/authz";
import {
  getWorkRecord,
  listWorkRecords,
} from "@/lib/services/workspace-records";
import { RECORD_ROUTES } from "@/lib/workspace/records";
import { workContext, type WorkParams } from "@/lib/services/workspace-context";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { RecordEditor } from "@/components/workspace/record-editor";
import {
  archiveWorkRecordAction,
  proposeDriveKnowledgeAction,
} from "../../actions";
export const dynamic = "force-dynamic";
export default async function WorkRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<WorkParams>;
}) {
  const ctx = await requireWorkspace();
  const row = getWorkRecord(ctx.db, ctx.workspace.id, (await params).id);
  const sp = await searchParams;
  const scope = workContext(ctx.db, ctx.workspace.id, {});
  const editable =
    can(ctx.role, "workspace.records.manage") ||
    row.createdByUserId === ctx.user.id;
  const labels: Record<string, string> = {
    to: "To",
    body: "Content",
    email: "Email",
    phone: "Phone",
    jobTitle: "Job title",
    website: "Website",
    industry: "Industry",
    stage: "Pipeline stage",
    currency: "Currency",
    valueCents: "Value (cents)",
    startAt: "Start",
    endAt: "End",
    timeZone: "Event time zone",
    location: "Location",
    notes: "Notes",
    description: "Description",
    fileName: "File name",
    mediaType: "File type",
    contentType: "Content type",
    channel: "Intended channel",
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href={RECORD_ROUTES[row.kind]}>
            Back to{" "}
            {row.kind === "mail"
              ? "mailbox"
              : row.kind === "content"
                ? "library"
                : RECORD_ROUTES[row.kind].slice(1)}
          </Link>
        }
        title={row.title}
        description={`Shared workspace record · version ${row.version}`}
        actions={
          <Badge tone={row.archivedAt ? "amber" : "neutral"}>
            {row.archivedAt
              ? "Archived"
              : row.kind === "mail"
                ? "Draft · not sent"
                : row.kind === "content"
                  ? "Draft"
                  : row.kind}
          </Badge>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />
      <Card>
        <CardTitle>Record details</CardTitle>
        <dl className="space-y-4">
          {Object.entries(row.data)
            .filter(
              ([key, value]) => labels[key] && value !== "" && value !== null,
            )
            .map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-medium uppercase text-ink-3">
                  {labels[key]}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {String(value)}
                </dd>
              </div>
            ))}
          {row.data.companyId ? (
            <div>
              <dt className="text-xs text-ink-3">Company</dt>
              <dd>
                <Link
                  className="text-accent"
                  href={`/work/records/${row.data.companyId}`}
                >
                  {
                    getWorkRecord(
                      ctx.db,
                      ctx.workspace.id,
                      String(row.data.companyId),
                    ).title
                  }
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          {row.kind === "file" && !row.archivedAt && (
            <a
              className="btn btn-primary btn-sm"
              href={`/drive/${row.id}/download`}
            >
              Download file
            </a>
          )}
          {row.kind === "file" &&
            !row.archivedAt &&
            /^text\//.test(String(row.data.mediaType)) &&
            can(ctx.role, "knowledge.edit") && (
              <form action={proposeDriveKnowledgeAction.bind(null, row.id)}>
                <SubmitButton variant="secondary" size="sm">
                  Propose as knowledge
                </SubmitButton>
              </form>
            )}
          {row.kind === "folder" && !row.archivedAt && (
            <Link
              className="btn btn-primary btn-sm"
              href={`/drive?folder=${row.id}`}
            >
              Open folder
            </Link>
          )}
        </div>
      </Card>
      {editable &&
        !row.archivedAt &&
        !(row.kind === "file" && row.data.uploaded) && (
          <Card>
            <CardTitle>Edit this record</CardTitle>
            <RecordEditor
              row={row}
              kind={row.kind}
              teams={scope.teams}
              staff={scope.staff}
              companies={listWorkRecords(ctx.db, ctx.workspace.id, ["company"])}
            />
          </Card>
        )}
      {editable && (
        <Card>
          <CardTitle>
            {row.archivedAt ? "Restore record" : "Archive record"}
          </CardTitle>
          <p className="mb-3 text-sm text-ink-2">
            Archived records remain recoverable. Folder contents and company
            links must be handled before their parent is archived.
          </p>
          <form
            action={archiveWorkRecordAction.bind(
              null,
              row.id,
              row.version,
              !!row.archivedAt,
            )}
          >
            <SubmitButton variant="secondary">
              {row.archivedAt
                ? "Restore"
                : row.kind === "file" || row.kind === "folder"
                  ? "Move to trash"
                  : "Archive"}
            </SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}
