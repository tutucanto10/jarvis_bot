import { describe, expect, it, vi } from "vitest";
import { MESSAGE_LIMIT, packSections } from "./message";
import { runBriefing, type BriefingDeps } from "./run";
import type { Game, TeamResult } from "./scores";

// Thursday 22/10/2026 07:00 BRT.
const NOW = new Date("2026-10-22T10:00:00Z");

const team = (name: string, score: number, winner = false): TeamResult => ({
  name, fullName: name, abbreviation: name.slice(0, 3).toUpperCase(), score, shootoutScore: null, logoUrl: `https://logo/${name}`, winner,
});
const game = (leagueId: string, leagueName: string, home: TeamResult, away: TeamResult, iso = "2026-10-21T22:30:00Z"): Game => ({
  id: `${home.name}-${away.name}`, leagueId, leagueName, startsAt: new Date(iso), home, away,
});

const GAMES = [
  game("nba", "NBA", team("Lakers", 112, true), team("Celtics", 108)),
  game("brasileirao", "Brasileirão", team("Flamengo", 2, true), team("Palmeiras", 1)),
  game("brasileirao", "Brasileirão", team("Corinthians", 1), team("São Paulo", 1), "2026-10-21T21:00:00Z"),
];

function setup(overrides: Partial<BriefingDeps> = {}) {
  const sent: { kind: "text" | "photos"; value: string; count?: number }[] = [];
  const saved: { content: string; hadImage: boolean }[] = [];
  const deps: BriefingDeps = {
    now: () => NOW,
    timeZone: "America/Sao_Paulo",
    weatherLabel: "Ilha do Governador",
    favoriteTeams: ["Flamengo"],
    fetchWeather: vi.fn().mockResolvedValue({ currentC: 22.4, maxC: 28.1, minC: 19.6, rainChancePct: 10, weatherCode: 2 }),
    fetchHeadlines: vi.fn().mockResolvedValue({
      brasilMundo: [{ title: "Manchete crua 1", source: "g1", publishedAt: null }],
      esportes: [{ title: "Manchete crua esporte", source: "ge", publishedAt: null }],
    }),
    fetchScores: vi.fn().mockResolvedValue(GAMES),
    selectNews: vi.fn().mockResolvedValue({
      brasilMundo: ["Câmara aprova projeto de lei", "Dólar fecha em queda", "Chuva atinge o Rio <hoje> & amanhã"],
      esportes: ["Flamengo vence o Palmeiras no Maracanã", "Lakers batem Celtics na estreia"],
    }),
    embedLogos: vi.fn().mockResolvedValue(new Map()),
    renderImages: vi.fn().mockResolvedValue([Buffer.from("png")]),
    sender: {
      text: vi.fn(async (value: string) => void sent.push({ kind: "text", value })),
      photos: vi.fn(async (pngs: Buffer[], caption: string) => void sent.push({ kind: "photos", value: caption, count: pngs.length })),
    },
    save: vi.fn(async (input) => void saved.push(input)),
    ...overrides,
  };
  return { deps, sent, saved };
}

