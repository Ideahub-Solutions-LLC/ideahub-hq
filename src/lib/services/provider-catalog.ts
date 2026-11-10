import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { providerCatalogs, type ProviderKey } from "@/db/schema";
import { hashPayload, newId, nowIso, sha256 } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { requireActor } from "./hq-profile";

export const CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export function providerCredentialFingerprint(provider: ProviderKey) {
  const credential = provider === "openai" ? process.env.OPENAI_API_KEY : provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : "offline";
  return credential?.trim() ? sha256(credential.trim()) : "missing";
}
export function getProviderCatalog(db: Db, workspaceId: string, provider: ProviderKey) {
  return db.select().from(providerCatalogs).where(and(eq(providerCatalogs.workspaceId, workspaceId), eq(providerCatalogs.provider, provider))).get() ?? null;
}
export function modelAccess(db: Db, workspaceId: string, provider: ProviderKey, model: string) {
  if (provider === "demo") return { verified: false, detail: "Offline Demo; no live model access.", checkedAt: null };
  if (providerCredentialFingerprint(provider) === "missing") return { verified: false, detail: "Server API credential missing.", checkedAt: null };
  const catalog = getProviderCatalog(db, workspaceId, provider);
  if (!catalog || catalog.credentialFingerprint !== providerCredentialFingerprint(provider) || Date.now() - Date.parse(catalog.checkedAt) > CATALOG_MAX_AGE_MS) return { verified: false, detail: "Refresh model access for the current server credential.", checkedAt: catalog?.checkedAt ?? null };
  const verified = catalog.status === "available" && catalog.models.some(m => m.id === model);
  return { verified, detail: verified ? "Model listed by provider; generation compatibility and quality still need qualification." : catalog.status === "available" ? "Model ID not listed. Choose an exact ID from the refreshed catalog; aliases need separate qualification." : catalog.detail, checkedAt: catalog.checkedAt };
}
const Item = z.object({ id: z.string().min(1).max(120), display_name: z.string().max(200).optional() });
const Page = z.object({ data: z.array(Item).max(1000), has_more: z.boolean().optional(), last_id: z.string().optional() });
export async function refreshProviderCatalog(db: Db, input: { workspaceId: string; userId: string; provider: ProviderKey }) {
  requireActor(db, input.workspaceId, input.userId, "admin.providers");
  if (input.provider !== "openai" && input.provider !== "anthropic") throw new Error("Choose OpenAI or Anthropic for a live model catalog.");
  const fingerprint = providerCredentialFingerprint(input.provider);
  const key = input.provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  let models: { id: string; label: string }[] = [];
  let status: "available" | "missing_credentials" | "failed" = fingerprint === "missing" ? "missing_credentials" : "failed";
  let detail = "Server API credential missing. Set the named environment variable and restart.";
  try {
    if (fingerprint !== "missing") {
      let cursor: string | undefined;
      for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
        const url = new URL(input.provider === "openai" ? "https://api.openai.com/v1/models" : "https://api.anthropic.com/v1/models");
        if (input.provider === "anthropic") { url.searchParams.set("limit", "1000"); if (cursor) url.searchParams.set("after_id", cursor); }
        const response = await fetch(url, { headers: input.provider === "openai" ? { authorization: `Bearer ${key!.trim()}` } : { "x-api-key": key!.trim(), "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(10000), redirect: "error", cache: "no-store" });
        if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}. Check credentials, access and server connectivity.`);
        const raw = await response.text(); if (raw.length > 2_000_000) throw new Error("Model catalog exceeds the supported size.");
        const page = Page.parse(JSON.parse(raw));
        models.push(...page.data.map(m => ({ id: m.id, label: m.display_name ?? m.id })));
        if (!page.has_more) break;
        if (!page.last_id || page.last_id === cursor || pageIndex === 9) throw new Error("Catalog pagination did not finish. No partial result is verified.");
        cursor = page.last_id;
      }
      if (fingerprint !== providerCredentialFingerprint(input.provider)) throw new Error("Server credential changed during the check. Refresh again.");
      models = [...new Map(models.map(m => [m.id, m])).values()].sort((a, b) => a.id.localeCompare(b.id));
      status = "available"; detail = `${models.length} model IDs listed. This checks access only; it does not test generation or send employee data.`;
    }
  } catch (error) {
    models = []; status = "failed";
    detail = error instanceof Error && /^(Provider returned HTTP|Model catalog|Catalog pagination|Server credential)/.test(error.message) ? error.message : "Provider access check failed. Check network, credentials and the provider response; no raw response or credential is stored.";
  }
  const row = { id: newId("cat"), workspaceId: input.workspaceId, provider: input.provider, models, status, credentialFingerprint: fingerprint, detail, checkedAt: nowIso() };
  db.insert(providerCatalogs).values(row).onConflictDoUpdate({ target: [providerCatalogs.workspaceId, providerCatalogs.provider], set: { ...row, id: undefined } }).run();
  recordAudit(db, { workspaceId: input.workspaceId, actorUserId: input.userId, action: "provider.catalog_checked", entityType: "provider", entityId: input.provider, data: { status, modelCount: models.length, inventoryHash: hashPayload(models) } });
  return row;
}
