import { ProviderError, type CompletionRequest, type CompletionResult, type ProviderAdapter } from "./types";

/**
 * OpenAI adapter — Chat Completions over fetch.
 * Requires OPENAI_API_KEY from an OpenAI developer account. A consumer ChatGPT subscription
 * does NOT authorize API usage; session tokens are never accepted.
 */
export const openaiAdapter: ProviderAdapter = {
  key: "openai",
  displayName: "OpenAI",
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),
  defaultModel: () => process.env.OPENAI_DEFAULT_MODEL || "gpt-4.1-mini",
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ProviderError("OpenAI is not configured (OPENAI_API_KEY missing).", "openai", false);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: req.model,
          max_completion_tokens: req.maxOutputTokens,
          temperature: req.temperature,
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
          messages: [{ role: "system", content: req.system }, ...req.messages],
        }),
        signal: req.signal ? AbortSignal.any([controller.signal, req.signal]) : controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(`OpenAI API error ${res.status}: ${body.slice(0, 300)}`, "openai", retryable, res.status);
      }
      const data = (await res.json()) as {
        choices: { message: { content: string | null }; finish_reason: string | null }[];
        usage: { prompt_tokens: number; completion_tokens: number };
        model: string;
      };
      return {
        text: data.choices[0]?.message.content ?? "",
        usage: { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens },
        provider: "openai",
        model: data.model ?? req.model,
        stopReason: data.choices[0]?.finish_reason ?? null,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const aborted = (err as Error).name === "AbortError";
      throw new ProviderError(aborted ? "OpenAI request timed out." : `OpenAI request failed: ${(err as Error).message}`, "openai", true);
    } finally {
      clearTimeout(timer);
    }
  },
};
