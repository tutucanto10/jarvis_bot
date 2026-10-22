import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ENTRY_TYPES, type EntryType } from "@/db/schema";
import { ASTRO_PATTERN, SPENDING_CATEGORIES, type SpendingCategory } from "@/lib/categories";
import { formatWeekday, isIsoDate, toLocalDate } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { parseBRL } from "@/lib/money";
import { AI_MODEL, getAnthropic } from "./client";
import { buildClassifyUserMessage, CLASSIFY_SYSTEM_PROMPT } from "./prompts/classify";

export const MIN_CONFIDENCE = 0.7;

/** What the model returns: money as written, everything nullable (structured outputs needs all keys). */
export const RawClassificationSchema = z.object({
  type: z.enum(ENTRY_TYPES),
  amount_text: z.string().nullable(),
  category: z.enum(SPENDING_CATEGORIES).nullable(),
  tags: z.array(z.string()),
  due_date: z.string().nullable(),
  fuel: z
    .object({
      total_text: z.string(),
      liters: z.number().nullable(),
      odometer_km: z.number().nullable(),
    })
    .nullable(),
  summary: z.string(),
  confidence: z.number(),
});

export type RawClassification = z.infer<typeof RawClassificationSchema>;

/** Validated result, in the shape the rest of the app uses. */
export const ClassificationSchema = z.object({
  type: z.enum(ENTRY_TYPES),
  amount_cents: z.number().int().positive().optional(),
  category: z.enum(SPENDING_CATEGORIES).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10),
  due_date: z.string().refine(isIsoDate).optional(),
  fuel: z
    .object({
      total_cents: z.number().int().positive(),
      liters: z.number().positive().max(500).optional(),
      odometer_km: z.number().int().nonnegative().max(9_999_999).optional(),
    })
    .optional(),
  summary: z.string().min(1).max(120),
  confidence: z.number().min(0).max(1),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export type ClassifyOutcome =
  | { status: "ok"; classification: Classification }
  | { status: "unsure"; reason: string; classification?: Classification };

export interface ClassifyOptions {
  now?: Date;
  timeZone?: string;
  /** Type confirmed by the user via the inline buttons. */
  forcedType?: EntryType;
}

export type Classifier = (text: string, options?: ClassifyOptions) => Promise<ClassifyOutcome>;

/**
 * Turns raw model output into a Classification, applying the deterministic rules
 * (money parsing, astro tag, type-specific fields). Returns an error string when invalid.
 */
export function normalizeClassification(
  raw: RawClassification,
  rawText: string,
  forcedType?: EntryType,
): { ok: true; value: Classification } | { ok: false; error: string } {
  const type = forcedType ?? raw.type;
  const amountCents = raw.amount_text ? parseBRL(raw.amount_text) : null;

  const candidate: Record<string, unknown> = {
    type,
    tags: normalizeTags(raw.tags, rawText),
    summary: raw.summary.trim() || rawText.slice(0, 60),
    confidence: raw.confidence,
  };

  if (raw.due_date && isIsoDate(raw.due_date)) candidate.due_date = raw.due_date;

  if (type === "abastecimento") {
    const totalCents = (raw.fuel && parseBRL(raw.fuel.total_text)) ?? amountCents;
    if (!totalCents) return { ok: false, error: "fuel without total" };
    candidate.amount_cents = totalCents;
    candidate.category = "combustível" satisfies SpendingCategory;
    candidate.fuel = {
      total_cents: totalCents,
      ...(raw.fuel?.liters ? { liters: raw.fuel.liters } : {}),
      ...(raw.fuel?.odometer_km != null ? { odometer_km: Math.round(raw.fuel.odometer_km) } : {}),
    };
  } else if (type === "gasto") {
    if (!amountCents) return { ok: false, error: "spending without amount" };
    candidate.amount_cents = amountCents;
    candidate.category = raw.category ?? ("outros" satisfies SpendingCategory);
  } else if (amountCents) {
    // An idea or task can mention a price; keep it, but no spending category.
    candidate.amount_cents = amountCents;
  }

  const parsed = ClassificationSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.path.join(".")).join(",") };
  }
  return { ok: true, value: parsed.data };
}

export function normalizeTags(tags: string[], rawText: string): string[] {
  const cleaned = tags.map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean);
  if (ASTRO_PATTERN.test(rawText)) cleaned.unshift("astro");
  return [...new Set(cleaned)].slice(0, 10);
}

/** Calls Claude and validates the answer. Throws only on API/network errors. */
export const classify: Classifier = async (text, options = {}) => {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? "America/Sao_Paulo";
  const startedAt = Date.now();

  const response = await getAnthropic().messages.parse({
    model: AI_MODEL,
    // Room for adaptive thinking (on by default on this model) plus the JSON.
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(RawClassificationSchema) },
    system: [{ type: "text", text: CLASSIFY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: buildClassifyUserMessage({
          text,
          today: toLocalDate(now, timeZone),
          weekday: formatWeekday(now, timeZone),
          forcedType: options.forcedType,
        }),
      },
    ],
  });

  logger.info("classified", {
    stopReason: response.stop_reason,
    ms: Date.now() - startedAt,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  if (response.stop_reason !== "end_turn" || !response.parsed_output) {
    return { status: "unsure", reason: `stop_reason=${response.stop_reason}` };
  }

  // Validate again with our own schema: never trust the helper's output blindly.
  const raw = RawClassificationSchema.safeParse(response.parsed_output);
  if (!raw.success) return { status: "unsure", reason: "invalid model output" };

  const normalized = normalizeClassification(raw.data, text, options.forcedType);
  if (!normalized.ok) return { status: "unsure", reason: normalized.error };

  const classification = normalized.value;
  if (!options.forcedType && classification.confidence < MIN_CONFIDENCE) {
    return { status: "unsure", reason: "low confidence", classification };
  }
  return { status: "ok", classification };
};
