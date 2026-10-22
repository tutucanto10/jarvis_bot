import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getAiEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Provider-agnostic "prompt in, validated JSON out". Every caller validates with Zod,
 * so swapping Gemini ↔ Claude never changes what reaches the database.
 */
export interface JsonRequest<T extends z.ZodType> {
  /** Short label for logs ("classify", "query", "news"). */
  task: string;
  system: string;
  user: string;
  schema: T;
  maxTokens?: number;
}

/** ok:false = the model answered but not with valid JSON (callers treat it as "unsure"). */
export type JsonResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface LlmProvider {
  name: "gemini" | "anthropic";
  model: string;
  /** Throws on network/API errors (rate limit, auth, timeout). */
  generateJson<T extends z.ZodType>(req: JsonRequest<T>): Promise<JsonResult<z.infer<T>>>;
}

const TIMEOUT_MS = 20_000;

function validate<T extends z.ZodType>(schema: T, value: unknown): JsonResult<z.infer<T>> {
  const parsed = schema.safeParse(value);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "schema mismatch" };
}

/** Zod → the JSON Schema subset Gemini accepts (it rejects the `$schema` keyword). */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

type GeminiGenerate = GoogleGenAI["models"]["generateContent"];

export function geminiProvider(model: string, generate: GeminiGenerate): LlmProvider {
  return {
    name: "gemini",
    model,
    async generateJson(req) {
      const startedAt = Date.now();
      const response = await generate({
        model,
        contents: req.user,
        config: {
          systemInstruction: req.system,
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(req.schema),
          maxOutputTokens: req.maxTokens ?? 2048,
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        },
      });
      const finishReason = response.candidates?.[0]?.finishReason;
      logger.info("llm call", {
        provider: "gemini",
        task: req.task,
        finishReason,
        ms: Date.now() - startedAt,
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      });

      const text = response.text;
      if (finishReason !== "STOP" || !text) return { ok: false, reason: `finishReason=${finishReason}` };
      try {
        return validate(req.schema, JSON.parse(text));
      } catch {
        return { ok: false, reason: "invalid JSON" };
      }
    },
  };
}

export function anthropicProvider(model: string, client: Anthropic): LlmProvider {
  return {
    name: "anthropic",
    model,
    async generateJson(req) {
      const startedAt = Date.now();
      const response = await client.messages.parse({
        model,
        // Room for adaptive thinking (on by default on Haiku 5.5) plus the JSON.
        max_tokens: req.maxTokens ?? 2048,
        output_config: { effort: "low", format: zodOutputFormat(req.schema) },
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: req.user }],
      });
      logger.info("llm call", {
        provider: "anthropic",
        task: req.task,
        stopReason: response.stop_reason,
        ms: Date.now() - startedAt,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      if (response.stop_reason !== "end_turn" || response.parsed_output == null) {
        return { ok: false, reason: `stop_reason=${response.stop_reason}` };
      }
      return validate(req.schema, response.parsed_output);
    },
  };
}

let provider: LlmProvider | undefined;

/** Picks the provider from env: GEMINI_API_KEY → Gemini (free tier), else Claude. */
export function getLlm(): LlmProvider {
  if (provider) return provider;
  const env = getAiEnv();
  if (env.AI_PROVIDER === "gemini") {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY! });
    provider = geminiProvider(env.GEMINI_MODEL, (params) => ai.models.generateContent(params));
  } else {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY!, timeout: TIMEOUT_MS, maxRetries: 1 });
    provider = anthropicProvider("claude-haiku-5-5", client);
  }
  return provider;
}
