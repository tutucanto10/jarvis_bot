import Parser from "rss-parser";
import { fetchOk } from "@/lib/http";
import { logger } from "@/lib/logger";

export interface Headline {
  title: string;
  source: string;
  publishedAt: Date | null;
}

const parser = new Parser();

/** Parses an RSS/Atom document into headlines (no network). */
export async function parseFeed(xml: string, source: string): Promise<Headline[]> {
  const feed = await parser.parseString(xml);
  return feed.items
    .map((item) => ({
      title: (item.title ?? "").replace(/\s+/g, " ").trim(),
      source,
      publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
    }))
    .filter((h) => h.title.length > 0);
}

/**
 * Recent headlines from several feeds; a failing feed is logged and skipped.
 * Throws only when every feed failed.
 */
export async function fetchHeadlines(
  feeds: readonly { name: string; url: string }[],
  options: { now: Date; maxAgeHours?: number; perFeed?: number },
): Promise<Headline[]> {
  const maxAgeMs = (options.maxAgeHours ?? 24) * 3_600_000;
  const results = await Promise.allSettled(
    feeds.map(async (feed) => parseFeed(await (await fetchOk(feed.url)).text(), feed.name)),
  );

  const headlines: Headline[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      logger.warn("feed failed", { feed: feeds[i]!.name, error: String(result.reason) });
      return;
    }
    const fresh = result.value.filter(
      (h) => !h.publishedAt || options.now.getTime() - h.publishedAt.getTime() <= maxAgeMs,
    );
    headlines.push(...fresh.slice(0, options.perFeed ?? 20));
  });

  if (results.every((r) => r.status === "rejected")) throw new Error("all feeds failed");
  return dedupeHeadlines(headlines);
}

export function dedupeHeadlines(headlines: Headline[]): Headline[] {
  const seen = new Set<string>();
  return headlines.filter((h) => {
    const key = h.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
