import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { EntryFilter } from "@/db/queries";
import { ENTRY_TYPES } from "@/db/schema";
import { SPENDING_CATEGORIES } from "@/lib/categories";
import { formatWeekday, isIsoDate, toLocalDate } from "@/lib/dates";
import { logger } from "@/lib/logger";
import {
  customRange,
  lastMonthRange,
  lastWeekRange,
  resolveMonth,
  thisMonthRange,
  thisWeekRange,
  thisYearRange,
  todayRange,
  yesterdayRange,
  type DateRange,
} from "@/lib/periods";
import { AI_MODEL, getAnthropic } from "./client";
import { buildQueryUserMessage, QUERY_SYSTEM_PROMPT } from "./prompts/query";

export const PERIOD_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
  "month",
  "custom",
  "all",
] as const;

export const RawQuerySchema = z.object({
  intent: z.enum(["total", "count", "list"]),
  types: z.array(z.enum(ENTRY_TYPES)),
  categories: z.array(z.enum(SPENDING_CATEGORIES)),
  tags: z.array(z.string()),
  search: z.string().nullable(),
  period: z.object({
    preset: z.enum(PERIOD_PRESETS),
    month: z.number().nullable(),
    year: z.number().nullable(),
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  understood: z.boolean(),
});

export type RawQuery = z.infer<typeof RawQuerySchema>;

export interface StructuredQuery {
  intent: RawQuery["intent"];
  filter: EntryFilter;
  /** What the period was, for the answer text. */
  period: RawQuery["period"];
}

export type QueryOutcome = { status: "ok"; query: StructuredQuery } | { status: "unsure"; reason: string };
export type QueryParser = (text: string, options: { now: Date; timeZone: string }) => Promise<QueryOutcome>;

/** Validates the model's filter and resolves the period into a concrete date range. */
export function toStructuredQuery(
  raw: RawQuery,
  now: Date,
  timeZone: string,
): { ok: true; value: StructuredQuery } | { ok: false; error: string } {
  if (!raw.understood) return { ok: false, error: "not understood" };

  const range = resolvePeriod(raw.period, now, timeZone);
  if (range === null) return { ok: false, error: "invalid period" };

  const search = raw.search?.trim().slice(0, 50) || undefined;
  const tags = raw.tags.map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean);

  return {
    ok: true,
    value: {
      intent: raw.intent,
      period: raw.period,
      filter: {
        types: raw.types.length ? [...new Set(raw.types)] : undefined,
        categories: raw.categories.length ? [...new Set(raw.categories)] : undefined,
        tags: tags.length ? tags : undefined,
        search,
        range,
      },
    },
  };
}

/** undefined = no period ("all"); null = invalid. */
function resolvePeriod(p: RawQuery["period"], now: Date, tz: string): DateRange | undefined | null {
  switch (p.preset) {
    case "all":
      return undefined;
    case "today":
      return todayRange(now, tz);
    case "yesterday":
      return yesterdayRange(now, tz);
    case "this_week":
      return thisWeekRange(now, tz);
    case "last_week":
      return lastWeekRange(now, tz);
    case "this_month":
      return thisMonthRange(now, tz);
    case "last_month":
      return lastMonthRange(now, tz);
    case "this_year":
      return thisYearRange(now, tz);
    case "month": {
      const month = p.month;
      const yearOk = p.year === null || (Number.isInteger(p.year) && p.year >= 2000 && p.year <= 2100);
      if (!month || !Number.isInteger(month) || month < 1 || month > 12 || !yearOk) return null;
      return resolveMonth(month, p.year, now, tz);
    }
    case "custom":
      if (!p.from || !p.to || !isIsoDate(p.from) || !isIsoDate(p.to) || p.from > p.to) return null;
      return customRange(p.from, p.to, tz);
  }
}

/** Natural language → validated filter. The model never writes SQL. */
export const parseQuery: QueryParser = async (text, { now, timeZone }) => {
  const response = await getAnthropic().messages.parse({
    model: AI_MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(RawQuerySchema) },
    system: [{ type: "text", text: QUERY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: buildQueryUserMessage({
          text,
          today: toLocalDate(now, timeZone),
          weekday: formatWeekday(now, timeZone),
        }),
      },
    ],
  });

  logger.info("query parsed", { stopReason: response.stop_reason, outputTokens: response.usage.output_tokens });

  if (response.stop_reason !== "end_turn" || !response.parsed_output) {
    return { status: "unsure", reason: `stop_reason=${response.stop_reason}` };
  }
  const raw = RawQuerySchema.safeParse(response.parsed_output);
  if (!raw.success) return { status: "unsure", reason: "invalid model output" };

  const query = toStructuredQuery(raw.data, now, timeZone);
  return query.ok ? { status: "ok", query: query.value } : { status: "unsure", reason: query.error };
};

/** Cheap check to route a message to the query flow instead of capture. */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /\?\s*$/.test(t) ||
    /^(quanto|quantos|quantas|qual|quais|quando|cad[êe]|mostra|me mostra|lista|listar|o que eu)(?=\s|$)/.test(t)
  );
}
