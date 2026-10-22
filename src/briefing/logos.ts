import { fetchOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import type { OrderedScores } from "./order";

const MAX_LOGO_BYTES = 400_000;
const ALLOWED_TYPES = ["image/png", "image/jpeg"];

export type LogoMap = Map<string, string>;
export type LogoFetcher = (url: string) => Promise<string>;

/** Downloads a logo and returns it as a data URI (satori can't fetch remote images reliably). */
export const fetchLogoDataUri: LogoFetcher = async (url) => {
  const res = await fetchOk(url, 4000);
  const type = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!ALLOWED_TYPES.includes(type)) throw new Error(`unsupported logo type ${type}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_LOGO_BYTES) throw new Error("logo too large");
  return `data:${type};base64,${bytes.toString("base64")}`;
};

/** Every distinct logo URL in the scores, embedded; failures are simply missing from the map. */
export async function embedLogos(scores: OrderedScores, fetcher: LogoFetcher = fetchLogoDataUri): Promise<LogoMap> {
  const games = [...scores.favorites, ...scores.leagues.flatMap((b) => b.games)];
  const urls = [...new Set(games.flatMap((g) => [g.home.logoUrl, g.away.logoUrl]).filter((u): u is string => !!u))];

  const logos: LogoMap = new Map();
  const results = await Promise.allSettled(urls.map(async (url) => logos.set(url, await fetcher(url))));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) logger.warn("some logos failed, using abbreviations", { failed, total: urls.length });
  return logos;
}
