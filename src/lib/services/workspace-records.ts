import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  departments,
  driveBlobs,
  employees,
  knowledgeSources,
  workRecords,
  type WorkRecord,
  type WorkRecordKind,
} from "@/db/schema";
import { can, NotFoundError } from "@/lib/authz";
import { newId, nowIso } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { requireActor } from "./hq-profile";
import { createKnowledgeSource } from "./knowledge";
import { recordSchemas } from "@/lib/workspace/records";

export type WorkScope = {
  departmentId: string | null;
  employeeId: string | null;
};
export function validateWorkScope(
  db: Db,
  workspaceId: string,
  scope: WorkScope,
) {
  if (
    scope.departmentId &&
    !db
      .select()
      .from(departments)
      .where(
        and(
          eq(departments.id, scope.departmentId),
          eq(departments.workspaceId, workspaceId),
        ),
      )
      .get()
  )
    throw new NotFoundError("Team not found in this workspace.");
  if (scope.employeeId) {
    const employee = db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.id, scope.employeeId),
          eq(employees.workspaceId, workspaceId),
        ),
      )
      .get();
    if (
      !employee ||
      (scope.departmentId && employee.departmentId !== scope.departmentId)
    )
      throw new NotFoundError(
        "Employee not found in the selected team/workspace.",
      );
  }
}
export function getWorkRecord(db: Db, workspaceId: string, id: string) {
  const row = db
    .select()
    .from(workRecords)
    .where(
      and(eq(workRecords.id, id), eq(workRecords.workspaceId, workspaceId)),
    )
    .get();
  if (!row) throw new NotFoundError("Record not found in this workspace.");
  return row;
}
export function listWorkRecords(
  db: Db,
  workspaceId: string,
  kinds: WorkRecordKind[],
  options: Partial<WorkScope> & { archived?: boolean; q?: string } = {},
) {
  const scope = {
    departmentId: options.departmentId ?? null,
    employeeId: options.employeeId ?? null,
  };
  validateWorkScope(db, workspaceId, scope);
  return db
    .select()
    .from(workRecords)
    .where(eq(workRecords.workspaceId, workspaceId))
    .orderBy(desc(workRecords.updatedAt))
    .all()
    .filter(
      (r) =>
        kinds.includes(r.kind) &&
        !!r.archivedAt === !!options.archived &&
        (!scope.departmentId || r.departmentId === scope.departmentId) &&
        (!scope.employeeId || r.employeeId === scope.employeeId) &&
        (!options.q ||
          `${r.title} ${JSON.stringify(r.data)}`
            .toLowerCase()
            .includes(options.q.toLowerCase().slice(0, 200))),
    );
}
function mayEdit(db: Db, workspaceId: string, userId: string, row: WorkRecord) {
  const actor = requireActor(
    db,
    workspaceId,
    userId,
    "workspace.records.create",
  );
  if (
    !can(actor.role, "workspace.records.manage") &&
    row.createdByUserId !== userId
  )
    throw new Error(
      "Only the creator or a workspace manager can edit this record.",
    );
}
export function saveWorkRecord(
  db: Db,
  input: {
    workspaceId: string;
    userId: string;
    id?: string;
    expectedVersion?: number;
    kind: WorkRecordKind;
    title: string;
    data: unknown;
    parentId?: string | null;
  } & WorkScope,
) {
  requireActor(db, input.workspaceId, input.userId, "workspace.records.create");
  const title = z.string().trim().min(1).max(180).parse(input.title);
  if (!Object.hasOwn(recordSchemas, input.kind))
    throw new Error("Unknown record type.");
  const data = recordSchemas[input.kind].parse(input.data) as Record<
    string,
    unknown
  >;
  if (input.kind === "file" && data.uploaded === true)
    throw new Error("Use the file upload service for binary files.");
  validateWorkScope(db, input.workspaceId, input);
  return db.transaction(
    (tx) => {
      const old = input.id
        ? getWorkRecord(tx, input.workspaceId, input.id)
        : null;
      if (old) {
        mayEdit(tx, input.workspaceId, input.userId, old);
        if (
          old.kind !== input.kind ||
          old.archivedAt ||
          old.version !== input.expectedVersion
        )
          throw new Error(
            "Record changed or is archived. Reload before editing.",
          );
      }
      if (old?.kind === "file" && old.data.uploaded === true)
        throw new Error(
          "Uploaded files cannot be replaced in the text editor.",
        );
      if (
        old?.kind === "folder" &&
        (old.departmentId !== input.departmentId ||
          old.employeeId !== input.employeeId) &&
        tx
          .select()
          .from(workRecords)
          .where(
            and(
              eq(workRecords.workspaceId, input.workspaceId),
              eq(workRecords.parentId, old.id),
            ),
          )
          .get()
      )
        throw new Error(
          "A folder with contents must keep its team and employee scope.",
        );
      const parentId = input.parentId ?? null;
      if (parentId) {
        const parent = getWorkRecord(tx, input.workspaceId, parentId);
        if (
          parent.kind !== "folder" ||
          parent.archivedAt ||
          !["folder", "file"].includes(input.kind) ||
          parent.departmentId !== input.departmentId ||
          parent.employeeId !== input.employeeId
        )
          throw new Error("Select an active folder in the same scope.");
        let ancestor: WorkRecord | null = parent;
        let depth = 0;
        while (ancestor) {
          if (ancestor.id === input.id || ++depth > 8)
            throw new Error("Folder cycle or maximum depth exceeded.");
          ancestor = ancestor.parentId
            ? getWorkRecord(tx, input.workspaceId, ancestor.parentId)
            : null;
        }
      }
      if (data.companyId) {
        const company = getWorkRecord(
          tx,
          input.workspaceId,
          String(data.companyId),
        );
        if (company.kind !== "company" || company.archivedAt)
          throw new Error("Choose an active company in this workspace.");
      }
      const stamp = nowIso();
      const row: WorkRecord = {
        id: old?.id ?? newId("rec"),
        workspaceId: input.workspaceId,
        kind: input.kind,
        title,
        data,
        departmentId: input.departmentId,
        employeeId: input.employeeId,
        parentId,
        createdByUserId: old?.createdByUserId ?? input.userId,
        version: (old?.version ?? 0) + 1,
        archivedAt: null,
        createdAt: old?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      if (old)
        tx.update(workRecords).set(row).where(eq(workRecords.id, row.id)).run();
      else tx.insert(workRecords).values(row).run();
      recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        action: `workspace.${input.kind}.${old ? "update" : "create"}`,
        entityType: "work_record",
        entityId: row.id,
        data: { version: row.version },
      });
      return row;
    },
    { behavior: "immediate" },
  );
}
export function archiveWorkRecord(
  db: Db,
  input: {
    workspaceId: string;
    userId: string;
    id: string;
    expectedVersion: number;
    restore?: boolean;
  },
) {
  return db.transaction(
    (tx) => {
      const row = getWorkRecord(tx, input.workspaceId, input.id);
      mayEdit(tx, input.workspaceId, input.userId, row);
      if (row.version !== input.expectedVersion)
        throw new Error("Record changed. Reload first.");
      if (
        !input.restore &&
        row.kind === "folder" &&
        tx
          .select()
          .from(workRecords)
          .where(
            and(
              eq(workRecords.workspaceId, input.workspaceId),
              eq(workRecords.parentId, row.id),
              isNull(workRecords.archivedAt),
            ),
          )
          .get()
      )
        throw new Error(
          "Move or trash the contents before trashing this folder.",
        );
      if (
        !input.restore &&
        row.kind === "company" &&
        tx
          .select()
          .from(workRecords)
          .where(
            and(
              eq(workRecords.workspaceId, input.workspaceId),
              isNull(workRecords.archivedAt),
            ),
          )
          .all()
          .some((r) => r.data.companyId === row.id)
      )
        throw new Error(
          "Remove company links from active contacts/deals before archiving it.",
        );
      if (
        input.restore &&
        row.parentId &&
        getWorkRecord(tx, input.workspaceId, row.parentId).archivedAt
      )
        throw new Error("Restore the parent folder first.");
      if (
        input.restore &&
        row.data.companyId &&
        getWorkRecord(tx, input.workspaceId, String(row.data.companyId))
          .archivedAt
      )
        throw new Error("Restore the linked company first.");
      tx.update(workRecords)
        .set({
          archivedAt: input.restore ? null : nowIso(),
          version: row.version + 1,
          updatedAt: nowIso(),
        })
        .where(eq(workRecords.id, row.id))
        .run();
      recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        action: input.restore ? "workspace.restore" : "workspace.archive",
        entityType: "work_record",
        entityId: row.id,
      });
    },
    { behavior: "immediate" },
  );
}
export const MAX_DRIVE_UPLOAD = 5 * 1024 * 1024;
export function storeDriveUpload(
  db: Db,
  input: {
    workspaceId: string;
    userId: string;
    fileName: string;
    mediaType: string;
    bytes: Buffer;
    parentId?: string | null;
  } & WorkScope,
) {
  if (!input.bytes.length || input.bytes.length > MAX_DRIVE_UPLOAD)
    throw new Error("Choose a nonempty file up to 5 MiB.");
  const data = recordSchemas.file.parse({
    fileName: input.fileName,
    mediaType: input.mediaType,
    body: "",
    uploaded: false,
  });
  return db.transaction(
    (tx) => {
      const used = tx
        .select({ n: sql<number>`coalesce(sum(${driveBlobs.sizeBytes}),0)` })
        .from(driveBlobs)
        .where(eq(driveBlobs.workspaceId, input.workspaceId))
        .get()!.n;
      if (used + input.bytes.length > 100 * 1024 * 1024)
        throw new Error(
          "Local Drive storage limit is 100 MiB per workspace, including trash.",
        );
      const row = saveWorkRecord(tx, {
        ...input,
        kind: "file",
        title: input.fileName,
        data,
      });
      tx.update(workRecords)
        .set({
          data: { ...data, uploaded: true, sizeBytes: input.bytes.length },
        })
        .where(eq(workRecords.id, row.id))
        .run();
      tx.insert(driveBlobs)
        .values({
          recordId: row.id,
          workspaceId: input.workspaceId,
          bytes: input.bytes,
          sizeBytes: input.bytes.length,
        })
        .run();
      return getWorkRecord(tx, input.workspaceId, row.id);
    },
    { behavior: "immediate" },
  );
}
export function readDriveFile(
  db: Db,
  workspaceId: string,
  userId: string,
  id: string,
) {
  requireActor(db, workspaceId, userId, "workspace.view");
  const row = getWorkRecord(db, workspaceId, id);
  if (row.kind !== "file" || row.archivedAt)
    throw new NotFoundError("Active file not found.");
  const bytes = row.data.uploaded
    ? db
        .select()
        .from(driveBlobs)
        .where(
          and(
            eq(driveBlobs.recordId, id),
            eq(driveBlobs.workspaceId, workspaceId),
          ),
        )
        .get()?.bytes
    : Buffer.from(String(row.data.body ?? ""), "utf8");
  if (!bytes) throw new NotFoundError("File bytes not found.");
  return { row, bytes, fileName: String(row.data.fileName) };
}
export function proposeDriveKnowledge(
  db: Db,
  input: { workspaceId: string; userId: string; id: string },
) {
  requireActor(db, input.workspaceId, input.userId, "knowledge.edit");
  return db.transaction(
    (tx) => {
      const file = readDriveFile(tx, input.workspaceId, input.userId, input.id);
      if (!/^text\//.test(String(file.row.data.mediaType)))
        throw new Error(
          "Only text files can be proposed as knowledge here. Extract and review other formats separately.",
        );
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        file.bytes,
      );
      if (!content.trim() || content.length > 50000)
        throw new Error("Knowledge material must contain 1–50,000 characters.");
      const sourceRef = `Drive record ${file.row.id} v${file.row.version}`;
      const previous = tx
        .select()
        .from(knowledgeSources)
        .where(
          and(
            eq(knowledgeSources.workspaceId, input.workspaceId),
            eq(knowledgeSources.sourceRef, sourceRef),
          ),
        )
        .get();
      return (
        previous?.id ??
        createKnowledgeSource(tx, {
          workspaceId: input.workspaceId,
          userId: input.userId,
          data: {
            title: file.row.title.slice(0, 120),
            type: "document",
            content,
            sourceRef,
            departmentId: file.row.departmentId,
          },
        })
      );
    },
    { behavior: "immediate" },
  );
}
