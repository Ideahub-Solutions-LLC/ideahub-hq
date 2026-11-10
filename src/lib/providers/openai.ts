import { z } from "zod";
import { ProviderError, type CompletionRequest, type CompletionResult, type ProviderAdapter } from "./types";

const count = z.number().int().nonnegative();
const ChatResult = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullable() })), usage: z.object({ prompt_tokens: count, completion_tokens: count }), model: z.string() });
const ResponseResult = z.object({ status: z.string(), output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })), usage: z.object({ input_tokens: count, output_tokens: count }), model: z.string() });

/** Direct API transport. Per-employee mode is explicit; no automatic model upgrades. */
export const openaiAdapter: ProviderAdapter = {
  key: "openai", displayName: "OpenAI",
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
  defaultModel: () => process.env.OPENAI_DEFAULT_MODEL || "gpt-4.1-mini",
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey?.trim()) throw new ProviderError("OpenAI is not configured (OPENAI_API_KEY missing).", "openai", false);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 45000);
    const responses = req.openaiApi === "responses";
    const system = req.json ? `${req.system}\nReturn a single JSON object.` : req.system;
    const parameters = { model: req.model, ...(req.omitTemperature ? {} : { temperature: req.temperature }) };
    const body = responses ? {
      ...parameters, instructions: system, input: req.messages, max_output_tokens: req.maxOutputTokens, store: false,
      ...(req.json ? { text: { format: { type: "json_object" } } } : {}),
    } : {
      ...parameters, messages: [{ role: "system", content: system }, ...req.messages], max_completion_tokens: req.maxOutputTokens, store: false,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    };
    try {
      const res = await fetch(`https://api.openai.com/v1/${responses ? "responses" : "chat/completions"}`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body),
        signal: req.signal ? AbortSignal.any([controller.signal, req.signal]) : controller.signal, redirect: "error",
      });
      if (!res.ok) { await res.body?.cancel(); throw new ProviderError(`OpenAI API error ${res.status}. Check model access, API mode, supported parameters, quota and credentials.`, "openai", res.status === 429 || res.status >= 500, res.status); }
      const raw: unknown = await res.json();
      if (responses) {
        const data = ResponseResult.parse(raw);
        if (data.status !== "completed") throw new ProviderError("OpenAI response was incomplete. Check the output allowance and model configuration.", "openai", false);
        const text = data.output.filter(o => o.type === "message").flatMap(o => o.content ?? []).filter(c => c.type === "output_text").map(c => c.text ?? "").join("");
        if (!text.trim()) throw new ProviderError("OpenAI returned no text output. Check model capability and refusal handling.", "openai", false);
        return { text, usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }, provider: "openai", model: data.model, stopReason: data.status };
      }
      const data = ChatResult.parse(raw); const text = data.choices[0]?.message.content ?? "";
      if (!text.trim()) throw new ProviderError("OpenAI returned no text output. Check model capability and refusal handling.", "openai", false);
      return { text, usage: { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }, provider: "openai", model: data.model, stopReason: data.choices[0]?.finish_reason ?? null };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(controller.signal.aborted || req.signal?.aborted ? "OpenAI request cancelled or timed out." : "OpenAI request failed. Check connectivity and response format.", "openai", true);
    } finally { clearTimeout(timer); }
  },
};
