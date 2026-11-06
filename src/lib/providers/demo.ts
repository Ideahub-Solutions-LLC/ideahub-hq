import type { CompletionRequest, CompletionResult, ProviderAdapter } from "./types";

/**
 * Demo adapter — deterministic, offline, and clearly labeled. It never pretends to be a
 * real model: every usage event it records carries provider = "demo", and the UI shows a
 * "Demo provider" badge on anything it produced.
 *
 * Workflows (meeting actions / weekly summary) do not depend on it: they run on
 * deterministic, source-linked extractors. The demo adapter is only used for
 * conversational replies when no API key is configured.
 */
export const demoAdapter: ProviderAdapter = {
  key: "demo",
  displayName: "Demo provider (offline, deterministic)",
  isConfigured: () => true,
  defaultModel: () => "demo-deterministic-v1",
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const ctx = req.demoContext;
    const name = ctx?.employeeName ?? "This employee";
    const lines: string[] = [];

    if (req.json) {
      lines.push(JSON.stringify({ note: "Demo provider cannot produce model-generated JSON. Deterministic workflow output is used instead." }));
    } else {
      lines.push(`Thanks — I read your message: “${truncate(lastUser, 160)}”.`);
      if (ctx?.snippets?.length) {
        lines.push("", "Here is what the approved knowledge I can access says about this:");
        for (const s of ctx.snippets.slice(0, 3)) {
          lines.push(`• **${s.title}** — ${truncate(s.excerpt, 220)}`);
        }
      } else {
        lines.push("", "I did not find an approved knowledge source that covers this, so I will not guess at an answer.");
      }
      lines.push(
        "",
        `What I can do next as ${ctx?.roleTitle ?? "an AI employee"}: turn an approved meeting record into a draft action list, or prepare a draft weekly status summary. Both produce drafts for your review — nothing is sent or created externally without an explicit approval.`,
        "",
        "_Demo provider: this reply was generated offline by a deterministic adapter because no AI provider API key is configured. Connect a provider in Admin → Providers to enable model-generated replies._",
      );
    }
    const text = lines.join("\n");
    const inputTokens = Math.ceil((req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0)) / 4);
    return {
      text,
      usage: { inputTokens, outputTokens: Math.ceil(text.length / 4) },
      provider: "demo",
      model: "demo-deterministic-v1",
      stopReason: "end_turn",
    };
  },
};

function truncate(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
