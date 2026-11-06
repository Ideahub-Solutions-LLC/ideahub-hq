import { createDb, runMigrations, type Db } from "@/db/client";
import { connectorGrants, connectors, departments, employeeKnowledge, employeeSkills, employees, knowledgeSources, skillVersions, skills, users, workspaceMembers, workspaces, type ActionType, type WorkspaceRole } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { hashPassword } from "@/lib/auth/password";

export const MEETING = `Weekly sync\nAttendees: Sam Okafor, Riley Chen\n\nDecisions\n- Decision: launch moves to 12 November.\n\nAction items\n- Sam will send the packet by Friday.\n- Riley to draft two posts by 2026-11-14.\n- Prepare the reporting template.\n- Dana to collect brand assets next week.\n\nOpen questions\n- Who owns the template after November?\n`;

export type Fixture = ReturnType<typeof buildFixture>;

/** Minimal, fast fixture: one workspace with three humans, one active employee, demo connectors and an approved meeting record. */
export function buildFixture(db: Db, opts: { slug?: string; allowed?: ActionType[] } = {}) {
  const now = nowIso();
  const slug = opts.slug ?? "ws";
  const workspaceId = newId("ws");
  db.insert(workspaces).values({ id: workspaceId, name: `Workspace ${slug}`, slug, settings: { productName: "Test HQ", emergencyStop: false, emergencyStopReason: null, branding: { accent: "#000", accentSecondary: "#111" } }, createdAt: now, updatedAt: now }).run();
  const hash = hashPassword("pw");
  const mk = (name: string, role: WorkspaceRole) => {
    const id = newId("usr");
    db.insert(users).values({ id, email: `${name.toLowerCase().replace(/\s/g, ".")}@${slug}.example.com`, name, title: null, passwordHash: hash, createdAt: now }).run();
    db.insert(workspaceMembers).values({ id: newId("wm"), workspaceId, userId: id, role, createdAt: now }).run();
    return id;
  };
  const owner = mk("Avery Cruz", "owner");
  const manager = mk("Sam Okafor", "manager");
  const member = mk("Riley Chen", "member");
  const deptId = newId("dep");
  db.insert(departments).values({ id: deptId, workspaceId, name: "Operations", slug: "operations", purpose: "Ops", managerUserId: manager, color: "teal", layout: { col: 0, row: 0 }, createdAt: now }).run();
  const employeeId = newId("emp");
  db.insert(employees)
    .values({
      id: employeeId,
      workspaceId,
      departmentId: deptId,
      name: "Harper",
      slug: "harper",
      roleTitle: "AI Operations Coordinator",
      status: "active",
      seniority: "trainee",
      managerUserId: manager,
      avatarSeed: "harper",
      bio: "Pilot",
      personality: { tone: "warm", verbosity: "concise", reportingFormat: "bullets", questionStyle: "ask_before_acting", summary: "Calm." },
      authority: { allowedActionTypes: opts.allowed ?? ["review_draft", "create_external_tasks", "send_message"], forbiddenActions: [], requireReviewForDrafts: true, maxActionsPerTask: 5 },
      modelConfig: { provider: "anthropic", model: "claude-sonnet-4-5", temperature: 0.2, maxOutputTokens: 1000, fallbackProvider: null, fallbackModel: null, perTaskBudgetCents: 100, monthlyBudgetCents: 1000 },
      channels: ["web"],
      configVersion: 1,
      isPilot: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const conn = (key: string, name: string, mode: "demo" | "planned" | "disconnected") => {
    const id = newId("con");
    db.insert(connectors).values({ id, workspaceId, key, name, mode, ownerUserId: owner, scopes: [], permissions: { read: true, write: true, send: true }, statusDetail: "", credentialEnvVars: [], lastCheckedAt: null, createdAt: now, updatedAt: now }).run();
    return id;
  };
  const slackId = conn("slack", "Slack", "demo");
  const taskSystemId = conn("task_system", "Task system", "demo");
  const teamsId = conn("teams", "Teams", "planned");
  const emailId = conn("email", "Email", "disconnected");
  const grantSlack = newId("grt");
  db.insert(connectorGrants).values({ id: grantSlack, workspaceId, connectorId: slackId, employeeId, scopes: ["post"], grantedByUserId: owner, status: "active", createdAt: now, revokedAt: null }).run();
  db.insert(connectorGrants).values({ id: newId("grt"), workspaceId, connectorId: taskSystemId, employeeId, scopes: ["create"], grantedByUserId: owner, status: "active", createdAt: now, revokedAt: null }).run();
  const sourceId = newId("ks");
  db.insert(knowledgeSources).values({ id: sourceId, workspaceId, departmentId: deptId, title: "Weekly sync record", type: "meeting_record", content: MEETING, sourceRef: "test", ownerUserId: manager, reviewStatus: "approved", version: 1, lastVerifiedAt: now, createdAt: now, updatedAt: now }).run();
  db.insert(employeeKnowledge).values({ employeeId, knowledgeSourceId: sourceId, workspaceId, createdAt: now }).run();
  const pendingSourceId = newId("ks");
  db.insert(knowledgeSources).values({ id: pendingSourceId, workspaceId, departmentId: deptId, title: "Pending record", type: "meeting_record", content: "Action items\n- Sam will do a thing.", sourceRef: "test", ownerUserId: manager, reviewStatus: "pending", version: 1, lastVerifiedAt: null, createdAt: now, updatedAt: now }).run();
  db.insert(employeeKnowledge).values({ employeeId, knowledgeSourceId: pendingSourceId, workspaceId, createdAt: now }).run();
  const skillId = newId("skl");
  db.insert(skills).values({ id: skillId, workspaceId, name: "Meeting follow-through", slug: "meeting-follow-through", purpose: "x", workflowKey: "meeting_actions", ownerUserId: manager, status: "approved", currentVersion: 1, createdAt: now, updatedAt: now }).run();
  db.insert(skillVersions).values({ id: newId("skv"), workspaceId, skillId, version: 1, instructions: "Do it carefully.", inputs: "", outputs: "", requiredTools: [], requiredApprovals: ["review_draft"], reviewStatus: "approved", changeNote: null, createdByUserId: manager, createdAt: now }).run();
  db.insert(employeeSkills).values({ employeeId, skillId, workspaceId, createdAt: now }).run();
  return { workspaceId, owner, manager, member, deptId, employeeId, slackId, taskSystemId, teamsId, emailId, grantSlack, sourceId, pendingSourceId, skillId };
}

export function freshDb(): Db {
  const db = createDb(":memory:");
  runMigrations(db);
  return db;
}
