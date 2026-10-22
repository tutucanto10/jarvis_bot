import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Headline } from "@/briefing/news";
import { logger } from "@/lib/logger";
import { AI_MODEL, getAnthropic } from "./client";
import { buildNewsUserMessage, NEWS_SYSTEM_PROMPT } from "./prompts/news";

const PickSchema = z.object({ index: z.number(), line: z.string() });

export const RawNewsSchema = z.object({
  brasil_mundo: z.array(PickSchema),
  esportes: z.array(PickSchema),
});

export interface NewsSelection {
  brasilMundo: string[];
  esportes: string[];
}

export type NewsSelector = (sections: { brasilMundo: Headline[]; esportes: Headline[] }) => Promise<NewsSelection>;

const MAX_PER_SECTION = 3;
const MAX_INPUT_PER_SECTION = 40;

/** Keeps only picks that point at a real headline, deduped, trimmed, max 3. */
export function validatePicks(picks: z.infer<typeof PickSchema>[], available: number): string[] {
  const used = new Set<number>();
  const lines: string[] = [];
  for (const { index, line } of picks) {
    const text = line.replace(/\s+/g, " ").trim().replace(/\.$/, "");
    if (!Number.isInteger(index) || index < 0 || index >= available || used.has(index)) continue;
    if (text.length < 10 || text.length > 160) continue;
    used.add(index);
    lines.push(text);
    if (lines.length === MAX_PER_SECTION) break;
  }
  return lines;
}

/** Fallback without AI: the first headlines as they are. */
export function firstHeadlines(sections: { brasilMundo: Headline[]; esportes: Headline[] }): NewsSelection {
  return {
    brasilMundo: sections.brasilMundo.slice(0, MAX_PER_SECTION).map((h) => h.title),
    esportes: sections.esportes.slice(0, MAX_PER_SECTION).map((h) => h.title),
  };
}

export const selectNews: NewsSelector = async (sections) => {
  const brasilMundo = sections.brasilMundo.slice(0, MAX_INPUT_PER_SECTION);
  const esportes = sections.esportes.slice(0, MAX_INPUT_PER_SECTION);
  if (brasilMundo.length === 0 && esportes.length === 0) return { brasilMundo: [], esportes: [] };

  const response = await getAnthropic().messages.parse({
    model: AI_MODEL,
    max_tokens: 4096,
    output_config: { effort: "low", format: zodOutputFormat(RawNewsSchema) },
    system: NEWS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildNewsUserMessage({
          brasilMundo: brasilMundo.map((h) => h.title),
          esportes: esportes.map((h) => h.title),
        }),
      },
    ],
  });
  logger.info("news selected", { stopReason: response.stop_reason, outputTokens: response.usage.output_tokens });

  const parsed = RawNewsSchema.safeParse(response.parsed_output);
  if (response.stop_reason !== "end_turn" || !parsed.success) throw new Error("invalid news selection");

  const selection = {
    brasilMundo: validatePicks(parsed.data.brasil_mundo, brasilMundo.length),
    esportes: validatePicks(parsed.data.esportes, esportes.length),
  };
  // A section the model emptied out falls back to raw headlines rather than disappearing.
  const fallback = firstHeadlines({ brasilMundo, esportes });
  return {
    brasilMundo: selection.brasilMundo.length ? selection.brasilMundo : fallback.brasilMundo,
    esportes: selection.esportes.length ? selection.esportes : fallback.esportes,
  };
};
