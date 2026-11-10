/**
 * IdeaHub AI Team — relational schema (SQLite via Drizzle ORM).
 *
 * Design rules:
 *  - Every business record carries `workspaceId` so client workspaces can be isolated later.
 *  - Secrets are NEVER stored here. Provider/connector credentials live in environment
 *    variables (or a secret store in production); the DB only records *presence/status*.
 *  - Employee identity, skills, knowledge, memory, permissions and model configuration are
 *    separate records on purpose: personality must never grant permissions, and a model
 *    swap must never erase the employee's business context.
 *  - Timestamps are ISO-8601 strings (UTC) for portability between SQLite and Postgres.
 */
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey, blob } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ───────────────────────────── Enums (as TS unions) ─────────────────────────────
export const WORKSPACE_ROLES = ["owner", "admin", "manager", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const EMPLOYEE_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const SENIORITY_LEVELS = ["trainee", "associate", "specialist", "lead"] as const;
export type Seniority = (typeof SENIORITY_LEVELS)[number];

export const TASK_STATUSES = ["queued", "working", "needs_approval", "blocked", "completed", "paused", "failed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "changes_requested", "expired", "executed", "execution_unknown", "execution_failed"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/**
 * Action types a human can be asked to approve. `review_draft` only accepts a draft as
 * reviewed — it NEVER authorizes sending/creating anything externally.
 */
export const ACTION_TYPES = ["review_draft", "create_external_tasks", "send_message", "access_service", "update_external_record"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const CONNECTOR_MODES = ["live", "demo", "disconnected", "planned"] as const;
export type ConnectorMode = (typeof CONNECTOR_MODES)[number];

export const PROVIDERS = ["anthropic", "openai", "demo"] as const;
export type ProviderKey = (typeof PROVIDERS)[number];

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const REVIEW_STATUSES = ["pending", "approved", "rejected", "stale"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// ───────────────────────────── Shared JSON shapes ─────────────────────────────
export type Personality = {
  tone: "warm" | "neutral" | "direct";
  verbosity: "concise" | "balanced" | "detailed";
  reportingFormat: "bullets" | "narrative" | "table";
  questionStyle: "ask_before_acting" | "batch_questions" | "assume_and_flag";
  summary: string; // short editable description shown on the profile
};

export type AuthorityPolicy = {
  /** Action types the employee may *propose*. Execution still requires a human approval. */
  allowedActionTypes: ActionType[];
  /** Hard "never" list, enforced server-side regardless of personality or prompt content. */
  forbiddenActions: string[];
  /** Whether every draft must be reviewed by a human before it can be referenced elsewhere. */
  requireReviewForDrafts: boolean;
  maxActionsPerTask: number;
};

export type ModelConfig = {
  openaiApi?: "chat_completions" | "responses";
  omitTemperature?: boolean;
  provider: ProviderKey;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  fallbackProvider: ProviderKey | null;
  fallbackModel: string | null;
  /** Per-task cap on estimated cost (cents). null = no cap. */
  perTaskBudgetCents: number | null;
  monthlyBudgetCents: number | null;
};

export type WorkspaceSettings = {
  productName: string;
  emergencyStop: boolean;
  emergencyStopReason?: string | null;
  branding: { accent: string; accentSecondary: string };
};

export type DepartmentLayout = { col: number; row: number }; // position in the isometric office grid

// ───────────────────────────── Tables ─────────────────────────────
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: text("settings", { mode: "json" }).$type<WorkspaceSettings>().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  title: text("title"),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
});

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("wm_ws_user").on(t.workspaceId, t.userId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // random token (hashed at rest)
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

// Global authentication records: users may belong to several workspaces.
export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(), // hashed email/address + operation, never raw identifiers
  attempts: integer("attempts").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const passwordResets = sqliteTable("password_resets", {
  issuedByUserId: text("issued_by_user_id").references(() => users.id, { onDelete: "cascade" }),
  id: text("id").primaryKey(), // SHA-256 of a high-entropy, one-time code
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const departments = sqliteTable(
  "departments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    purpose: text("purpose").notNull(),
    managerUserId: text("manager_user_id").references(() => users.id),
    color: text("color").notNull(), // token name e.g. "teal"
    layout: text("layout", { mode: "json" }).$type<DepartmentLayout>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("dept_ws_slug").on(t.workspaceId, t.slug)],
);

export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    departmentId: text("department_id").references(() => departments.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    roleTitle: text("role_title").notNull(),
    status: text("status").$type<EmployeeStatus>().notNull(),
    seniority: text("seniority").$type<Seniority>().notNull(),
    managerUserId: text("manager_user_id").references(() => users.id),
    avatarSeed: text("avatar_seed").notNull(), // procedural, clearly-AI placeholder portrait
    bio: text("bio").notNull(),
    personality: text("personality", { mode: "json" }).$type<Personality>().notNull(),
    authority: text("authority", { mode: "json" }).$type<AuthorityPolicy>().notNull(),
    modelConfig: text("model_config", { mode: "json" }).$type<ModelConfig>().notNull(),
    channels: text("channels", { mode: "json" }).$type<string[]>().notNull(), // e.g. ["web", "slack:#ops (demo)"]
    configVersion: integer("config_version").notNull().default(1),
    isPilot: integer("is_pilot", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("emp_ws_slug").on(t.workspaceId, t.slug), index("emp_ws_status").on(t.workspaceId, t.status)],
);

export const skills = sqliteTable(
  "skills",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    purpose: text("purpose").notNull(),
    workflowKey: text("workflow_key"), // links to an executable workflow in src/lib/workflows (null = instruction-only)
    ownerUserId: text("owner_user_id").references(() => users.id),
    status: text("status").$type<"draft" | "review" | "approved" | "retired">().notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("skills_ws_slug").on(t.workspaceId, t.slug)],
);

export const skillVersions = sqliteTable(
  "skill_versions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    instructions: text("instructions").notNull(),
    inputs: text("inputs").notNull(), // human-readable input contract
    outputs: text("outputs").notNull(),
    requiredTools: text("required_tools", { mode: "json" }).$type<string[]>().notNull(),
    requiredApprovals: text("required_approvals", { mode: "json" }).$type<ActionType[]>().notNull(),
    reviewStatus: text("review_status").$type<ReviewStatus>().notNull(),
    changeNote: text("change_note"),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("sv_skill_version").on(t.skillId, t.version)],
);

export const employeeSkills = sqliteTable(
  "employee_skills",
  {
    employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.skillId] })],
);

