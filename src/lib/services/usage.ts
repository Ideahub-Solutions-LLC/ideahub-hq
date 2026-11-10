import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { budgets, usageEvents, type ProviderKey } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";

/**
 * Optional pricing table: USD per 1M tokens keyed by "provider:model".
 * We never invent provider prices — without a configured table, cost is recorded as "unavailable".
 */
export function loadPricingTable(): Record<string, { input: number; output: number }> {
  const raw = process.env.PROVIDER_PRICING_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, { input: number; output: number }>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function estimateCostCents(provider: ProviderKey, model: string, inputTokens: number, outputTokens: number, roundUp = false): number | null {
  if (provider === "demo") return 0;
  const table = loadPricingTable();
  const price = table[`${provider}:${model}`] ?? table[`${provider}:*`];
  if (!price) return null;
  const usd = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  return roundUp ? Math.ceil(usd * 100) : Math.round(usd * 100);
}

export type UsageInput = {
  workspaceId: string;
  employeeId?: string | null;
  taskId?: string | null;
  provider: ProviderKey;
  model: string;
  meter: "model_tokens" | "connector_call" | "storage";
  inputUnits: number;
  outputUnits: number;
  unit: "tokens" | "calls";
  /** Unique key per logical call so retries never double-record. */
  eventKey: string;
  roundCostUp?: boolean;
};

export function recordUsage(db: Db, input: UsageInput) {
  const cost = input.meter === "model_tokens" ? estimateCostCents(input.provider, input.model, input.inputUnits, input.outputUnits, input.roundCostUp) : 0;
  db.insert(usageEvents)
    .values({
      id: newId("use"),
      workspaceId: input.workspaceId,
      employeeId: input.employeeId ?? null,
      taskId: input.taskId ?? null,
      provider: input.provider,
      model: input.model,
      meter: input.meter,
      inputUnits: input.inputUnits,
      outputUnits: input.outputUnits,
      unit: input.unit,
      estimatedCostCents: cost,
      costStatus: cost === null ? "unavailable" : "estimated",
      eventKey: input.eventKey,
      createdAt: nowIso(),
    })
    .onConflictDoNothing({ target: usageEvents.eventKey })
    .run();
}

function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export function monthToDate(db: Db, workspaceId: string, employeeId?: string) {
  const where = employeeId
    ? and(eq(usageEvents.workspaceId, workspaceId), eq(usageEvents.employeeId, employeeId), gte(usageEvents.createdAt, monthStartIso()))
    : and(eq(usageEvents.workspaceId, workspaceId), gte(usageEvents.createdAt, monthStartIso()));
  const row = db
    .select({
      inputUnits: sql<number>`coalesce(sum(${usageEvents.inputUnits}), 0)`,
      outputUnits: sql<number>`coalesce(sum(${usageEvents.outputUnits}), 0)`,
      costCents: sql<number>`coalesce(sum(${usageEvents.estimatedCostCents}), 0)`,
      unavailable: sql<number>`coalesce(sum(case when ${usageEvents.costStatus} = 'unavailable' then 1 else 0 end), 0)`,
      events: sql<number>`count(*)`,
    })
    .from(usageEvents)
    .where(where)
    .get();
  return row ?? { inputUnits: 0, outputUnits: 0, costCents: 0, unavailable: 0, events: 0 };
}

/**
 * Budget check used before any model call. Enforced only when estimates exist;
 * when the pricing table is absent we cannot enforce a cost cap and we say so.
 */
export function checkBudgets(db: Db, workspaceId: string, employeeId: string, perTaskBudgetCents: number | null, taskSpentCents: number) {
  const problems: string[] = [];
  if (perTaskBudgetCents !== null && taskSpentCents >= perTaskBudgetCents) {
    problems.push(`Per-task budget reached (${fmtCents(taskSpentCents)} of ${fmtCents(perTaskBudgetCents)}).`);
  }
  const rows = db.select().from(budgets).where(eq(budgets.workspaceId, workspaceId)).all();
  for (const b of rows) {
    if (b.scopeType === "employee" && b.scopeId !== employeeId) continue;
    const mtd = monthToDate(db, workspaceId, b.scopeType === "employee" ? employeeId : undefined);
    if (mtd.costCents >= b.limitCents) {
      problems.push(`${b.scopeType === "employee" ? "Employee" : "Workspace"} monthly budget reached (${fmtCents(mtd.costCents)} of ${fmtCents(b.limitCents)}).`);
    }
  }
  return problems;
}

export function fmtCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "n/a";
  return `$${(cents / 100).toFixed(2)}`;
}
