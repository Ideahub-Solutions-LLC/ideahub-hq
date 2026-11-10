import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb, buildFixture, type Fixture } from "./fixture";
import type { Db } from "@/db/client";
import {
  appInstallations,
  approvals,
  connectorGrants,
  driveBlobs,
  employeeKnowledge,
  jobs,
  knowledgeSources,
  workRecords,
  type WorkRecordKind,
} from "@/db/schema";
import {
  archiveWorkRecord,
  getWorkRecord,
  listWorkRecords,
  MAX_DRIVE_UPLOAD,
  proposeDriveKnowledge,
  readDriveFile,
  saveWorkRecord,
  storeDriveUpload,
} from "@/lib/services/workspace-records";
import {
  appSetupStatus,
  listApps,
  saveAppSetup,
  setAppDisabled,
} from "@/lib/services/apps";
import { createTask } from "@/lib/services/tasks";
import { libraryColumn } from "@/lib/workspace/library";
import { recordSchemas } from "@/lib/workspace/records";
import {
  dateKey,
  eventOnDay,
  monthGrid,
  validTimeZone,
} from "@/lib/workspace/calendar";
let db: Db, f: Fixture, other: Fixture;
beforeEach(() => {
  db = freshDb();
  f = buildFixture(db);
  other = buildFixture(db, { slug: "other" });
});
const base = () => ({
  workspaceId: f.workspaceId,
  userId: f.member,
  departmentId: null,
  employeeId: null,
});
function create(
  kind: WorkRecordKind = "folder",
  data: unknown = {},
  title = "Working record",
) {
  return saveWorkRecord(db, { ...base(), kind, title, data });
}
const edit = (row: ReturnType<typeof create>, extra = {}) => ({
  ...base(),
  id: row.id,
  expectedVersion: row.version,
  kind: row.kind,
  title: row.title,
  data: row.data,
  ...extra,
});
const archive = (row: ReturnType<typeof create>, restore = false) =>
  archiveWorkRecord(db, {
    workspaceId: f.workspaceId,
    userId: f.member,
    id: row.id,
    expectedVersion: row.version,
    restore,
  });
