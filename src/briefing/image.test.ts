import { describe, expect, it } from "vitest";
import { MAX_IMAGE_HEIGHT, paginate, renderScoresImages } from "./image";
import { orderScores } from "./order";
import type { Game, TeamResult } from "./scores";

const team = (name: string, score: number, winner = false): TeamResult => ({
  name, fullName: name, abbreviation: name.slice(0, 3).toUpperCase(), score, shootoutScore: null, logoUrl: null, winner,
});
const games = (n: number, leagueId = "nba"): Game[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${leagueId}-${i}`, leagueId, leagueName: leagueId.toUpperCase(), startsAt: new Date("2026-10-21T23:00:00Z"),
    home: team(`Home ${i}`, 100, true), away: team(`Away ${i}`, 90),
  }));

describe("paginate", () => {
  it("fits a normal day in one image", () => {
    expect(paginate(orderScores([...games(5), ...games(4, "premier")], []), "Flamengo")).toHaveLength(1);
  });

  it("splits a long day into several pages, continuing long leagues", () => {
    const pages = paginate(orderScores([...games(30), ...games(16, "nfl")], []), "Flamengo");
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().reduce((n, b) => n + b.games.length, 0)).toBe(46);
    expect(pages.flat().some((b) => b.title.endsWith("(cont.)"))).toBe(true);
  });
});

describe("renderScoresImages", () => {
  it("renders real PNGs (logos missing → abbreviations)", async () => {
    const scores = orderScores([...games(15), ...games(16, "nfl"), ...games(1, "brasileirao")], []);
    const pngs = await renderScoresImages({ scores, title: "Resultados de quarta, 21/10", favoriteLabel: "Flamengo", logos: new Map() });

    expect(pngs.length).toBeGreaterThan(1);
    for (const png of pngs) {
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(1080); // IHDR width
      expect(png.readUInt32BE(20)).toBeLessThanOrEqual(MAX_IMAGE_HEIGHT); // IHDR height
    }
  }, 30_000);
});
