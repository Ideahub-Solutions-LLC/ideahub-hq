import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { freshDb, buildFixture } from "./fixture";
import { actionReceipts, approvals, artifacts, departments, employeeKnowledge, employees, jobs, knowledgeSources, skills, taskEvents, tasks, usageEvents, workflowRuns, workspaces } from "@/db/schema";
import { captureContentInputs, contentReadiness, reviseContentTask, startContentTask } from "@/lib/services/content";
import { decideApproval } from "@/lib/services/approvals";
import { runOneJob } from "@/lib/jobs/worker";
import { getOfficeSnapshot } from "@/lib/services/office";
import { completeJob, enqueueJob, failJob } from "@/lib/jobs/queue";
import { activityMotion } from "@/lib/office/motion";
import { anthropicAdapter } from "@/lib/providers/anthropic";
import { demoContent, type ContentDraft } from "@/lib/workflows/content-contract";
import { setTaskStatus } from "@/lib/services/tasks";

function setup() {
  const db = freshDb();
  const f = buildFixture(db);
  db.update(departments).set({ name: "Marketing", slug: "marketing" }).where(eq(departments.id, f.deptId)).run();
  db.update(employees).set({ name: "Juno", roleTitle: "AI Marketing Content Assistant" }).where(eq(employees.id, f.employeeId)).run();
  db.update(skills).set({ workflowKey: "content_draft" }).where(eq(skills.id, f.skillId)).run();
  db.update(knowledgeSources).set({ title: "Fictional brand guide", type: "document", content: "Use clear, calm language. Never invent results." }).where(eq(knowledgeSources.id, f.sourceId)).run();
  db.insert(knowledgeSources).values({ id: "fact", workspaceId: f.workspaceId, title: "Fictional approved fact", type: "note", content: "The fictional workshop includes a planning worksheet.", sourceRef: "Fictional evidence", ownerUserId: f.manager, reviewStatus: "approved", version: 1, lastVerifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).run();
  db.insert(employeeKnowledge).values({ employeeId: f.employeeId, knowledgeSourceId: "fact", workspaceId: f.workspaceId, createdAt: new Date().toISOString() }).run();
  const brief = { title: "Workshop introduction", brief: "Prepare an introduction to the fictional workshop using only approved facts.", audience: "New team members", channel: "Newsletter draft", objective: "Explain what the workshop includes", callToAction: "Ask the team for details.", brandGuideId: f.sourceId, sourceIds: [f.sourceId, "fact"] };
  const start = (submissionKey?: string) => startContentTask(db, { workspaceId: f.workspaceId, employeeId: f.employeeId, requestedByUserId: f.manager, input: brief, submissionKey });
  const artifact = () => db.select().from(artifacts).where(eq(artifacts.kind, "content_draft")).all().sort((a,b)=>b.version-a.version)[0];
  const approval = () => db.select().from(approvals).where(eq(approvals.status, "pending")).get()!;
  const activity = () => getOfficeSnapshot(db, f.workspaceId).departments[0].employees[0].activity;
  const decide = (decision: "approve" | "changes_requested" | "reject") => decideApproval(db, { workspaceId: f.workspaceId, approvalId: approval().id, userId: f.manager, role: "manager", decision, note: decision === "changes_requested" ? "Shorten the opening." : "Human checked brand and claims." });
  return { db, f, brief, start, artifact, approval, activity, decide };
}
function model(s: ReturnType<typeof setup>) {
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture-only-not-a-real-key");
  vi.stubEnv("PROVIDER_PRICING_JSON", '{"anthropic:*":{"input":1,"output":1}}');
  const captured = captureContentInputs(s.db, s.f.workspaceId, s.f.employeeId, s.brief);
  const result = { text: JSON.stringify(demoContent(captured.brief, captured.sources)), usage: { inputTokens: 200, outputTokens: 100 }, provider: "anthropic" as const, model: "fixture-model", stopReason: "end" };
  return result;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("content brief → draft → human review", () => {
  it("runs a real offline workflow, saves source snapshots and stages, then completes only on review", async () => {
    const s=setup(); const task=s.start();
    expect(s.activity().kind).toBe("queued");
    expect((await runOneJob(s.db,"worker"))?.outcome).toBe("succeeded");
    const draft=s.artifact().content as unknown as ContentDraft;
    expect(draft.generatedBy).toContain("Offline Demo");
    expect(draft.sources).toHaveLength(2);
    expect(draft.checks.every(c=>c.supported)).toBe(true);
    expect(s.db.select().from(taskEvents).where(eq(taskEvents.kind,"workflow_stage")).all().map(e=>e.data?.stage)).toEqual(["validating","reading","drafting","checking"]);
    expect(s.activity().kind).toBe("review");
    expect(()=>setTaskStatus(s.db,{workspaceId:s.f.workspaceId,taskId:task.id,status:"completed",userId:s.f.manager})).toThrow("human review");
    s.decide("approve");
    expect(s.activity()).toMatchObject({kind:"completed",label:"Content draft reviewed"});
    expect(s.db.select().from(actionReceipts).all()).toHaveLength(0);
    expect(s.db.select().from(tasks).where(eq(tasks.id,task.id)).get()?.status).toBe("completed");
  });
  it("deduplicates submitted forms and creates no duplicate jobs", () => {
    const s=setup(); const first=s.start("brief-repeat-key");
    expect(s.start("brief-repeat-key").id).toBe(first.id);
    expect(s.db.select().from(jobs).all()).toHaveLength(1);
    expect(()=>startContentTask(s.db,{workspaceId:s.f.workspaceId,employeeId:s.f.employeeId,requestedByUserId:s.f.manager,submissionKey:"brief-repeat-key",input:{...s.brief,title:"Different content"}})).toThrow("already used");
  });
  it("preserves reviewed decisions and creates a fresh version for changes", async () => {
    const s=setup(); const task=s.start(); await runOneJob(s.db,"worker"); const old=s.approval();
    s.decide("changes_requested");
    reviseContentTask(s.db,{workspaceId:s.f.workspaceId,taskId:task.id,userId:s.f.manager,note:"Shorten the opening; keep the source fact."});
    await runOneJob(s.db,"worker");
    expect(s.artifact().version).toBe(2);
    expect(s.db.select().from(artifacts).where(eq(artifacts.version,1)).get()?.status).toBe("superseded");
    expect(s.db.select().from(approvals).where(eq(approvals.id,old.id)).get()).toMatchObject({status:"expired",decisionNote:"Shorten the opening."});
    expect(s.approval().payload.artifactVersion).toBe(2);
    s.decide("approve");
  });
  it("blocks paused employees, missing skills, missing access and emergency stop without queued work", () => {
    const s=setup();
    s.db.update(employees).set({status:"paused"}).where(eq(employees.id,s.f.employeeId)).run();
    expect(()=>s.start()).toThrow("paused");
    s.db.update(employees).set({status:"active"}).where(eq(employees.id,s.f.employeeId)).run();
    s.db.update(skills).set({status:"draft"}).where(eq(skills.id,s.f.skillId)).run();
    expect(()=>s.start()).toThrow("approved current skill");
    s.db.update(skills).set({status:"approved"}).where(eq(skills.id,s.f.skillId)).run();
    s.db.delete(employeeKnowledge).where(eq(employeeKnowledge.knowledgeSourceId,"fact")).run();
    expect(()=>s.start()).toThrow("not granted");
    expect(s.db.select().from(jobs).all()).toHaveLength(0);
    const workspace=s.db.select().from(workspaces).get()!;
    s.db.update(workspaces).set({settings:{...workspace.settings,emergencyStop:true}}).run();
    expect(contentReadiness(s.db,s.f.workspaceId,s.f.employeeId).problems.join(" ")).toContain("Emergency stop");
  });
  it("rejects cross-workspace input and reviewer impersonation", async () => {
    const s=setup(); const foreign=buildFixture(s.db,{slug:"other"});
    expect(()=>startContentTask(s.db,{workspaceId:foreign.workspaceId,employeeId:s.f.employeeId,requestedByUserId:foreign.manager,input:s.brief})).toThrow("not found");
    expect(()=>startContentTask(s.db,{workspaceId:s.f.workspaceId,employeeId:s.f.employeeId,requestedByUserId:foreign.manager,input:s.brief})).toThrow("permission");
    s.start(); await runOneJob(s.db,"worker");
    expect(()=>decideApproval(s.db,{workspaceId:s.f.workspaceId,approvalId:s.approval().id,userId:s.f.member,role:"manager",decision:"approve"})).toThrow("assigned reviewer");
    expect(()=>decideApproval(s.db,{workspaceId:foreign.workspaceId,approvalId:s.approval().id,userId:foreign.manager,role:"manager",decision:"approve"})).toThrow("not found");
  });
  it("refuses stale source evidence or changed artifacts at acceptance", async () => {
    const s=setup(); s.start(); await runOneJob(s.db,"worker");
    s.db.update(knowledgeSources).set({content:"Changed source text"}).where(eq(knowledgeSources.id,"fact")).run();
    expect(()=>s.decide("approve")).toThrow("evidence changed");
    const artifact=s.artifact(); s.db.update(artifacts).set({content:{...artifact.content,generatedBy:"tampered"}}).where(eq(artifacts.id,artifact.id)).run();
    expect(()=>s.decide("approve")).toThrow("current draft version");
  });
});

describe("live content execution and office activity", () => {
  it("revokes a paused run's lease before a revision and ignores its late response", async () => {
    const s = setup(); const result = model(s); let release!: (value: typeof result) => void;
    const provider = vi.spyOn(anthropicAdapter, "complete").mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(result);
    const task = s.start(); const oldRun = runOneJob(s.db, "old");
    const oldJob = s.db.select().from(jobs).get()!;
    setTaskStatus(s.db, { workspaceId: s.f.workspaceId, taskId: task.id, status: "paused", userId: s.f.manager });
    reviseContentTask(s.db, { workspaceId: s.f.workspaceId, taskId: task.id, userId: s.f.manager, note: "Use a shorter introduction." });
    expect(s.db.select().from(jobs).where(eq(jobs.id, oldJob.id)).get()?.status).toBe("cancelled");
    expect((await runOneJob(s.db, "new"))?.outcome).toBe("succeeded");
    release(result); await oldRun;
    expect(provider).toHaveBeenCalledTimes(2);
    expect(s.db.select().from(artifacts).all()).toHaveLength(1);
    expect(s.db.select().from(usageEvents).all()).toHaveLength(1);
    expect(s.db.select().from(tasks).where(eq(tasks.id, task.id)).get()?.status).toBe("needs_approval");
    expect(s.db.select().from(workflowRuns).where(eq(workflowRuns.jobId, oldJob.id)).get()!.reservedCostCents).toBeGreaterThan(0);
  });
  it("does not interrupt the owning run if a duplicate job is queued", async () => {
    const s = setup(); const result = model(s); let release!: (value: typeof result) => void;
    vi.spyOn(anthropicAdapter, "complete").mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const task = s.start(); const running = runOneJob(s.db, "owner");
    enqueueJob(s.db, { workspaceId: s.f.workspaceId, kind: "task.run", payload: { taskId: task.id }, maxAttempts: 1 });
    expect((await runOneJob(s.db, "duplicate"))?.outcome).toBe("failed");
    expect(s.activity()).toMatchObject({ kind: "working", live: true });
    release(result); await running;
    expect(s.activity().kind).toBe("review");
  });
  it("shows the live drafting stage and stops productive motion when its heartbeat becomes stale", async () => {
    const s=setup(); const result=model(s); let release!:(value:typeof result)=>void;
    vi.spyOn(anthropicAdapter,"complete").mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
    s.start(); const running=runOneJob(s.db,"worker");
    expect(s.activity()).toMatchObject({kind:"working",stage:"drafting",live:true});
    expect(activityMotion(s.activity())).toBe("typing");
    s.db.update(workflowRuns).set({heartbeatAt:"2000-01-01T00:00:00Z"}).run();
    expect(s.activity().kind).toBe("stalled"); expect(activityMotion(s.activity())).toBe("none");
    release(result); await running;
    expect(s.activity().kind).toBe("review");
  });
  it("revalidates source/authority after a model await and never saves a stale draft", async () => {
    const s=setup(); const result=model(s); let release!:(value:typeof result)=>void;
    vi.spyOn(anthropicAdapter,"complete").mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
    s.start(); const running=runOneJob(s.db,"worker");
    s.db.update(knowledgeSources).set({reviewStatus:"stale"}).where(eq(knowledgeSources.id,"fact")).run();
    release(result); await running;
    expect(s.db.select().from(artifacts).all()).toHaveLength(0);
    expect(s.activity().kind).toBe("blocked");
  });
  it("aborts a timeout, retains uncertain cost reservation and ignores a late provider result", async () => {
    const s=setup(); const result=model(s); let release!:(value:typeof result)=>void; let signal:AbortSignal|undefined;
    vi.spyOn(anthropicAdapter,"complete").mockImplementation(req=>{signal=req.signal;return new Promise(resolve=>{release=resolve;});});
    s.start(); const running=runOneJob(s.db,"worker",undefined,{timeoutMs:15});
    expect((await running)?.outcome).toBe("failed"); expect(signal?.aborted).toBe(true);
    expect(s.db.select().from(workflowRuns).get()!.reservedCostCents).toBeGreaterThan(0);
    release(result); await new Promise(resolve=>setTimeout(resolve,5));
    expect(s.db.select().from(artifacts).all()).toHaveLength(0);
    expect(s.db.select().from(usageEvents).all()).toHaveLength(0);
    expect(s.db.select().from(jobs).get()?.status).toBe("failed");
  });
  it("fences completion and failure to a job attempt", async () => {
    const s=setup(); const result=model(s); let release!:(value:typeof result)=>void;
    vi.spyOn(anthropicAdapter,"complete").mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
    s.start(); const running=runOneJob(s.db,"old"); const old=s.db.select().from(jobs).get()!;
    s.db.update(jobs).set({attempts:old.attempts+1,lockedBy:"new"}).where(eq(jobs.id,old.id)).run();
    completeJob(s.db,old.id,old); expect(failJob(s.db,old,"old failure",true)).toBe("superseded");
    release(result); await running;
    expect(s.db.select().from(jobs).get()).toMatchObject({status:"running",lockedBy:"new"});
    expect(s.db.select().from(artifacts).all()).toHaveLength(0);
  });
  it("fails closed without pricing or enough per-task budget, before any live call", async () => {
    const s=setup(); model(s); vi.stubEnv("PROVIDER_PRICING_JSON", "");
    const call=vi.spyOn(anthropicAdapter,"complete"); s.start(); await runOneJob(s.db,"worker");
    expect(call).not.toHaveBeenCalled();
    expect(s.db.select().from(tasks).get()?.blockedReason).toContain("pricing");
    const t=setup(); model(t);
    const e=t.db.select().from(employees).get()!;t.db.update(employees).set({modelConfig:{...e.modelConfig,perTaskBudgetCents:0}}).run();
    t.start(); await runOneJob(t.db,"worker"); expect(call).not.toHaveBeenCalled();
    expect(t.db.select().from(tasks).get()?.blockedReason).toContain("task budget");
  });
  it("marks unsupported claim quotes and requires a revision before accepting", async () => {
    const s=setup(); const result=model(s); const output=JSON.parse(result.text);output.claims[0].quote="Invented evidence";
    vi.spyOn(anthropicAdapter,"complete").mockResolvedValue({...result,text:JSON.stringify(output)});
    s.start(); await runOneJob(s.db,"worker");
    expect((s.artifact().content as unknown as ContentDraft).checks[0].supported).toBe(false);
    expect(()=>s.decide("approve")).toThrow("unsupported claim");
  });
});
