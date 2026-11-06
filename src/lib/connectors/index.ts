import type { ActionType, ConnectorMode } from "@/db/schema";
import { sha256 } from "@/lib/ids";

/**
 * Connector framework.
 *
 * A connector gives an employee access to an external system. Access is granted per employee
 * (connector_grants) and every outbound action goes through an approval + receipt. In this
 * version EVERY adapter is either Demo (simulated, nothing leaves the platform) or Planned.
 * Live adapters are intentionally not implemented until authorized credentials and a
 * sandbox are configured — see docs/INTEGRATIONS.md for the exact steps.
 */
export type ConnectorKey = "slack" | "teams" | "email" | "zoom" | "ghl" | "task_system";

export type ExecuteInput = {
  workspaceId: string;
  approvalId: string;
  idempotencyKey: string;
  actionType: ActionType;
  destination: string;
  payload: Record<string, unknown>;
};

export type ExecuteResult = {
  externalRef: string;
  result: Record<string, unknown>;
  simulated: boolean;
  /** Human-readable, honest summary e.g. "Simulated: no message was delivered." */
  summary: string;
};

export type ReconcileResult = "done" | "not_found" | "unknown";

export interface ConnectorAdapter {
  key: ConnectorKey;
  name: string;
  implementedModes: ConnectorMode[]; // which of demo/live have code behind them
  supportedActions: ActionType[];
  credentialEnvVars: string[]; // names only — read on the server, never stored in the DB
  execute(input: ExecuteInput, mode: ConnectorMode): Promise<ExecuteResult>;
  reconcile(idempotencyKey: string, mode: ConnectorMode): Promise<ReconcileResult>;
}

export class ConnectorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorUnavailableError";
  }
}

/** Demo "destination" memory — lets reconcile() behave like a real system that can be queried. */
const demoLedger = new Map<string, ExecuteResult>();

function demoRef(prefix: string, key: string) {
  return `${prefix}-${sha256(key).slice(0, 8).toUpperCase()}`;
}

function credentialsPresent(adapter: ConnectorAdapter) {
  return adapter.credentialEnvVars.length > 0 && adapter.credentialEnvVars.every((name) => Boolean(process.env[name]));
}

const slack: ConnectorAdapter = {
  key: "slack",
  name: "Slack",
  implementedModes: ["demo"],
  supportedActions: ["send_message"],
  credentialEnvVars: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
  async execute(input, mode) {
    if (mode !== "demo") throw new ConnectorUnavailableError("Slack live adapter is not implemented in this version.");
    const result: ExecuteResult = {
      externalRef: demoRef("DEMO-SLACK", input.idempotencyKey),
      result: { channel: input.destination, text: String(input.payload.text ?? ""), delivered: false },
      simulated: true,
      summary: `Simulated: the message was recorded for ${input.destination} but NOT delivered to Slack.`,
    };
    demoLedger.set(input.idempotencyKey, result);
    return result;
  },
  async reconcile(key) {
    return demoLedger.has(key) ? "done" : "not_found";
  },
};

const email: ConnectorAdapter = {
  key: "email",
  name: "Email",
  implementedModes: ["demo"],
  supportedActions: ["send_message"],
  credentialEnvVars: ["SMTP_URL"],
  async execute(input, mode) {
    if (mode !== "demo") throw new ConnectorUnavailableError("Email live adapter is not implemented in this version.");
    const result: ExecuteResult = {
      externalRef: demoRef("DEMO-MAIL", input.idempotencyKey),
      result: { to: input.payload.to ?? null, subject: input.payload.subject ?? null, delivered: false },
      simulated: true,
      summary: "Simulated: the email draft was recorded but NOT sent.",
    };
    demoLedger.set(input.idempotencyKey, result);
    return result;
  },
  async reconcile(key) {
    return demoLedger.has(key) ? "done" : "not_found";
  },
};