export const knowledgeSources = sqliteTable(
  "knowledge_sources",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    departmentId: text("department_id").references(() => departments.id),
    title: text("title").notNull(),
    type: text("type").$type<"document" | "note" | "url" | "meeting_record" | "procedure">().notNull(),
    content: text("content").notNull(), // plain text/markdown; treated as UNTRUSTED data by the runtime
    sourceRef: text("source_ref"), // where it came from (e.g. "Zoom recap email, 3 Nov 2026 (fictional)")
    ownerUserId: text("owner_user_id").references(() => users.id),
    reviewStatus: text("review_status").$type<ReviewStatus>().notNull(),
    version: integer("version").notNull().default(1),
    lastVerifiedAt: text("last_verified_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("ks_ws").on(t.workspaceId, t.reviewStatus)],
);

export const employeeKnowledge = sqliteTable(
  "employee_knowledge",
  {
    employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    knowledgeSourceId: text("knowledge_source_id").notNull().references(() => knowledgeSources.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.knowledgeSourceId] })],
);

/** Proposed memories wait in a review queue. Nothing becomes a durable "fact" silently. */
export const memoryProposals = sqliteTable(
  "memory_proposals",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    kind: text("kind").$type<"preference" | "fact" | "procedure" | "instruction">().notNull(),
    content: text("content").notNull(),
    sourceRef: text("source_ref").notNull(),
    status: text("status").$type<"proposed" | "approved" | "rejected">().notNull(),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
    reviewNote: text("review_note"),
    createdAt: text("created_at").notNull(),
    reviewedAt: text("reviewed_at"),
  },
  (t) => [index("mp_ws_status").on(t.workspaceId, t.status)],
);

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    proposalId: text("proposal_id").references(() => memoryProposals.id),
    kind: text("kind").$type<"preference" | "fact" | "procedure" | "instruction">().notNull(),
    content: text("content").notNull(),
    sourceRef: text("source_ref").notNull(),
    scope: text("scope").$type<"employee" | "department" | "workspace">().notNull(),
    approvedByUserId: text("approved_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("mem_emp").on(t.employeeId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").references(() => employees.id),
    departmentId: text("department_id").references(() => departments.id),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    status: text("status").$type<TaskStatus>().notNull(),
    priority: text("priority").$type<"low" | "normal" | "high">().notNull().default("normal"),
    ownerUserId: text("owner_user_id").references(() => users.id), // accountable human
    requestedByUserId: text("requested_by_user_id").references(() => users.id),
    workflowKey: text("workflow_key"), // "meeting_actions" | "weekly_summary" | null
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    progressPct: integer("progress_pct").notNull().default(0),
    nextAction: text("next_action"),
    blockedReason: text("blocked_reason"),
    dueAt: text("due_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => [index("tasks_ws_status").on(t.workspaceId, t.status), index("tasks_emp").on(t.employeeId)],
);

