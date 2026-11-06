import { auditEvents } from "@/db/schema";
import type { Db } from "@/db/client";
import { newId, nowIso } from "@/lib/ids";

export type AuditInput = {
  workspaceId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
  data?: Record<string, unknown>;
};

/** Append-only audit record. Never store secrets or raw credentials in `data`. */
export function recordAudit(db: Db, input: AuditInput) {
  db.insert(auditEvents)
    .values({
      id: newId("aud"),
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      actorEmployeeId: input.actorEmployeeId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      data: redact(input.data ?? {}),
      createdAt: nowIso(),
    })
    .run();
}

const SECRET_KEY_PATTERN = /(token|secret|password|api[_-]?key|authorization)/i;

/** Defensive redaction so an audit payload can never leak a credential. */
export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "[redacted]" : redact(v);
    }
    return out as T;
  }
  return value;
}
