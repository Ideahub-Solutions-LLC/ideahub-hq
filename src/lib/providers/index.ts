import type { ModelConfig, ProviderKey } from "@/db/schema";
import { anthropicAdapter } from "./anthropic";
import { openaiAdapter } from "./openai";
import { demoAdapter } from "./demo";
import type { ProviderAdapter } from "./types";

export * from "./types";

const ADAPTERS: Record<ProviderKey, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  demo: demoAdapter,
};

export function getAdapter(key: ProviderKey): ProviderAdapter {
  return ADAPTERS[key];
}

export function listProviders() {
  return (Object.keys(ADAPTERS) as ProviderKey[]).map((key) => ({
    key,
    displayName: ADAPTERS[key].displayName,
    configured: ADAPTERS[key].isConfigured(),
    defaultModel: ADAPTERS[key].defaultModel(),
    envVar: key === "anthropic" ? "ANTHROPIC_API_KEY" : key === "openai" ? "OPENAI_API_KEY" : null,
  }));
}

export type ResolvedProvider = {
  adapter: ProviderAdapter;
  model: string;
  /** Explains any degradation (e.g. fell back to Demo because no key is configured). */
  note: string | null;
  degraded: boolean;
};

/**
 * Picks the adapter for an employee's model configuration.
 * Order: configured primary → configured fallback (only if the employee config allows it) → Demo.
 * Falling back is always visible: `degraded` is true and `note` explains why.
 */
export function resolveProvider(config: ModelConfig): ResolvedProvider {
  const configured = (adapter: ProviderAdapter): ProviderAdapter => ({ ...adapter, complete: req => adapter.complete({ ...req, openaiApi: config.openaiApi, omitTemperature: config.omitTemperature }) });
  const primary = ADAPTERS[config.provider];
  if (primary.isConfigured()) {
    return { adapter: configured(primary), model: config.model || primary.defaultModel(), note: null, degraded: false };
  }
  if (config.fallbackProvider && config.fallbackProvider !== config.provider) {
    const fb = ADAPTERS[config.fallbackProvider];
    if (fb.isConfigured()) {
      return {
        adapter: configured(fb),
        model: config.fallbackModel || fb.defaultModel(),
        note: `${primary.displayName} is not configured; using approved fallback ${fb.displayName}. Output quality may differ between providers.`,
        degraded: true,
      };
    }
  }
  return {
    adapter: demoAdapter,
    model: demoAdapter.defaultModel(),
    note: `${primary.displayName} is not configured (no API key on the server). Running on the offline Demo provider.`,
    degraded: config.provider !== "demo",
  };
}
