/**
 * Adapter for ESPN's public (unofficial) scoreboard API. Everything ESPN-specific lives here,
 * validated with Zod, so a shape change breaks in one place and falls back gracefully.
 */
import { z } from "zod";
import { fetchJson } from "@/lib/http";
import { logger } from "@/lib/logger";
import type { DateRange } from "@/lib/periods";
import { ESPN_SCOREBOARD_BASE, LEAGUES, type League } from "./sources";

export interface TeamResult {
  name: string;
  fullName: string;
  abbreviation: string;
  score: number;
  shootoutScore: number | null;
  logoUrl: string | null;
  winner: boolean;
}

export interface Game {
  id: string;
  leagueId: string;
  leagueName: string;
  startsAt: Date;
  home: TeamResult;
  away: TeamResult;
}

const CompetitorSchema = z.object({
  homeAway: z.enum(["home", "away"]),
  score: z.union([z.string(), z.number()]).optional(),
  shootoutScore: z.number().optional(),
  winner: z.boolean().optional(),
  team: z.object({
    displayName: z.string(),
    shortDisplayName: z.string().optional(),
    abbreviation: z.string().optional(),
    logo: z.string().optional(),
  }),
});

const EventSchema = z.object({
  id: z.string(),
  date: z.string(),
  status: z.object({
    type: z.object({ name: z.string(), state: z.string(), completed: z.boolean() }),
  }),
  competitions: z.array(z.object({ competitors: z.array(CompetitorSchema) })).min(1),
});

/** Events are validated one by one so a single odd event doesn't drop the whole league. */
const ScoreboardSchema = z.object({ events: z.array(z.unknown()).default([]) });

const NOT_PLAYED = /POSTPONED|CANCEL|ABANDONED|SUSPENDED|FORFEIT|DELAYED/;

export class ScoresUnavailableError extends Error {}

export function scoreboardUrl(league: League, yyyymmdd: string): string {
  return `${ESPN_SCOREBOARD_BASE}/${league.espnPath}/scoreboard?dates=${yyyymmdd}`;
}

/**
 * ESPN groups `?dates=` by its own (US) calendar day, so ask for every day the range
 * touches in UTC and in US Eastern time; results are deduped and filtered by start time.
 */
export function espnDatesFor(range: DateRange): string[] {
  const days = new Set<string>();
  const last = new Date(range.to.getTime() - 1);
  for (const instant of [range.from, last]) {
    for (const timeZone of ["UTC", "America/New_York"]) {
      days.add(
        new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
          .format(instant)
          .replaceAll("-", ""),
      );
    }
  }
  return [...days].sort();
}

function toTeam(c: z.infer<typeof CompetitorSchema>): TeamResult | null {
  const score = Number(c.score);
  if (c.score === undefined || c.score === "" || !Number.isFinite(score)) return null;
  return {
    name: c.team.shortDisplayName ?? c.team.displayName,
    fullName: c.team.displayName,
    abbreviation: c.team.abbreviation ?? c.team.displayName.slice(0, 3).toUpperCase(),
    score,
    shootoutScore: c.shootoutScore ?? null,
    logoUrl: c.team.logo ?? null,
    winner: c.winner === true,
  };
}

/** Finished games only, from one scoreboard response. */
export function parseScoreboard(json: unknown, league: League): Game[] {
  const games: Game[] = [];
  for (const raw of ScoreboardSchema.parse(json).events) {
    const event = EventSchema.safeParse(raw);
    if (!event.success) continue;
    const { status, competitions, date, id } = event.data;
    if (!status.type.completed || status.type.state !== "post" || NOT_PLAYED.test(status.type.name)) continue;

    const competitors = competitions[0]!.competitors;
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    const homeTeam = home && toTeam(home);
    const awayTeam = away && toTeam(away);
    const startsAt = new Date(date);
    if (!homeTeam || !awayTeam || Number.isNaN(startsAt.getTime())) continue;

    games.push({ id, leagueId: league.id, leagueName: league.name, startsAt, home: homeTeam, away: awayTeam });
  }
  return games;
}

/** Keeps games that *started* inside the range (a game that ends after midnight still counts). */
export function filterByStart(games: Game[], range: DateRange): Game[] {
  const seen = new Set<string>();
  return games.filter((g) => {
    const key = `${g.leagueId}:${g.id}`;
    if (seen.has(key) || g.startsAt < range.from || g.startsAt >= range.to) return false;
    seen.add(key);
    return true;
  });
}

type FetchJson = (url: string) => Promise<unknown>;
const defaultFetch: FetchJson = (url) => fetchJson(url, z.unknown(), 10_000);

/** Finished games that started in `range`. Throws ScoresUnavailableError if every request failed. */
export async function fetchScores(range: DateRange, fetchFn: FetchJson = defaultFetch): Promise<Game[]> {
  const dates = espnDatesFor(range);
  const requests = LEAGUES.flatMap((league) => dates.map((date) => ({ league, url: scoreboardUrl(league, date) })));
  const results = await Promise.allSettled(requests.map(async (r) => parseScoreboard(await fetchFn(r.url), r.league)));

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed === results.length) throw new ScoresUnavailableError("every ESPN request failed");
  if (failed > 0) logger.warn("some ESPN requests failed", { failed, total: results.length });

  const games = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return filterByStart(games, range);
}