/** Durable checkpoints: a task can be rebuilt from its steps without the model conversation. */
export const taskSteps = sqliteTable(
  "task_steps",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    name: text("name").notNull(),
    status: text("status").$type<"pending" | "running" | "done" | "failed" | "skipped">().notNull(),
    checkpoint: text("checkpoint", { mode: "json" }).$type<Record<string, unknown>>(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (t) => [index("steps_task").on(t.taskId, t.seq)],
);

export const taskEvents = sqliteTable(
  "task_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    actorType: text("actor_type").$type<"user" | "employee" | "system">().notNull(),
    actorId: text("actor_id"),
    kind: text("kind").notNull(), // status_change | comment | artifact | approval | error | checkpoint
    message: text("message").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("te_task").on(t.taskId)],
);

export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").references(() => employees.id),
    kind: text("kind").$type<"draft_action_list" | "draft_status_summary" | "content_draft" | "note" | "message_draft">().notNull(),
    title: text("title").notNull(),
    content: text("content", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").$type<"draft" | "reviewed" | "rejected" | "superseded">().notNull(),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
    reviewNote: text("review_note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("art_task").on(t.taskId)],
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").references(() => employees.id),
    artifactId: text("artifact_id").references(() => artifacts.id),
    actionType: text("action_type").$type<ActionType>().notNull(),
    title: text("title").notNull(),
    destination: text("destination").notNull(), // e.g. "connector:slack:#ops", "connector:task_system", "internal"
    connectorKey: text("connector_key"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(), // the EXACT proposed action
    payloadHash: text("payload_hash").notNull(), // approval is bound to this hash; any change requires a new approval
    context: text("context", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<ApprovalStatus>().notNull(),
    requestedByEmployeeId: text("requested_by_employee_id"),
    decidedByUserId: text("decided_by_user_id").references(() => users.id),
    decisionNote: text("decision_note"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    expiresAt: text("expires_at"),
    requestedAt: text("requested_at").notNull(),
    decidedAt: text("decided_at"),
    executedAt: text("executed_at"),
  },
  (t) => [index("appr_ws_status").on(t.workspaceId, t.status)],
);

export const actionReceipts = sqliteTable(
  "action_receipts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    approvalId: text("approval_id").notNull().references(() => approvals.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    connectorKey: text("connector_key").notNull(),
    mode: text("mode").$type<ConnectorMode>().notNull(), // live vs demo execution is recorded on the receipt
    status: text("status").$type<"executing" | "succeeded" | "failed" | "unknown">().notNull(),
    externalRef: text("external_ref"),
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
);

export const connectors = sqliteTable(
  "connectors",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // slack | teams | email | zoom | ghl | task_system
    name: text("name").notNull(),
    mode: text("mode").$type<ConnectorMode>().notNull(),
    ownerUserId: text("owner_user_id").references(() => users.id),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    permissions: text("permissions", { mode: "json" }).$type<{ read: boolean; write: boolean; send: boolean }>().notNull(),
    statusDetail: text("status_detail").notNull(),
    credentialEnvVars: text("credential_env_vars", { mode: "json" }).$type<string[]>().notNull(), // names only
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("conn_ws_key").on(t.workspaceId, t.key)],
);

export const connectorGrants = sqliteTable(
  "connector_grants",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    connectorId: text("connector_id").notNull().references(() => connectors.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => users.id),
    status: text("status").$type<"active" | "revoked">().notNull(),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => [index("grant_emp").on(t.employeeId)],
);

export const communicationEvents = sqliteTable(
  "communication_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    connectorKey: text("connector_key"),
    employeeId: text("employee_id").references(() => employees.id),
    taskId: text("task_id"),
    approvalId: text("approval_id"),
    direction: text("direction").$type<"inbound" | "outbound" | "internal">().notNull(),
    channel: text("channel").notNull(), // e.g. "slack:#ops", "email", "internal-comment"
    counterpart: text("counterpart"),
    subject: text("subject"),
    body: text("body").notNull(),
    status: text("status").$type<"received" | "draft" | "pending_approval" | "sent" | "simulated" | "failed">().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("comm_ws").on(t.workspaceId, t.createdAt)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    authorType: text("author_type").$type<"user" | "employee" | "system">().notNull(),
    authorId: text("author_id"),
    content: text("content").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("msg_emp").on(t.employeeId, t.createdAt)],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    actorUserId: text("actor_user_id"),
    actorEmployeeId: text("actor_employee_id"),
    action: text("action").notNull(), // e.g. "employee.update", "approval.approve"
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("audit_ws_time").on(t.workspaceId, t.createdAt)],
);