describe("Native workspace records", () => {
  it("isolates reads, lists and updates across workspaces", () => {
    const row = create();
    expect(() => getWorkRecord(db, other.workspaceId, row.id)).toThrow();
    expect(listWorkRecords(db, other.workspaceId, ["folder"])).toHaveLength(0);
    expect(() =>
      saveWorkRecord(db, {
        ...edit(row),
        workspaceId: other.workspaceId,
        userId: other.owner,
      }),
    ).toThrow();
  });
  it("checks membership on creation and rejects a forged record kind", () => {
    expect(() =>
      saveWorkRecord(db, {
        ...base(),
        userId: other.member,
        kind: "folder",
        title: "No access",
        data: {},
      }),
    ).toThrow();
    expect(() =>
      saveWorkRecord(db, {
        ...base(),
        kind: "constructor" as WorkRecordKind,
        title: "Wrong type",
        data: {},
      }),
    ).toThrow("Unknown record");
  });
  it("allows members to edit their own records and managers to manage shared ones", () => {
    const row = create();
    const edited = saveWorkRecord(db, edit(row, { title: "Edited draft" }));
    expect(edited.version).toBe(2);
    const owned = saveWorkRecord(db, {
      ...base(),
      userId: f.owner,
      kind: "folder",
      title: "Manager folder",
      data: {},
    });
    expect(() => saveWorkRecord(db, edit(owned))).toThrow("creator");
    expect(saveWorkRecord(db, edit(owned, { userId: f.manager })).version).toBe(
      2,
    );
  });
  it("rejects stale edits, kind changes and edits of archived records", () => {
    const row = create();
    saveWorkRecord(db, edit(row));
    expect(() => saveWorkRecord(db, edit(row))).toThrow("changed");
    const fresh = getWorkRecord(db, f.workspaceId, row.id);
    expect(() =>
      saveWorkRecord(db, edit(fresh, { kind: "company" })),
    ).toThrow();
    archive(fresh);
    expect(() =>
      saveWorkRecord(db, edit(getWorkRecord(db, f.workspaceId, row.id))),
    ).toThrow("archived");
  });
  it("validates all team and employee references and team membership", () => {
    expect(() =>
      saveWorkRecord(db, {
        ...base(),
        departmentId: other.deptId,
        kind: "folder",
        title: "Bad team",
        data: {},
      }),
    ).toThrow();
    expect(() =>
      saveWorkRecord(db, {
        ...base(),
        employeeId: other.employeeId,
        kind: "folder",
        title: "Bad employee",
        data: {},
      }),
    ).toThrow();
    expect(() =>
      listWorkRecords(db, f.workspaceId, ["folder"], {
        departmentId: other.deptId,
      }),
    ).toThrow();
  });
  it("filters by scope, search and archived status", () => {
    const row = saveWorkRecord(db, {
      ...base(),
      kind: "folder",
      title: "Design assets",
      data: { description: "Campaign" },
      departmentId: f.deptId,
      employeeId: f.employeeId,
    });
    create("folder", {}, "Other folder");
    expect(
      listWorkRecords(db, f.workspaceId, ["folder"], {
        departmentId: f.deptId,
        employeeId: f.employeeId,
        q: "CAMPAIGN",
      }).map((r) => r.id),
    ).toEqual([row.id]);
    archive(row);
    expect(
      listWorkRecords(db, f.workspaceId, ["folder"], { archived: true }),
    ).toHaveLength(1);
  });
  it("validates parent kind, workspace, scope and cycles", () => {
    const parent = create();
    const child = saveWorkRecord(db, {
      ...base(),
      kind: "folder",
      title: "Child",
      data: {},
      parentId: parent.id,
    });
    expect(() =>
      saveWorkRecord(db, edit(parent, { parentId: child.id })),
    ).toThrow("cycle");
    expect(() =>
      saveWorkRecord(db, edit(parent, { parentId: parent.id })),
    ).toThrow("cycle");
    const foreign = saveWorkRecord(db, {
      ...base(),
      workspaceId: other.workspaceId,
      userId: other.member,
      kind: "folder",
      title: "Foreign",
      data: {},
    });
    expect(() =>
      saveWorkRecord(db, edit(child, { parentId: foreign.id })),
    ).toThrow();
    expect(() =>
      saveWorkRecord(
        db,
        edit(child, { departmentId: f.deptId, parentId: parent.id }),
      ),
    ).toThrow("same scope");
    expect(() =>
      saveWorkRecord(db, edit(parent, { departmentId: f.deptId })),
    ).toThrow("contents");
  });
  it("enforces a bounded folder depth", () => {
    let parent = create();
    for (let i = 0; i < 8; i++)
      parent = saveWorkRecord(db, {
        ...base(),
        kind: "folder",
        title: `Nested ${i}`,
        data: {},
        parentId: parent.id,
      });
    expect(() =>
      saveWorkRecord(db, {
        ...base(),
        kind: "folder",
        title: "Too deep",
        data: {},
        parentId: parent.id,
      }),
    ).toThrow("depth");
  });
  it("archives folders only after contents; restores parents first", () => {
    const parent = create();
    const child = saveWorkRecord(db, {
      ...base(),
      kind: "folder",
      title: "Child",
      data: {},
      parentId: parent.id,
    });
    expect(() => archive(parent)).toThrow("contents");
    archive(child);
    archive(parent);
    expect(() =>
      archive(getWorkRecord(db, f.workspaceId, child.id), true),
    ).toThrow("parent");
    archive(getWorkRecord(db, f.workspaceId, parent.id), true);
    archive(getWorkRecord(db, f.workspaceId, child.id), true);
    expect(getWorkRecord(db, f.workspaceId, child.id).archivedAt).toBeNull();
  });
  it("keeps linked companies active and requires a company restore before its contacts", () => {
    const company = create("company");
    const contact = create("contact", {
      companyId: company.id,
      email: "sam@example.com",
    });
    expect(() => archive(company)).toThrow("links");
    archive(contact);
    archive(company);
    expect(() =>
      archive(getWorkRecord(db, f.workspaceId, contact.id), true),
    ).toThrow("company");
    expect(() =>
      create("deal", {
        companyId: company.id,
        stage: "lead",
        valueCents: 12345,
        currency: "USD",
      }),
    ).toThrow("active company");
    expect(() => create("contact", { companyId: f.sourceId })).toThrow();
  });
  it("rejects references to a foreign company", () => {
    const company = saveWorkRecord(db, {
      ...base(),
      workspaceId: other.workspaceId,
      userId: other.member,
      kind: "company",
      title: "Foreign company",
      data: {},
    });
    expect(() => create("contact", { companyId: company.id })).toThrow();
  });
  it("stores deals in exact cents with validated stages and URLs", () => {
    expect(
      create("deal", { stage: "proposal", valueCents: 12345, currency: "USD" })
        .data.valueCents,
    ).toBe(12345);
    expect(() =>
      create("deal", { stage: "delivered", valueCents: -1, currency: "usd" }),
    ).toThrow();
    expect(() =>
      create("company", { website: "javascript:alert(1)" }),
    ).toThrow();
    expect(() => create("contact", { email: "not email" })).toThrow();
  });
  it("saves native content and mailbox drafts without executing anything", () => {
    create("content", {
      contentType: "newsletter",
      channel: "Email",
      body: "  Draft\n",
    });
    const mail = create("mail", {
      to: "sam@example.com",
      body: "Private working draft",
    });
    expect(mail.data.body).toBe("Private working draft");
    expect(db.select().from(jobs).all()).toHaveLength(0);
    expect(db.select().from(approvals).all()).toHaveLength(0);
    expect(() =>
      create("mail", { to: "sam@example.com", body: "Hello", sent: true }),
    ).toThrow();
  });
  it("keeps due dates valid and scoped when creating tasks", () => {
    const input = {
      workspaceId: f.workspaceId,
      requestedByUserId: f.member,
      title: "Follow up",
      objective: "Review the work",
      dueAt: "2026-11-10",
    };
    expect(createTask(db, input).dueAt).toBe("2026-11-10");
    expect(() =>
      createTask(db, { ...input, employeeId: other.employeeId }),
    ).toThrow();
    expect(() =>
      createTask(db, { ...input, ownerUserId: other.owner }),
    ).toThrow();
    expect(() => createTask(db, { ...input, dueAt: "2026-02-30" })).toThrow();
    expect(() =>
      createTask(db, { ...input, requestedByUserId: other.member }),
    ).toThrow();
  });
});
describe("Local Drive", () => {
  function upload(
    bytes = Buffer.from("Reviewed source text"),
    fileName = "brief.txt",
    mediaType = "text/plain",
  ) {
    return storeDriveUpload(db, { ...base(), fileName, mediaType, bytes });
  }
  it("persists original bytes and scoped attachment metadata", () => {
    const bytes = Buffer.from([0, 255, 1, 10]);
    const row = upload(bytes, "brief.bin", "application/octet-stream");
    expect(readDriveFile(db, f.workspaceId, f.member, row.id).bytes).toEqual(
      bytes,
    );
    expect(() =>
      readDriveFile(db, other.workspaceId, other.member, row.id),
    ).toThrow();
    expect(() =>
      readDriveFile(db, f.workspaceId, other.member, row.id),
    ).toThrow();
    expect(db.select().from(driveBlobs).all()).toHaveLength(1);
  });
  it("bounds file size and rejects path names", () => {
    expect(() => upload(Buffer.alloc(0))).toThrow("nonempty");
    expect(() => upload(Buffer.alloc(MAX_DRIVE_UPLOAD + 1))).toThrow("5 MiB");
    for (const name of ["../brief.txt", "folder\\brief.txt", "bad\r\nname"])
      expect(() => upload(Buffer.from("x"), name)).toThrow();
    expect(upload(Buffer.from("x"), "a").title).toBe("a");
  });
  it("enforces aggregate quota including trashed uploads", () => {
    const row = upload();
    archive(row);
    db.update(driveBlobs)
      .set({ sizeBytes: 100 * 1024 * 1024 })
      .where(eq(driveBlobs.recordId, row.id))
      .run();
    expect(() => upload()).toThrow("100 MiB");
    expect(db.select().from(driveBlobs).all()).toHaveLength(1);
  });
  it("blocks downloads of trash and text editing of uploaded files", () => {
    const row = upload();
    expect(() =>
      saveWorkRecord(
        db,
        edit(row, { data: { fileName: "brief.txt", body: "Replacement" } }),
      ),
    ).toThrow("text editor");
    archive(row);
    expect(() => readDriveFile(db, f.workspaceId, f.member, row.id)).toThrow(
      "Active file",
    );
  });
  it("preserves document whitespace and creates versioned pending knowledge snapshots only", () => {
    const row = create("file", {
      fileName: "policy.md",
      mediaType: "text/markdown",
      body: "  Policy text\n",
    });
    expect(
      readDriveFile(db, f.workspaceId, f.member, row.id).bytes.toString(),
    ).toBe("  Policy text\n");
    const before = db.select().from(employeeKnowledge).all().length;
    expect(() =>
      proposeDriveKnowledge(db, {
        workspaceId: f.workspaceId,
        userId: f.member,
        id: row.id,
      }),
    ).toThrow();
    const input = { workspaceId: f.workspaceId, userId: f.manager, id: row.id };
    const sourceId = proposeDriveKnowledge(db, input);
    expect(proposeDriveKnowledge(db, input)).toBe(sourceId);
    const source = db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, sourceId))
      .get()!;
    expect(source.reviewStatus).toBe("pending");
    expect(source.content).toBe("  Policy text\n");
    expect(db.select().from(employeeKnowledge).all()).toHaveLength(before);
    saveWorkRecord(
      db,
      edit(row, {
        data: {
          fileName: "policy.md",
          mediaType: "text/markdown",
          body: "New text",
        },
      }),
    );
    expect(proposeDriveKnowledge(db, input)).not.toBe(sourceId);
  });
  it("rejects binary and malformed UTF-8 knowledge", () => {
    const image = upload(Buffer.from([1, 2, 3]), "image.png", "image/png");
    expect(() =>
      proposeDriveKnowledge(db, {
        workspaceId: f.workspaceId,
        userId: f.manager,
        id: image.id,
      }),
    ).toThrow("text files");
    const invalid = upload(Buffer.from([255, 255]));
    expect(() =>
      proposeDriveKnowledge(db, {
        workspaceId: f.workspaceId,
        userId: f.manager,
        id: invalid.id,
      }),
    ).toThrow();
  });
});
describe("App catalog setup", () => {
  const setup = () => ({
    workspaceId: f.workspaceId,
    userId: f.owner,
    appKey: "teams",
    accountLabel: "Team account",
    ownerUserId: f.owner,
    departmentId: null,
    employeeId: null,
    requestedScopes: ["read"],
    mcpServerId: null,
  });
  it("requires admins and validates owner, team, employee and endpoint membership", () => {
    expect(() => saveAppSetup(db, { ...setup(), userId: f.manager })).toThrow();
    expect(() =>
      saveAppSetup(db, { ...setup(), ownerUserId: other.owner }),
    ).toThrow();
    expect(() =>
      saveAppSetup(db, { ...setup(), departmentId: other.deptId }),
    ).toThrow();
    expect(() =>
      saveAppSetup(db, { ...setup(), employeeId: other.employeeId }),
    ).toThrow();
    expect(() =>
      saveAppSetup(db, { ...setup(), mcpServerId: "missing" }),
    ).toThrow();
  });
  it("accepts catalog permissions only", () => {
    expect(() =>
      saveAppSetup(db, { ...setup(), appKey: "invented" }),
    ).toThrow();
    expect(() =>
      saveAppSetup(db, { ...setup(), requestedScopes: ["admin"] }),
    ).toThrow();
    expect(() =>
      saveAppSetup(db, { ...setup(), requestedScopes: [] }),
    ).toThrow();
  });
  it("upserts by app and canonical scope, with independent team and employee setups", () => {
    const a = saveAppSetup(db, setup());
    const b = saveAppSetup(db, {
      ...setup(),
      accountLabel: "Renamed",
      requestedScopes: ["read", "read"],
    });
    expect(a.id).toBe(b.id);
    expect(b.version).toBe(2);
    expect(b.requestedScopes).toEqual(["read"]);
    saveAppSetup(db, { ...setup(), departmentId: f.deptId });
    const emp = saveAppSetup(db, { ...setup(), employeeId: f.employeeId });
    expect(
      saveAppSetup(db, {
        ...setup(),
        departmentId: f.deptId,
        employeeId: f.employeeId,
      }).id,
    ).toBe(emp.id);
    expect(listApps(db, f.workspaceId)).toHaveLength(3);
    expect(listApps(db, other.workspaceId)).toHaveLength(0);
  });
  it("never treats setup as account authorization or employee grants", () => {
    const before = db.select().from(connectorGrants).all().length;
    const row = saveAppSetup(db, setup());
    expect(row.status).toBe("setup_required");
    expect(appSetupStatus(db, row).label).toBe("Native adapter: planned");
    const mail = saveAppSetup(db, { ...setup(), appKey: "gmail" });
    expect(appSetupStatus(db, mail).label).toBe("Connection needed");
    expect(db.select().from(connectorGrants).all()).toHaveLength(before);
    expect(db.select().from(jobs).all()).toHaveLength(0);
    expect(db.select().from(approvals).all()).toHaveLength(0);
  });
  it("disables setup with stale-write and workspace protection", () => {
    const row = saveAppSetup(db, setup());
    const input = {
      workspaceId: f.workspaceId,
      userId: f.owner,
      id: row.id,
      version: row.version,
      disabled: true,
    };
    setAppDisabled(db, input);
    const disabled = db
      .select()
      .from(appInstallations)
      .where(eq(appInstallations.id, row.id))
      .get()!;
    expect(appSetupStatus(db, disabled).label).toBe("Setup disabled");
    expect(() => setAppDisabled(db, input)).toThrow("changed");
    expect(() =>
      setAppDisabled(db, {
        ...input,
        workspaceId: other.workspaceId,
        userId: other.owner,
        version: disabled.version,
      }),
    ).toThrow();
  });
});
describe("Calendar dates and validation", () => {
  it("produces a Monday-first six-week grid across year boundaries", () => {
    const grid = monthGrid("2026-11");
    expect(grid.days).toHaveLength(42);
    expect(grid.days[0].key).toBe("2026-10-26");
    expect(grid.previous).toBe("2026-10");
    expect(monthGrid("2026-12").next).toBe("2027-01");
    expect(() => monthGrid("2026-13")).toThrow();
  });
  it("preserves date-only task due dates while applying event time zones", () => {
    expect(dateKey("2026-11-10", "America/Los_Angeles")).toBe("2026-11-10");
    expect(dateKey("2026-11-10T23:00:00Z", "Asia/Manila")).toBe("2026-11-11");
    expect(() => validTimeZone("No/SuchZone")).toThrow();
  });
  it("uses exclusive event end dates at midnight", () => {
    const data = {
      startAt: "2026-11-10T00:00:00Z",
      endAt: "2026-11-11T00:00:00Z",
    };
    expect(eventOnDay(data, "2026-11-10", "UTC")).toBe(true);
    expect(eventOnDay(data, "2026-11-11", "UTC")).toBe(false);
  });
  it("rejects reversed, unbounded and unzoned events", () => {
    const event = {
      startAt: "2026-11-10T09:00:00Z",
      endAt: "2026-11-10T10:00:00Z",
      timeZone: "Asia/Manila",
    };
    expect(recordSchemas.event.safeParse(event).success).toBe(true);
    for (const override of [
      { endAt: event.startAt },
      { endAt: "2027-11-10T10:00:00Z" },
      { timeZone: "No/SuchZone" },
      { startAt: "2026-11-10T09:00:00" },
    ])
      expect(
        recordSchemas.event.safeParse({ ...event, ...override }).success,
      ).toBe(false);
  });
});

describe("Library review state", () => {
  it("keeps reviewed drafts in a single reviewed column while external approval is pending", () => {
    expect(
      libraryColumn({ id: "draft-1", status: "reviewed" }, [
        { artifactId: "draft-1", actionType: "create_external_tasks" },
      ]),
    ).toBe("Reviewed");
  });
  it("uses draft review requests only for the needs-review column", () => {
    const artifact = { id: "draft-1", status: "draft" };
    expect(
      libraryColumn(artifact, [
        { artifactId: "draft-1", actionType: "send_message" },
      ]),
    ).toBe("Drafts");
    expect(
      libraryColumn(artifact, [
        { artifactId: "another", actionType: "review_draft" },
      ]),
    ).toBe("Drafts");
    expect(
      libraryColumn(artifact, [
        { artifactId: "draft-1", actionType: "review_draft" },
      ]),
    ).toBe("Needs review");
  });
});
