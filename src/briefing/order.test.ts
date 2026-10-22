import { describe, expect, it } from "vitest";
import { isFavoriteTeam, orderScores } from "./order";
import type { Game, TeamResult } from "./scores";

const team = (name: string, score: number): TeamResult => ({
  name, fullName: name, abbreviation: name.slice(0, 3).toUpperCase(), score, shootoutScore: null, logoUrl: null, winner: false,
});
let id = 0;
const game = (leagueId: string, home: string, away: string, iso = "2026-10-21T22:00:00Z"): Game => ({
  id: String(++id), leagueId, leagueName: leagueId, startsAt: new Date(iso), home: team(home, 1), away: team(away, 0),
});

describe("isFavoriteTeam", () => {
  it("matches whole words, ignoring case and accents", () => {
    expect(isFavoriteTeam("Flamengo", ["Flamengo"])).toBe(true);
    expect(isFavoriteTeam("CR Flamengo", ["flamengo"])).toBe(true);
    expect(isFavoriteTeam("Grêmio", ["Gremio"])).toBe(true);
    expect(isFavoriteTeam("Flamenguinho", ["Flamengo"])).toBe(false);
  });
});

describe("orderScores", () => {
  it("puts favorite games first (any competition), then leagues in the fixed order", () => {
    const games = [
      game("nfl", "Chiefs", "Bills"),
      game("nba", "Lakers", "Celtics"),
      game("premier", "Arsenal", "Chelsea"),
      game("brasileirao", "Palmeiras", "Santos", "2026-10-21T23:00:00Z"),
      game("brasileirao", "Corinthians", "São Paulo", "2026-10-21T19:00:00Z"),
      game("libertadores", "Racing", "Flamengo"),
      game("champions", "Real Madrid", "Barcelona"),
      game("copa-do-brasil", "Cruzeiro", "Bahia"),
    ];
    const ordered = orderScores(games, ["Flamengo"]);

    expect(ordered.favorites.map((g) => `${g.home.name} x ${g.away.name}`)).toEqual(["Racing x Flamengo"]);
    expect(ordered.leagues.map((b) => b.leagueId)).toEqual([
      "brasileirao", "copa-do-brasil", "champions", "premier", "nba", "nfl",
    ]);
    // Libertadores block disappears: its only game moved up to the favorites block.
    expect(ordered.leagues.find((b) => b.leagueId === "brasileirao")!.games.map((g) => g.home.name)).toEqual([
      "Corinthians", "Palmeiras",
    ]);
  });

  it("drops leagues without games", () => {
    expect(orderScores([], ["Flamengo"])).toEqual({ favorites: [], leagues: [] });
  });
});