export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    employeeId: text("employee_id"),
    taskId: text("task_id"),
    provider: text("provider").$type<ProviderKey>().notNull(),
    model: text("model").notNull(),
    meter: text("meter").$type<"model_tokens" | "connector_call" | "storage">().notNull(),
    inputUnits: integer("input_units").notNull().default(0),
    outputUnits: integer("output_units").notNull().default(0),
    unit: text("unit").notNull(), // "tokens" | "calls"
    estimatedCostCents: integer("estimated_cost_cents"), // null when no pricing table is configured
    costStatus: text("cost_status").$type<"estimated" | "unavailable" | "final">().notNull(),
    eventKey: text("event_key").notNull().unique(), // retries never double-record
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("usage_ws_time").on(t.workspaceId, t.createdAt)],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").$type<"workspace" | "employee">().notNull(),
    scopeId: text("scope_id").notNull(),
    period: text("period").$type<"monthly">().notNull(),
    limitCents: integer("limit_cents").notNull(),
    alertThresholdPct: integer("alert_threshold_pct").notNull().default(80),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("budget_scope").on(t.workspaceId, t.scopeType, t.scopeId)],
);

/** Durable job queue (DB-backed). Survives process restarts; see src/lib/jobs. */
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    kind: text("kind").notNull(), // "task.run" | "employee.reply" | "approval.execute"
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<JobStatus>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: text("run_after").notNull(),
    lockedAt: text("locked_at"),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("jobs_status_run").on(t.status, t.runAfter)],
);

export const workflowRuns = sqliteTable("workflow_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull(),
  status: text("status").$type<"running" | "review" | "failed">().notNull(),
  stage: text("stage").$type<"validating" | "reading" | "drafting" | "checking" | "review" | "failed">().notNull(),
  heartbeatAt: text("heartbeat_at").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  reservedCostCents: integer("reserved_cost_cents").notNull().default(0),
  error: text("error"),
}, (t) => [uniqueIndex("run_job_attempt").on(t.jobId, t.attempt), index("run_workspace_task").on(t.workspaceId, t.taskId)]);

// ───────────────────────────── Relations (for relational queries) ─────────────────────────────
export const employeesRelations = relations(employees, ({ one, many }) => ({
  department: one(departments, { fields: [employees.departmentId], references: [departments.id] }),
  manager: one(users, { fields: [employees.managerUserId], references: [users.id] }),
  skills: many(employeeSkills),
  knowledge: many(employeeKnowledge),
  tasks: many(tasks),
}));

export const employeeSkillsRelations = relations(employeeSkills, ({ one }) => ({
  employee: one(employees, { fields: [employeeSkills.employeeId], references: [employees.id] }),
  skill: one(skills, { fields: [employeeSkills.skillId], references: [skills.id] }),
}));

