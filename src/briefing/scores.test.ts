import { describe, expect, it } from "vitest";
import { yesterdayRange } from "@/lib/periods";
import { espnEvent, scoreboard } from "./__fixtures__/espn";
import { espnDatesFor, fetchScores, filterByStart, parseScoreboard, ScoresUnavailableError } from "./scores";
import { LEAGUES } from "./sources";

const brasileirao = LEAGUES[0]!;
// Briefing runs Thursday 22/10 07:00 BRT → "ontem" = Wednesday 21/10 00:00–23:59 BRT = 21/10 03:00Z – 22/10 03:00Z.
const now = new Date("2026-10-22T10:00:00Z");
const yesterday = yesterdayRange(now);

const fla = { name: "Flamengo", abbr: "FLA", score: "2", winner: true };
const pal = { name: "Palmeiras", abbr: "PAL", score: "1" };

describe("espnDatesFor", () => {
  it("covers every UTC and US-Eastern day the BRT day touches", () => {
    expect(espnDatesFor(yesterday)).toEqual(["20261020", "20261021", "20261022"]);
  });
});

describe("parseScoreboard", () => {
  it("maps finished games with short name, abbreviation, score and logo", () => {
    const games = parseScoreboard(scoreboard([espnEvent({ id: "1", date: "2026-10-21T22:30Z", home: fla, away: pal })]), brasileirao);
    expect(games).toEqual([
      {
        id: "1",
        leagueId: "brasileirao",
        leagueName: "Brasileirão",
        startsAt: new Date("2026-10-21T22:30:00Z"),
        home: { name: "Flamengo", fullName: "Flamengo", abbreviation: "FLA", score: 2, shootoutScore: null, logoUrl: "https://a.espncdn.com/i/teamlogos/fla.png", winner: true },
        away: { name: "Palmeiras", fullName: "Palmeiras", abbreviation: "PAL", score: 1, shootoutScore: null, logoUrl: "https://a.espncdn.com/i/teamlogos/pal.png", winner: false },
      },
    ]);
  });

  it("ignores games not finished, postponed, or malformed", () => {
    const games = parseScoreboard(
      scoreboard([
        espnEvent({ id: "1", date: "2026-10-21T22:30Z", home: fla, away: pal, state: "in" }),
        espnEvent({ id: "2", date: "2026-10-21T22:30Z", home: fla, away: pal, statusName: "STATUS_POSTPONED" }),
        espnEvent({ id: "3", date: "2026-10-21T22:30Z", home: { ...fla, score: "" }, away: pal }),
        { id: "4", weird: true },
        espnEvent({ id: "5", date: "2026-10-21T22:30Z", home: fla, away: pal }),
      ]),
      brasileirao,
    );
    expect(games.map((g) => g.id)).toEqual(["5"]);
  });

  it("accepts an empty scoreboard", () => {
    expect(parseScoreboard({ leagues: [] }, brasileirao)).toEqual([]);
  });
});

describe("filterByStart ('ontem' in BRT)", () => {
  const game = (id: string, iso: string) =>
    parseScoreboard(scoreboard([espnEvent({ id, date: iso, home: fla, away: pal })]), brasileirao)[0]!;

  it("keeps games that started yesterday in BRT, including one that ends after midnight", () => {
    const kept = filterByStart(
      [
        game("before", "2026-10-21T02:59Z"), // 20/10 23:59 BRT → anteontem
        game("first", "2026-10-21T03:00Z"), // 21/10 00:00 BRT
        game("late", "2026-10-22T01:30Z"), // 21/10 22:30 BRT, ends ~00:20 on 22/10 → still "ontem"
        game("today", "2026-10-22T03:00Z"), // 22/10 00:00 BRT → hoje
        game("late", "2026-10-22T01:30Z"), // duplicate from another ?dates= request
      ],
      yesterday,
    );
    expect(kept.map((g) => g.id)).toEqual(["first", "late"]);
  });
});

describe("fetchScores", () => {
  it("queries every league for each needed day and merges the results", async () => {
    const urls: string[] = [];
    const games = await fetchScores(yesterday, async (url) => {
      urls.push(url);
      if (url.includes("soccer/bra.1/") && url.endsWith("20261021")) {
        return scoreboard([espnEvent({ id: "1", date: "2026-10-21T22:30Z", home: fla, away: pal })]);
      }
      if (url.includes("soccer/bra.1/") && url.endsWith("20261022")) {
        // Same game listed under the next UTC day too.
        return scoreboard([espnEvent({ id: "1", date: "2026-10-21T22:30Z", home: fla, away: pal })]);
      }
      return scoreboard([]);
    });
    expect(urls).toHaveLength(LEAGUES.length * 3);
    expect(urls[0]).toBe("https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=20261020");
    expect(games.map((g) => g.id)).toEqual(["1"]);
  });

  it("tolerates some failures but throws when ESPN is fully down", async () => {
    let n = 0;
    await expect(fetchScores(yesterday, async () => (n++ % 2 ? scoreboard([]) : Promise.reject(new Error("503"))))).resolves.toEqual([]);
    await expect(fetchScores(yesterday, () => Promise.reject(new Error("down")))).rejects.toBeInstanceOf(ScoresUnavailableError);
  });
});
