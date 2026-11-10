import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { actionReceipts, approvals, artifacts, employeeKnowledge, employees, knowledgeSources, tasks } from "@/db/schema";
import { buildFixture, freshDb, MEETING } from "./fixture";
import { runTaskWorkflow } from "@/lib/workflows/runner";
import { proposeFollowUp, startWorkflowTask } from "@/lib/services/tasks";
import { decideApproval, executeApproval } from "@/lib/services/approvals";
import { parseMeetingSourceEvidence } from "@/lib/services/workflow-evidence";
import * as providers from "@/lib/providers";
import { getConnectorAdapter } from "@/lib/connectors";

afterEach(() => vi.restoreAllMocks());

function setup(useModel = false) {
  const db = freshDb();
  const f = buildFixture(db);
  const task = startWorkflowTask(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, workflowKey: "meeting_actions", input: { sourceId: f.sourceId, useModel }, requestedByUserId: f.manager });
  return { db, f, task };
}

type Setup = ReturnType<typeof setup>;
const mutations: [string, (s: Setup) => void][] = [
  ["approval withdrawn", ({ db, f }) => { db.update(knowledgeSources).set({ reviewStatus: "rejected" }).where(eq(knowledgeSources.id, f.sourceId)).run(); }],
  ["access revoked", ({ db, f }) => { db.delete(employeeKnowledge).where(eq(employeeKnowledge.knowledgeSourceId, f.sourceId)).run(); }],
  ["access moved to another workspace", ({ db, f }) => { db.update(employeeKnowledge).set({ workspaceId: "other" }).where(eq(employeeKnowledge.knowledgeSourceId, f.sourceId)).run(); }],
  ["content changed without version bump", ({ db, f }) => { db.update(knowledgeSources).set({ content: MEETING + "Changed." }).where(eq(knowledgeSources.id, f.sourceId)).run(); }],
  ["version changed", ({ db, f }) => { db.update(knowledgeSources).set({ version: 2 }).where(eq(knowledgeSources.id, f.sourceId)).run(); }],
  ["source title changed", ({ db, f }) => { db.update(knowledgeSources).set({ title: "New title" }).where(eq(knowledgeSources.id, f.sourceId)).run(); }],
  ["source reference changed", ({ db, f }) => { db.update(knowledgeSources).set({ sourceRef: "new reference" }).where(eq(knowledgeSources.id, f.sourceId)).run(); }],
  ["source verification changed", ({ db, f }) => { db.update(knowledgeSources).set({ lastVerifiedAt: "2030-01-01T00:00:00.000Z" }).where(eq(knowledgeSources.id, f.sourceId)).run(); }],
];

function reviewedArtifact(s: Setup) {
  const review = s.db.select().from(approvals).where(eq(approvals.taskId, s.task.id)).get()!;
  decideApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: review.id, userId: s.f.manager, role: "manager", decision: "approve" });
  return s.db.select().from(artifacts).where(eq(artifacts.taskId, s.task.id)).get()!;
}

function propose(s: Setup, artifactId: string, kind: "send_message" | "create_external_tasks" = "send_message") {
  return proposeFollowUp(s.db, { workspaceId: s.f.workspaceId, taskId: s.task.id, artifactId, userId: s.f.manager, kind, connectorKey: kind === "send_message" ? "slack" : "task_system", destination: kind === "send_message" ? "channel:ops" : "connector:task_system" });
}