describe("runBriefing", () => {
  it("sends the text message then the scores image, and records it", async () => {
    const { deps, sent, saved } = setup();
    const result = await runBriefing(deps);

    expect(sent[0]).toEqual({
      kind: "text",
      value: [
        "☀️ <b>Bom dia, Tutu — quinta, 22/10</b>",
        "🌤 Ilha do Governador: 22° agora · máx 28° · 10% de chuva",
        "",
        "<b>🌎 Brasil e mundo</b>",
        "• Câmara aprova projeto de lei",
        "• Dólar fecha em queda",
        "• Chuva atinge o Rio &lt;hoje&gt; &amp; amanhã",
        "",
        "<b>⚽ Esportes</b>",
        "• Flamengo vence o Palmeiras no Maracanã",
        "• Lakers batem Celtics na estreia",
        "",
        "<b>🔴⚫ Flamengo</b>",
        "Flamengo 2 x 1 Palmeiras · Brasileirão",
        "",
        "📊 Resultados completos na imagem abaixo",
      ].join("\n"),
    });
    expect(sent[1]).toEqual({ kind: "photos", value: "Resultados de quarta, 21/10", count: 1 });
    expect(sent).toHaveLength(2);

    expect(deps.fetchScores).toHaveBeenCalledWith({
      from: new Date("2026-10-21T03:00:00Z"),
      to: new Date("2026-10-22T03:00:00Z"),
    });
    const renderInput = vi.mocked(deps.renderImages).mock.calls[0]![0];
    expect(renderInput.title).toBe("Resultados de quarta, 21/10");
    expect(renderInput.scores.favorites.map((g) => g.home.name)).toEqual(["Flamengo"]);
    expect(renderInput.scores.leagues.map((l) => l.leagueId)).toEqual(["brasileirao", "nba"]);

    expect(result).toMatchObject({ hadImage: true, delivery: "image" });
    expect(saved).toEqual([{ content: expect.stringContaining("Bom dia, Tutu"), hadImage: true }]);
  });

  it("omits the Flamengo section when they didn't play", async () => {
    const { deps, sent } = setup({ fetchScores: vi.fn().mockResolvedValue([GAMES[0]]) });
    await runBriefing(deps);
    expect(sent[0]!.value).not.toContain("🔴⚫");
  });

  it("falls back to plain-text scores when the image fails to render", async () => {
    const { deps, sent, saved } = setup({ renderImages: vi.fn().mockRejectedValue(new Error("satori crashed")) });
    await runBriefing(deps);

    expect(sent[0]!.value).toContain("📊 Resultados abaixo");
    expect(sent[1]).toEqual({
      kind: "text",
      value: [
        "<b>Resultados de quarta, 21/10</b>",
        "",
        "<b>🔴⚫ Flamengo</b>",
        "Flamengo 2 x 1 Palmeiras · Brasileirão",
        "",
        "<b>Brasileirão</b>",
        "Corinthians 1 x 1 São Paulo",
        "",
        "<b>NBA</b>",
        "Lakers 112 x 108 Celtics",
        "",
        "⚠️ imagem indisponível",
      ].join("\n"),
    });
    expect(saved[0]!.hadImage).toBe(false);
  });

  it("falls back to text when Telegram rejects the photo", async () => {
    const { deps, sent } = setup();
    deps.sender.photos = vi.fn().mockRejectedValue(new Error("400 PHOTO_INVALID"));
    const result = await runBriefing(deps);
    expect(result.hadImage).toBe(false);
    expect(sent.at(-1)!.value).toContain("⚠️ imagem indisponível");
  });

  it("says scores are unavailable when ESPN fails", async () => {
    const { deps, sent } = setup({ fetchScores: vi.fn().mockRejectedValue(new Error("ESPN down")) });
    await runBriefing(deps);
    expect(sent.map((s) => s.value)).toEqual([expect.not.stringContaining("📊"), "⚠️ placares indisponíveis"]);
    expect(deps.renderImages).not.toHaveBeenCalled();
  });

  it("handles a day without games", async () => {
    const { deps, sent } = setup({ fetchScores: vi.fn().mockResolvedValue([]) });
    const result = await runBriefing(deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.value).toContain("Nenhum jogo das ligas acompanhadas ontem");
    expect(result.delivery).toBe("none");
  });

  it("degrades weather, news and AI failures gracefully", async () => {
    const noWeather = setup({ fetchWeather: vi.fn().mockRejectedValue(new Error("timeout")) });
    await runBriefing(noWeather.deps);
    expect(noWeather.sent[0]!.value).toContain("🌡 Ilha do Governador: clima indisponível");

    const aiDown = setup({ selectNews: vi.fn().mockRejectedValue(new Error("529")) });
    await runBriefing(aiDown.deps);
    expect(aiDown.sent[0]!.value).toContain("• Manchete crua 1");

    const feedsDown = setup({ fetchHeadlines: vi.fn().mockRejectedValue(new Error("all feeds failed")) });
    await runBriefing(feedsDown.deps);
    expect(feedsDown.sent[0]!.value).toContain("⚠️ notícias indisponíveis");
  });

  it("still sends when saving the history fails", async () => {
    const { deps, sent } = setup({ save: vi.fn().mockRejectedValue(new Error("db down")) });
    await runBriefing(deps);
    expect(sent).toHaveLength(2);
  });

  it("splits an oversized message into two instead of cutting it", async () => {
    const long = Array.from({ length: 3 }, (_, i) => `${i} ${"notícia muito longa ".repeat(30)}`);
    const { deps, sent } = setup({ selectNews: vi.fn().mockResolvedValue({ brasilMundo: long, esportes: long }) });
    await runBriefing(deps);

    const texts = sent.filter((s) => s.kind === "text").map((s) => s.value);
    expect(texts).toHaveLength(2);
    expect(texts.every((t) => t.length <= MESSAGE_LIMIT)).toBe(true);
    expect(texts.join("")).toContain("2 notícia");
    expect(texts[1]).toContain("📊 Resultados completos na imagem abaixo");
  });
});

describe("packSections", () => {
  it("keeps whole sections together under the limit", () => {
    expect(packSections(["aaaa", "bbbb", "cc"], 10)).toEqual(["aaaa\n\nbbbb", "cc"]);
    expect(packSections(["x".repeat(20)], 10)).toEqual(["x".repeat(20)]);
    // A single section over the limit is broken between lines, never mid-line.
    expect(packSections(["l1aaaa\nl2bbbb\nl3cc"], 13)).toEqual(["l1aaaa\nl2bbbb", "l3cc"]);
  });
});
