import type { ProviderKey } from "@/db/schema";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type CompletionRequest = {
  model: string;
  signal?: AbortSignal;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature: number;
  /** When set, the adapter asks the model for a single JSON object and the caller validates it. */
  json?: boolean;
  /** Free-form hint used by the Demo adapter to produce a sensible deterministic answer. */
  purpose?: "chat" | "meeting_actions" | "weekly_summary" | "content_draft";
  /** Demo adapter only: grounded material that a deterministic reply may cite. */
  demoContext?: { employeeName: string; roleTitle: string; snippets: { title: string; excerpt: string }[] };
};

export type CompletionResult = {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  provider: ProviderKey;
  model: string;
  stopReason: string | null;
};

export interface ProviderAdapter {
  readonly key: ProviderKey;
  readonly displayName: string;
  /** True only when server-side credentials are present. Never reveals the credential itself. */
  isConfigured(): boolean;
  defaultModel(): string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ProviderKey,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}
