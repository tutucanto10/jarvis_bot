import Anthropic from "@anthropic-ai/sdk";
import { getAiEnv } from "@/lib/env";

export const AI_MODEL = "claude-haiku-5-5";

let client: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  // Short timeout: the webhook must answer Telegram quickly, and a retry beats a hang.
  client ??= new Anthropic({ apiKey: getAiEnv().ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 1 });
  return client;
}