const taskSystem: ConnectorAdapter = {
  key: "task_system",
  name: "Task system (external)",
  implementedModes: ["demo"],
  supportedActions: ["create_external_tasks", "update_external_record"],
  credentialEnvVars: [],
  async execute(input, mode) {
    if (mode !== "demo") throw new ConnectorUnavailableError("No live task-system adapter is configured.");
    const items = Array.isArray(input.payload.items) ? (input.payload.items as Record<string, unknown>[]) : [];
    const created = items.map((item, i) => ({
      externalId: `${demoRef("DEMO-TASK", input.idempotencyKey)}-${i + 1}`,
      title: String(item.title ?? "Untitled"),
      owner: item.owner ?? null,
    }));
    const result: ExecuteResult = {
      externalRef: demoRef("DEMO-BATCH", input.idempotencyKey),
      result: { created, count: created.length, simulated: true },
      simulated: true,
      summary: `Simulated: ${created.length} task(s) were recorded with demo IDs. No external task system was changed.`,
    };
    demoLedger.set(input.idempotencyKey, result);
    return result;
  },
  async reconcile(key) {
    return demoLedger.has(key) ? "done" : "not_found";
  },
};

function planned(key: ConnectorKey, name: string, envVars: string[], actions: ActionType[]): ConnectorAdapter {
  return {
    key,
    name,
    implementedModes: [],
    supportedActions: actions,
    credentialEnvVars: envVars,
    async execute() {
      throw new ConnectorUnavailableError(`${name} connector is Planned — no adapter exists yet.`);
    },
    async reconcile() {
      return "unknown";
    },
  };
}

const ADAPTERS: Record<ConnectorKey, ConnectorAdapter> = {
  slack,
  email,
  task_system: taskSystem,
  teams: planned("teams", "Microsoft Teams", ["MS_TEAMS_APP_ID", "MS_TEAMS_APP_SECRET"], ["send_message"]),
  zoom: planned("zoom", "Zoom", ["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"], ["access_service"]),
  ghl: planned("ghl", "CQL / GoHighLevel", ["GHL_API_KEY", "GHL_LOCATION_ID"], ["update_external_record", "send_message"]),
};

export function getConnectorAdapter(key: string): ConnectorAdapter | null {
  return (ADAPTERS as Record<string, ConnectorAdapter>)[key] ?? null;
}

export function listConnectorAdapters() {
  return Object.values(ADAPTERS);
}

/**
 * The DB stores the *requested* mode (set by an admin). The effective mode is computed on the
 * server from what is actually implemented and configured, so the UI can never show "Live"
 * for something that is simulated.
 */
export function effectiveConnectorMode(key: string, requested: ConnectorMode): { mode: ConnectorMode; detail: string } {
  const adapter = getConnectorAdapter(key);
  if (!adapter) return { mode: "planned", detail: "No adapter registered for this connector key." };
  if (adapter.implementedModes.length === 0) return { mode: "planned", detail: `${adapter.name} is planned. Reserved env vars: ${adapter.credentialEnvVars.join(", ") || "none"}.` };
  if (requested === "live") {
    if (!adapter.implementedModes.includes("live")) {
      return { mode: "disconnected", detail: `Live mode requested, but the ${adapter.name} live adapter is not implemented in this version. Demo mode is available.` };
    }
    if (!credentialsPresent(adapter)) {
      return { mode: "disconnected", detail: `Live mode requested, but server credentials are missing (${adapter.credentialEnvVars.join(", ")}).` };
    }
    return { mode: "live", detail: "Live: server credentials detected." };
  }
  if (requested === "demo") return { mode: "demo", detail: `Demo: actions are simulated and recorded; nothing is delivered to ${adapter.name}.` };
  if (requested === "disconnected") return { mode: "disconnected", detail: `Disconnected: no ${adapter.name} credentials configured (${adapter.credentialEnvVars.join(", ") || "n/a"}).` };
  return { mode: "planned", detail: `${adapter.name} is planned.` };
}

/** Test helper. */
export function __resetDemoLedger() {
  demoLedger.clear();
}
