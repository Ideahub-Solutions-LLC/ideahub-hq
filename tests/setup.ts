import { beforeEach } from "vitest";
import { __resetDemoLedger } from "@/lib/connectors";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.PROVIDER_PRICING_JSON;

beforeEach(() => {
  __resetDemoLedger();
});
