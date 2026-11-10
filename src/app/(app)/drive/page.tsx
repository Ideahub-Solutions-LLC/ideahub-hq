import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import {
  Folder,
  FileText,
  Upload,
  ChevronRight,
  HardDrive,
} from "lucide-react";
import { requireWorkspace } from "@/lib/auth/context";
import { driveBlobs } from "@/db/schema";
import {
  getWorkRecord,
  listWorkRecords,
} from "@/lib/services/workspace-records";
import {
  workContext,
  workUrl,
  type WorkParams,
} from "@/lib/services/workspace-context";
import { Card, CardTitle, PageHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/button";
import { ScopeBar } from "@/components/workspace/scope-bar";
import { AddAppsButton } from "@/components/workspace/app-catalog";
import { RecordEditor } from "@/components/workspace/record-editor";
import { uploadDriveAction } from "../work/actions";
export const dynamic = "force-dynamic";
export default async function DrivePage({
  searchParams,
}: {
  searchParams: Promise<WorkParams>;
}) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const folder = sp.folder
    ? getWorkRecord(ctx.db, ctx.workspace.id, sp.folder)
    : null;
  if (folder && (folder.kind !== "folder" || folder.archivedAt))
    throw new Error("Active folder not found.");
  const active = {
    ...sp,
    departmentId: sp.departmentId ?? folder?.departmentId ?? undefined,
    employeeId: sp.employeeId ?? folder?.employeeId ?? undefined,
  };
  const scope = workContext(ctx.db, ctx.workspace.id, active);
  const rows = listWorkRecords(ctx.db, ctx.workspace.id, ["folder", "file"], {
    ...scope.scope,
    q: sp.q,
    archived: sp.archived === "1",
  }).filter((r) =>
    sp.archived === "1" || sp.view === "files"
      ? sp.archived === "1" || r.kind === "file"
      : r.parentId === (folder?.id ?? null),
  );
  const used = ctx.db
    .select({ n: sql<number>`coalesce(sum(${driveBlobs.sizeBytes}),0)` })
    .from(driveBlobs)
    .where(eq(driveBlobs.workspaceId, ctx.workspace.id))
    .get()!.n;
  const url = (changes: Partial<WorkParams>) =>
    workUrl("/drive", {
      departmentId: active.departmentId,
      employeeId: active.employeeId,
      folder: sp.folder,
      view: sp.view,
      ...changes,
    });
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace / Drive"
        title="Drive"
        description="Shared folders, uploaded files and working documents, organized by team or employee."
        actions={
          <>
            <AddAppsButton label="Connect storage" category="storage" />
            <a className="btn btn-primary" href="#create">
              <Upload size={15} aria-hidden />
              Create or upload
            </a>
          </>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />
      <ScopeBar
        teams={scope.teams}
        staff={scope.staff}
        departmentId={active.departmentId}
        employeeId={active.employeeId}
        q={sp.q}
        hidden={{ view: sp.view, folder: sp.folder, archived: sp.archived }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link
            className={`btn btn-sm ${sp.view !== "files" && sp.archived !== "1" ? "btn-primary" : "btn-secondary"}`}
            href={url({ view: undefined, archived: undefined })}
          >
            Folders
          </Link>
          <Link
            className={`btn btn-sm ${sp.view === "files" ? "btn-primary" : "btn-secondary"}`}
            href={url({
              view: "files",
              folder: undefined,
              archived: undefined,
            })}
          >
            All files
          </Link>
          <Link
            className={`btn btn-sm ${sp.archived === "1" ? "btn-primary" : "btn-secondary"}`}
            href={url({ archived: "1", folder: undefined, view: undefined })}
          >
            Trash
          </Link>
        </div>
        <p className="text-xs text-ink-3">
          Local upload storage: {(used / 1048576).toFixed(1)} / 100 MiB · 5 MiB
          per file
        </p>
      </div>
      <Card>
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          <HardDrive size={16} aria-hidden />
          <Link className="text-accent" href={url({ folder: undefined })}>
            Organization files
          </Link>
          {folder && (
            <>
              <ChevronRight size={14} aria-hidden />
              {folder.parentId && (
                <Link
                  className="text-accent"
                  href={url({ folder: folder.parentId })}
                >
                  Parent folder
                </Link>
              )}
              <span>{folder.title}</span>
            </>
          )}
          {sp.archived === "1" && (
            <Badge tone="amber">Trash · recoverable</Badge>
          )}
        </div>
        {rows.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <Link
                key={row.id}
                className="card card-hover min-w-0 p-4"
                href={
                  row.kind === "folder" && !row.archivedAt
                    ? url({ folder: row.id, view: undefined })
                    : `/work/records/${row.id}`
                }
              >
                <div className="flex items-start gap-3">
                  {row.kind === "folder" ? (
                    <Folder
                      className="shrink-0 text-amber"
                      size={24}
                      aria-hidden
                    />
                  ) : (
                    <FileText
                      className="shrink-0 text-accent"
                      size={24}
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0">
                    <h2 className="break-words text-sm font-semibold">
                      {row.title}
                    </h2>
                    <p className="mt-1 text-xs text-ink-3">
                      {row.kind === "folder"
                        ? "Folder"
                        : row.data.uploaded
                          ? "Uploaded file"
                          : "Text document"}{" "}
                      · v{row.version}
                    </p>
                    <p className="mt-2 text-xs text-ink-2">
                      {scope.staff.find((e) => e.id === row.employeeId)?.name ??
                        scope.teams.find((t) => t.id === row.departmentId)
                          ?.name ??
                        "Organization"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              sp.archived === "1"
                ? "Trash is empty"
                : "This space is ready for files"
            }
            description="Create folders and documents, or upload a file. Files become employee knowledge only after separate review and access grants."
          />
        )}
      </Card>
      {folder && (
        <Link
          className="text-sm text-accent"
          href={`/work/records/${folder.id}`}
        >
          Folder details and archive controls →
        </Link>
      )}
      {sp.archived !== "1" && (
        <div id="create" className="grid scroll-mt-20 gap-5 xl:grid-cols-2">
          <Card>
            <CardTitle>Upload file</CardTitle>
            <form action={uploadDriveAction} className="space-y-4">
              <input type="hidden" name="parentId" value={folder?.id ?? ""} />
              <input
                type="hidden"
                name="departmentId"
                value={scope.scope.departmentId ?? ""}
              />
              <input
                type="hidden"
                name="employeeId"
                value={scope.scope.employeeId ?? ""}
              />
              <label className="label" htmlFor="drive-upload">
                File · up to 5 MiB
              </label>
              <input
                className="input"
                type="file"
                name="file"
                id="drive-upload"
                required
              />
              <p className="text-xs text-ink-2">
                Stored in this HQ database. Downloads are served as attachments.
                Files are not sent to an external storage provider.
              </p>
              <SubmitButton>Upload to Drive</SubmitButton>
            </form>
          </Card>
          <Card>
            <details>
              <summary className="cursor-pointer font-semibold">
                New folder
              </summary>
              <div className="mt-4">
                <RecordEditor
                  kind="folder"
                  teams={scope.teams}
                  staff={scope.staff}
                  parentId={folder?.id}
                  departmentId={scope.scope.departmentId ?? ""}
                  employeeId={scope.scope.employeeId ?? ""}
                />
              </div>
            </details>
          </Card>
          <Card className="xl:col-span-2">
            <details>
              <summary className="cursor-pointer font-semibold">
                New text document
              </summary>
              <div className="mt-4">
                <RecordEditor
                  kind="file"
                  teams={scope.teams}
                  staff={scope.staff}
                  parentId={folder?.id}
                  departmentId={scope.scope.departmentId ?? ""}
                  employeeId={scope.scope.employeeId ?? ""}
                />
              </div>
            </details>
          </Card>
        </div>
      )}
    </div>
  );
}
