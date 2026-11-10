import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { appInstallations, connectors, workspaceMembers } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { newId, nowIso } from "@/lib/ids";
import { effectiveConnectorMode } from "@/lib/connectors";
import { catalogApp } from "@/lib/workspace/app-catalog";
import { requireActor } from "./hq-profile";
import { getMcpServer, mcpInventoryCurrent } from "./mcp-registry";
import { validateWorkScope, type WorkScope } from "./workspace-records";

export function listApps(db: Db, workspaceId: string) {
  return db
    .select()
    .from(appInstallations)
    .where(eq(appInstallations.workspaceId, workspaceId))
    .orderBy(desc(appInstallations.updatedAt))
    .all();
}
export function saveAppSetup(
  db: Db,
  input: {
    workspaceId: string;
    userId: string;
    appKey: string;
    accountLabel: string;
    ownerUserId: string;
    requestedScopes: string[];
    mcpServerId: string | null;
  } & WorkScope,
) {
  requireActor(db, input.workspaceId, input.userId, "connector.manage");
  const app = catalogApp(input.appKey);
  const accountLabel = z
    .string()
    .trim()
    .min(2)
    .max(120)
    .parse(input.accountLabel);
  const scopes = [...new Set(input.requestedScopes)];
  if (!scopes.length || scopes.some((s) => !app.scopes.includes(s)))
    throw new Error("Select valid requested permissions for this app.");
  validateWorkScope(db, input.workspaceId, input);
  if (
    !db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.userId, input.ownerUserId),
        ),
      )
      .get()
  )
    throw new Error("Choose a connection owner from this workspace.");
  if (input.mcpServerId) getMcpServer(db, input.workspaceId, input.mcpServerId);
  const scopeKey = input.employeeId
    ? `employee:${input.employeeId}`
    : input.departmentId
      ? `team:${input.departmentId}`
      : "organization";
  return db.transaction(
    (tx) => {
      const old = tx
        .select()
        .from(appInstallations)
        .where(
          and(
            eq(appInstallations.workspaceId, input.workspaceId),
            eq(appInstallations.appKey, input.appKey),
            eq(appInstallations.scopeKey, scopeKey),
          ),
        )
        .get();
      const stamp = nowIso();
      const row = {
        id: old?.id ?? newId("app"),
        workspaceId: input.workspaceId,
        appKey: app.key,
        scopeKey,
        departmentId: input.departmentId,
        employeeId: input.employeeId,
        accountLabel,
        ownerUserId: input.ownerUserId,
        requestedScopes: scopes,
        mcpServerId: input.mcpServerId,
        status: "setup_required" as const,
        version: (old?.version ?? 0) + 1,
        createdAt: old?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      if (old)
        tx.update(appInstallations)
          .set(row)
          .where(eq(appInstallations.id, old.id))
          .run();
      else tx.insert(appInstallations).values(row).run();
      recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        action: "app.setup_saved",
        entityType: "app_installation",
        entityId: row.id,
        data: {
          appKey: row.appKey,
          scopeKey,
          requestedScopes: scopes,
          version: row.version,
        },
      });
      return row;
    },
    { behavior: "immediate" },
  );
}
export function setAppDisabled(
  db: Db,
  input: {
    workspaceId: string;
    userId: string;
    id: string;
    version: number;
    disabled: boolean;
  },
) {
  requireActor(db, input.workspaceId, input.userId, "connector.manage");
  const row = db
    .select()
    .from(appInstallations)
    .where(
      and(
        eq(appInstallations.id, input.id),
        eq(appInstallations.workspaceId, input.workspaceId),
      ),
    )
    .get();
  if (!row || row.version !== input.version)
    throw new Error("App setup changed or was not found. Reload first.");
  const changed = db
    .update(appInstallations)
    .set({
      status: input.disabled ? "disabled" : "setup_required",
      version: row.version + 1,
      updatedAt: nowIso(),
    })
    .where(
      and(
        eq(appInstallations.id, row.id),
        eq(appInstallations.version, row.version),
      ),
    )
    .run();
  if (changed.changes !== 1)
    throw new Error("App setup changed. Reload first.");
  recordAudit(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    action: input.disabled ? "app.disabled" : "app.setup_enabled",
    entityType: "app_installation",
    entityId: row.id,
  });
}
export function appSetupStatus(
  db: Db,
  row: typeof appInstallations.$inferSelect,
) {
  if (row.status === "disabled")
    return {
      label: "Setup disabled",
      detail:
        "This saved setup is disabled. Existing native connector grants are managed separately in Integrations.",
      tone: "neutral" as const,
    };
  if (row.mcpServerId) {
    const server = getMcpServer(db, row.workspaceId, row.mcpServerId);
    return {
      label: mcpInventoryCurrent(server)
        ? "Metadata available"
        : "MCP discovery needed",
      detail:
        "An MCP endpoint is linked. Review its discovery and tool assignments; employee tool invocation is not enabled.",
      tone: "amber" as const,
    };
  }
  const app = catalogApp(row.appKey);
  const native = app.connectorKey
    ? db
        .select()
        .from(connectors)
        .where(
          and(
            eq(connectors.workspaceId, row.workspaceId),
            eq(connectors.key, app.connectorKey),
          ),
        )
        .get()
    : null;
  if (native) {
    const mode = effectiveConnectorMode(native.key, native.mode);
    return {
      label: `Native adapter: ${mode.mode}`,
      detail: `${mode.detail} Saved app setup does not change connector permissions.`,
      tone: "amber" as const,
    };
  }
  return {
    label: "Connection needed",
    detail:
      "Setup saved. Account authorization and data synchronization are not available for this app yet.",
    tone: "amber" as const,
  };
}