describe("meeting source provenance", () => {
  it("captures exact source bytes, version, hash and employee configuration; review remains internal", async () => {
    const s = setup();
    await runTaskWorkflow(s.db, s.task.id);
    const artifact = reviewedArtifact(s);
    const evidence = parseMeetingSourceEvidence(artifact.content.sourceEvidence)!;
    expect(evidence).toMatchObject({ schemaVersion: 1, sourceId: s.f.sourceId, sourceVersion: 1, sourceContent: MEETING, sourceContentHash: createHash("sha256").update(MEETING).digest("hex"), employee: { id: s.f.employeeId, configVersion: 1 } });
    expect(evidence.employee.modelConfig).toEqual(s.db.select().from(employees).where(eq(employees.id, s.f.employeeId)).get()!.modelConfig);
    expect(s.db.select().from(approvals).all().map(a => a.actionType)).toEqual(["review_draft"]);
    expect(s.db.select().from(actionReceipts).all()).toHaveLength(0);
    const proposal = propose(s, artifact.id).approval;
    expect(proposal.status).toBe("pending");
    expect(proposal.payload.text).not.toContain("sourceEvidence");
    expect(proposal.payload.text).not.toContain("sourceContent");
    expect(s.db.select().from(actionReceipts).all()).toHaveLength(0);
  });

  it.each(mutations)("blocks both follow-up kinds when %s", async (_label, mutate) => {
    const s = setup();
    await runTaskWorkflow(s.db, s.task.id);
    const artifact = reviewedArtifact(s);
    mutate(s);
    for (const kind of ["send_message", "create_external_tasks"] as const) expect(() => propose(s, artifact.id, kind)).toThrow(/Rerun the meeting workflow/);
    expect(s.db.select().from(approvals).all()).toHaveLength(1);
    expect(s.db.select().from(artifacts).get()?.status).toBe("reviewed");
  });

  it.each(["missing", "malformed", "tampered"])("keeps %s provenance readable but blocks follow-up", async (mode) => {
    const s = setup();
    await runTaskWorkflow(s.db, s.task.id);
    const artifact = reviewedArtifact(s);
    const content = { ...artifact.content };
    if (mode === "missing") delete content.sourceEvidence;
    else if (mode === "malformed") content.sourceEvidence = { schemaVersion: 1 };
    else content.sourceEvidence = { ...parseMeetingSourceEvidence(content.sourceEvidence)!, sourceContent: "tampered" };
    s.db.update(artifacts).set({ content }).where(eq(artifacts.id, artifact.id)).run();
    expect(() => propose(s, artifact.id)).toThrow(/Rerun the meeting workflow/);
    expect(s.db.select().from(artifacts).get()?.content.items).toEqual(artifact.content.items);
  });

  it.each(mutations)("rechecks after an awaited model response when %s", async (_label, mutate) => {
    const s = setup(true);
    vi.spyOn(providers, "resolveProvider").mockReturnValue({
      adapter: { key: "openai", displayName: "Local test stub", isConfigured: () => true, defaultModel: () => "test", complete: async () => {
        await Promise.resolve();
        mutate(s);
        return { text: '{"items":[]}', provider: "openai", model: "test", usage: { inputTokens: 0, outputTokens: 0 }, stopReason: null };
      } }, model: "test", note: null, degraded: false,
    });
    await expect(runTaskWorkflow(s.db, s.task.id)).rejects.toThrow(/Rerun the meeting workflow/);
    expect(s.db.select().from(tasks).where(eq(tasks.id, s.task.id)).get()?.status).toBe("blocked");
    expect(s.db.select().from(artifacts).all()).toHaveLength(0);
    expect(s.db.select().from(approvals).all()).toHaveLength(0);
  });

  it("does not let a failed model call bypass a source revocation through deterministic fallback", async () => {
    const s = setup(true);
    vi.spyOn(providers, "resolveProvider").mockReturnValue({ adapter: { key: "openai", displayName: "Local test stub", isConfigured: () => true, defaultModel: () => "test", complete: async () => {
      await Promise.resolve();
      mutations[0][1](s);
      throw new Error("local stub failure");
    } }, model: "test", note: null, degraded: false });
    await expect(runTaskWorkflow(s.db, s.task.id)).rejects.toThrow(/no longer approved/);
    expect(s.db.select().from(artifacts).all()).toHaveLength(0);
  });
});


async function approvedFollowUp() {
  const s = setup();
  await runTaskWorkflow(s.db, s.task.id);
  const artifact = reviewedArtifact(s);
  const approval = propose(s, artifact.id).approval;
  decideApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: approval.id, userId: s.f.manager, role: "manager", decision: "approve" });
  return { ...s, artifact, approval };
}

