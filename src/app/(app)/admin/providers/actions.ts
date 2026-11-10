"use server";
import { requirePermission } from "@/lib/auth/context";
import { describeError, flashRedirect } from "@/lib/actions-util";
import { refreshProviderCatalog } from "@/lib/services/provider-catalog";
export async function refreshProviderAction(provider: "openai" | "anthropic") {
  const ctx = await requirePermission("admin.providers");
  try { await refreshProviderCatalog(ctx.db, { workspaceId: ctx.workspace.id, userId: ctx.user.id, provider }); }
  catch (e) { flashRedirect("/admin/providers", { error: describeError(e) }); }
  flashRedirect("/admin/providers", { ok: "Model access check completed. See the result below; no employee content was sent." });
}
