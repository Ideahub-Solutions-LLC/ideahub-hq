"use server";
import { requirePermission } from "@/lib/auth/context";
import { describeError, flashRedirect, optStr, str } from "@/lib/actions-util";
import { WORK_RECORD_KINDS, type WorkRecordKind } from "@/db/schema";
import {
  archiveWorkRecord,
  getWorkRecord,
  proposeDriveKnowledge,
  saveWorkRecord,
  storeDriveUpload,
  MAX_DRIVE_UPLOAD,
} from "@/lib/services/workspace-records";
import { RECORD_ROUTES } from "@/lib/workspace/records";
import { workUrl } from "@/lib/services/workspace-context";

function fields(kind: WorkRecordKind, fd: FormData) {
  const notes = str(fd, "notes");
  switch (kind) {
    case "folder":
      return { description: str(fd, "description") };
    case "file":
      return {
        fileName: str(fd, "fileName"),
        mediaType: "text/markdown",
        body: String(fd.get("body") ?? ""),
        uploaded: false,
      };
    case "event":
      return {
        startAt: str(fd, "startAt"),
        endAt: str(fd, "endAt"),
        timeZone: str(fd, "timeZone"),
        location: str(fd, "location"),
        notes,
      };
    case "company":
      return {
        website: str(fd, "website"),
        industry: str(fd, "industry"),
        notes,
      };
    case "contact":
      return {
        email: str(fd, "email"),
        phone: str(fd, "phone"),
        jobTitle: str(fd, "jobTitle"),
        companyId: optStr(fd, "companyId"),
        notes,
      };
    case "deal": {
      const amount = str(fd, "value");
      if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount))
        throw new Error(
          "Enter a nonnegative deal amount with at most two decimal places.",
        );
      return {
        companyId: optStr(fd, "companyId"),
        stage: str(fd, "stage"),
        valueCents: Math.round(Number(amount) * 100),
        currency: str(fd, "currency").toUpperCase(),
        notes,
      };
    }
    case "content":
      return {
        contentType: str(fd, "contentType"),
        channel: str(fd, "channel"),
        body: String(fd.get("body") ?? ""),
      };
    case "mail":
      return { to: str(fd, "to"), body: String(fd.get("body") ?? "") };
  }
}
export async function saveWorkRecordAction(
  kind: WorkRecordKind,
  id: string | null,
  fd: FormData,
) {
  const ctx = await requirePermission("workspace.records.create");
  let next = "";
  if (!WORK_RECORD_KINDS.includes(kind))
    flashRedirect("/dashboard", { error: "Unknown record type." });
  try {
    const row = saveWorkRecord(ctx.db, {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      id: id ?? undefined,
      expectedVersion: id ? Number(str(fd, "version")) : undefined,
      kind,
      title: str(fd, "title"),
      data: fields(kind, fd),
      parentId: optStr(fd, "parentId"),
      departmentId: optStr(fd, "departmentId"),
      employeeId: optStr(fd, "employeeId"),
    });
    next = `/work/records/${row.id}`;
  } catch (e) {
    flashRedirect(id ? `/work/records/${id}` : RECORD_ROUTES[kind], {
      error: describeError(e),
    });
  }
  flashRedirect(next, {
    ok:
      kind === "mail"
        ? "Shared mailbox draft saved. Nothing was sent."
        : "Workspace record saved.",
  });
}
export async function archiveWorkRecordAction(
  id: string,
  version: number,
  restore: boolean,
) {
  const ctx = await requirePermission("workspace.records.create");
  let path = "/dashboard";
  try {
    const row = getWorkRecord(ctx.db, ctx.workspace.id, id);
    path = RECORD_ROUTES[row.kind];
    archiveWorkRecord(ctx.db, {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      id,
      expectedVersion: version,
      restore,
    });
  } catch (e) {
    flashRedirect(`/work/records/${id}`, { error: describeError(e) });
  }
  flashRedirect(path, {
    ok: restore
      ? "Record restored."
      : "Record archived. You can restore it from the archive/trash view.",
  });
}
export async function uploadDriveAction(fd: FormData) {
  const ctx = await requirePermission("workspace.records.create");
  const folder = optStr(fd, "parentId");
  const departmentId = optStr(fd, "departmentId");
  const employeeId = optStr(fd, "employeeId");
  try {
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_DRIVE_UPLOAD)
      throw new Error("Choose a nonempty file up to 5 MiB.");
    storeDriveUpload(ctx.db, {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      fileName: file.name,
      mediaType: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
      parentId: folder,
      departmentId,
      employeeId,
    });
  } catch (e) {
    flashRedirect(workUrl("/drive", { folder, departmentId, employeeId }), {
      error: describeError(e),
    });
  }
  flashRedirect(workUrl("/drive", { folder, departmentId, employeeId }), {
    ok: "File uploaded to local Drive. It is not automatically approved knowledge.",
  });
}
export async function proposeDriveKnowledgeAction(id: string) {
  const ctx = await requirePermission("knowledge.edit");
  let sourceId = "";
  try {
    sourceId = proposeDriveKnowledge(ctx.db, {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      id,
    });
  } catch (e) {
    flashRedirect(`/work/records/${id}`, { error: describeError(e) });
  }
  flashRedirect(`/knowledge/${sourceId}`, {
    ok: "Pending knowledge source created. Review and explicitly grant access before an employee uses it.",
  });
}