describe("meeting evidence at connector execution", () => {
  it.each(mutations)("blocks a newly approved call when %s after proposal", async (_label, mutate) => {
    const s = await approvedFollowUp();
    const execute = vi.spyOn(getConnectorAdapter("slack")!, "execute");
    mutate(s);
    await expect(executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: s.approval.id })).rejects.toThrow(/Rerun the meeting workflow/);
    expect(execute).not.toHaveBeenCalled();
    expect(s.db.select().from(actionReceipts).all()).toHaveLength(0);
  });

  it.each(["workspace", "employee", "task", "review", "version", "legacy"])("rejects changed artifact %s at execution", async (change) => {
    const s = await approvedFollowUp();
    if (change === "workspace") {
      const other = buildFixture(s.db, { slug: "other" });
      s.db.update(artifacts).set({ workspaceId: other.workspaceId }).where(eq(artifacts.id, s.artifact.id)).run();
    } else if (change === "employee") s.db.update(artifacts).set({ employeeId: null }).where(eq(artifacts.id, s.artifact.id)).run();
    else if (change === "task") s.db.update(artifacts).set({ taskId: null }).where(eq(artifacts.id, s.artifact.id)).run();
    else if (change === "review") s.db.update(artifacts).set({ status: "draft" }).where(eq(artifacts.id, s.artifact.id)).run();
    else if (change === "version") s.db.update(artifacts).set({ version: 2 }).where(eq(artifacts.id, s.artifact.id)).run();
    else {
      const content = { ...s.artifact.content };
      delete content.sourceEvidence;
      s.db.update(artifacts).set({ content }).where(eq(artifacts.id, s.artifact.id)).run();
    }
    const execute = vi.spyOn(getConnectorAdapter("slack")!, "execute");
    await expect(executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: s.approval.id })).rejects.toThrow(/draft|artifact/i);
    expect(execute).not.toHaveBeenCalled();
    expect(s.db.select().from(actionReceipts).all()).toHaveLength(0);
  });

  it("returns a completed receipt after source revocation without a second call", async () => {
    const s = await approvedFollowUp();
    const execute = vi.spyOn(getConnectorAdapter("slack")!, "execute");
    const first = await executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: s.approval.id });
    mutations[0][1](s);
    const second = await executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: s.approval.id });
    expect(second.receipt?.id).toBe(first.receipt?.id);
    expect(second.skipped).toBe("Already executed.");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(["done", "unknown", "not_found"] as const)("allows %s reconciliation after revocation but never re-executes", async (result) => {
    const s = await approvedFollowUp();
    const adapter = getConnectorAdapter("slack")!;
    const first = await executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: s.approval.id });
    s.db.update(actionReceipts).set({ status: "unknown" }).where(eq(actionReceipts.id, first.receipt!.id)).run();
    s.db.update(approvals).set({ status: "execution_unknown" }).where(eq(approvals.id, s.approval.id)).run();
    const execute = vi.spyOn(adapter, "execute");
    const reconcile = vi.spyOn(adapter, "reconcile").mockImplementation(async () => {
      await Promise.resolve();
      mutations[0][1](s); // also verifies rechecking after reconciliation's await
      return result;
    });
    if (result !== "not_found") mutations[0][1](s);
    const retry = executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: s.approval.id });
    if (result === "not_found") await expect(retry).rejects.toThrow(/no longer approved/);
    else {
      const outcome = await retry;
      expect(outcome.receipt?.status).toBe(result === "done" ? "succeeded" : "unknown");
      expect(outcome.skipped).toMatch(/reconcil/i);
    }
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(s.db.select().from(actionReceipts).all()).toHaveLength(1);
  });
});


it("retries a reconciled not-found call when the meeting evidence remains current", async () => {
  const s = await approvedFollowUp();
  const adapter = getConnectorAdapter("slack")!;
  const execute = vi.spyOn(adapter, "execute").mockRejectedValueOnce(new Error("test timeout"));
  await expect(executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: s.approval.id })).rejects.toThrow("test timeout");
  const reconcile = vi.spyOn(adapter, "reconcile");
  const retried = await executeApproval(s.db, { workspaceId: s.f.workspaceId, approvalId: s.approval.id });
  expect(reconcile).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(retried.receipt?.status).toBe("succeeded");
  expect(s.db.select().from(actionReceipts).all()).toHaveLength(1);
});
