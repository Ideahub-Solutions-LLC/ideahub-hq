import { ProviderError, type CompletionRequest, type CompletionResult, type ProviderAdapter } from "./types";

/**
 * Claude adapter — direct Messages API over fetch (no SDK dependency).
 * Requires ANTHROPIC_API_KEY (an API key from an Anthropic developer account).
 * A consumer Claude subscription does NOT authorize API usage and is never accepted here.
 */
export const anthropicAdapter: ProviderAdapter = {
  key: "anthropic",
  displayName: "Anthropic Claude",
  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  defaultModel: () => process.env.ANTHROPIC_DEFAULT_MODEL || "claude-sonnet-4-5",
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new ProviderError("Anthropic is not configured (ANTHROPIC_API_KEY missing).", "anthropic", false);

    const system = req.json ? `${req.system}\n\nRespond with a single JSON object and nothing else.` : req.system;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxOutputTokens,
          temperature: req.temperature,
          system,
          messages: req.messages,
        }),
        signal: req.signal ? AbortSignal.any([controller.signal, req.signal]) : controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500 || res.status === 529;
        throw new ProviderError(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`, "anthropic", retryable, res.status);
      }
      const data = (await res.json()) as {
        content: { type: string; text?: string }[];
        usage: { input_tokens: number; output_tokens: number };
        stop_reason: string | null;
        model: string;
      };
      const text = data.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
      return {
        text,
        usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
        provider: "anthropic",
        model: data.model ?? req.model,
        stopReason: data.stop_reason,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const aborted = (err as Error).name === "AbortError";
      throw new ProviderError(aborted ? "Anthropic request timed out." : `Anthropic request failed: ${(err as Error).message}`, "anthropic", true);
    } finally {
      clearTimeout(timer);
    }
  },
};