export const employeeKnowledgeRelations = relations(employeeKnowledge, ({ one }) => ({
  employee: one(employees, { fields: [employeeKnowledge.employeeId], references: [employees.id] }),
  source: one(knowledgeSources, { fields: [employeeKnowledge.knowledgeSourceId], references: [knowledgeSources.id] }),
}));

export const skillsRelations = relations(skills, ({ many, one }) => ({
  versions: many(skillVersions),
  owner: one(users, { fields: [skills.ownerUserId], references: [users.id] }),
}));

export const skillVersionsRelations = relations(skillVersions, ({ one }) => ({
  skill: one(skills, { fields: [skillVersions.skillId], references: [skills.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  employee: one(employees, { fields: [tasks.employeeId], references: [employees.id] }),
  department: one(departments, { fields: [tasks.departmentId], references: [departments.id] }),
  owner: one(users, { fields: [tasks.ownerUserId], references: [users.id] }),
  steps: many(taskSteps),
  events: many(taskEvents),
  artifacts: many(artifacts),
  approvals: many(approvals),
}));

export const taskStepsRelations = relations(taskSteps, ({ one }) => ({
  task: one(tasks, { fields: [taskSteps.taskId], references: [tasks.id] }),
}));
export const taskEventsRelations = relations(taskEvents, ({ one }) => ({
  task: one(tasks, { fields: [taskEvents.taskId], references: [tasks.id] }),
}));
export const artifactsRelations = relations(artifacts, ({ one }) => ({
  task: one(tasks, { fields: [artifacts.taskId], references: [tasks.id] }),
  employee: one(employees, { fields: [artifacts.employeeId], references: [employees.id] }),
}));
export const approvalsRelations = relations(approvals, ({ one, many }) => ({
  task: one(tasks, { fields: [approvals.taskId], references: [tasks.id] }),
  employee: one(employees, { fields: [approvals.employeeId], references: [employees.id] }),
  artifact: one(artifacts, { fields: [approvals.artifactId], references: [artifacts.id] }),
  decidedBy: one(users, { fields: [approvals.decidedByUserId], references: [users.id] }),
  receipts: many(actionReceipts),
}));
export const actionReceiptsRelations = relations(actionReceipts, ({ one }) => ({
  approval: one(approvals, { fields: [actionReceipts.approvalId], references: [approvals.id] }),
}));
export const departmentsRelations = relations(departments, ({ one, many }) => ({
  manager: one(users, { fields: [departments.managerUserId], references: [users.id] }),
  employees: many(employees),
  tasks: many(tasks),
}));
export const connectorsRelations = relations(connectors, ({ one, many }) => ({
  owner: one(users, { fields: [connectors.ownerUserId], references: [users.id] }),
  grants: many(connectorGrants),
}));
export const connectorGrantsRelations = relations(connectorGrants, ({ one }) => ({
  connector: one(connectors, { fields: [connectorGrants.connectorId], references: [connectors.id] }),
  employee: one(employees, { fields: [connectorGrants.employeeId], references: [employees.id] }),
}));
export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
}));
export const memoryProposalsRelations = relations(memoryProposals, ({ one }) => ({
  employee: one(employees, { fields: [memoryProposals.employeeId], references: [employees.id] }),
}));
export const memoriesRelations = relations(memories, ({ one }) => ({
  employee: one(employees, { fields: [memories.employeeId], references: [employees.id] }),
}));
export const messagesRelations = relations(messages, ({ one }) => ({
  employee: one(employees, { fields: [messages.employeeId], references: [employees.id] }),
}));
export const knowledgeSourcesRelations = relations(knowledgeSources, ({ one }) => ({
  owner: one(users, { fields: [knowledgeSources.ownerUserId], references: [users.id] }),
  department: one(departments, { fields: [knowledgeSources.departmentId], references: [departments.id] }),
}));

// ───────────────────────────── Row types ─────────────────────────────
export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type SkillVersion = typeof skillVersions.$inferSelect;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type MemoryProposal = typeof memoryProposals.$inferSelect;
export type Memory = typeof memories.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskStep = typeof taskSteps.$inferSelect;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type ActionReceipt = typeof actionReceipts.$inferSelect;
export type Connector = typeof connectors.$inferSelect;
export type ConnectorGrant = typeof connectorGrants.$inferSelect;
export type CommunicationEvent = typeof communicationEvents.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Job = typeof jobs.$inferSelect;

// HQ configuration: business role briefs, provider access evidence and MCP inventory.
export type OperatingBrief = { mission: string; responsibilities: string[]; deliverables: string[]; escalationRules: string[]; qualityBar: string };
export const employeeBriefs = sqliteTable("employee_briefs", {
  employeeId: text("employee_id").primaryKey().references(() => employees.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  body: text("body", { mode: "json" }).$type<OperatingBrief>().notNull(),
  version: integer("version").notNull(),
  status: text("status").$type<"draft" | "approved">().notNull(),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
  reviewedAt: text("reviewed_at"), updatedAt: text("updated_at").notNull(),
});
export const providerCatalogs = sqliteTable("provider_catalogs", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").$type<ProviderKey>().notNull(),
  models: text("models", { mode: "json" }).$type<{ id: string; label: string }[]>().notNull(),
  status: text("status").$type<"available" | "missing_credentials" | "failed">().notNull(),
  credentialFingerprint: text("credential_fingerprint").notNull(),
  detail: text("detail").notNull(), checkedAt: text("checked_at").notNull(),
}, (t) => [uniqueIndex("catalog_ws_provider").on(t.workspaceId, t.provider)]);
export type McpToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown>; readOnlyHint: boolean; hash: string };
export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(), endpoint: text("endpoint").notNull(), credentialEnvVar: text("credential_env_var"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false), configVersion: integer("config_version").notNull().default(1),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  tools: text("tools", { mode: "json" }).$type<McpToolDefinition[]>().notNull(),
  discoveryStatus: text("discovery_status").$type<"not_checked" | "discovered" | "failed">().notNull(),
  discoveryConfigVersion: integer("discovery_config_version"), discoveredAt: text("discovered_at"), detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const mcpToolGrants = sqliteTable("mcp_tool_grants", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  serverId: text("server_id").notNull().references(() => mcpServers.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  toolName: text("tool_name").notNull(), toolHash: text("tool_hash").notNull(), serverConfigVersion: integer("server_config_version").notNull(),
  policy: text("policy").$type<"reviewed_read" | "approval_required">().notNull(),
  status: text("status").$type<"active" | "revoked">().notNull(),
  grantedByUserId: text("granted_by_user_id").notNull().references(() => users.id), createdAt: text("created_at").notNull(), revokedAt: text("revoked_at"),
}, (t) => [uniqueIndex("mcp_grant_employee_tool").on(t.workspaceId, t.employeeId, t.serverId, t.toolName)]);

export const WORK_RECORD_KINDS = ["folder", "file", "event", "company", "contact", "deal", "content", "mail"] as const;
export type WorkRecordKind = typeof WORK_RECORD_KINDS[number];
export const workRecords = sqliteTable("work_records", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  kind: text("kind").$type<WorkRecordKind>().notNull(), title: text("title").notNull(),
  departmentId: text("department_id").references(() => departments.id), employeeId: text("employee_id").references(() => employees.id),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  parentId: text("parent_id"), data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  version: integer("version").notNull().default(1), archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [index("work_records_scope").on(t.workspaceId, t.kind, t.departmentId, t.employeeId)]);
export const driveBlobs = sqliteTable("drive_blobs", {
  recordId: text("record_id").primaryKey().references(() => workRecords.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  bytes: blob("bytes", { mode: "buffer" }).notNull(), sizeBytes: integer("size_bytes").notNull(),
});
export const appInstallations = sqliteTable("app_installations", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  appKey: text("app_key").notNull(), scopeKey: text("scope_key").notNull(),
  departmentId: text("department_id").references(() => departments.id), employeeId: text("employee_id").references(() => employees.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id), accountLabel: text("account_label").notNull(),
  requestedScopes: text("requested_scopes", { mode: "json" }).$type<string[]>().notNull(),
  mcpServerId: text("mcp_server_id").references(() => mcpServers.id),
  status: text("status").$type<"setup_required" | "disabled">().notNull(), version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("app_installation_scope").on(t.workspaceId, t.appKey, t.scopeKey)]);
export type WorkRecord = typeof workRecords.$inferSelect;
