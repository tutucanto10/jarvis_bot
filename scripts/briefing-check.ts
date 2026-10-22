/**
 * Usage: pnpm briefing:check [YYYY-MM-DD]
 * Hits every real briefing source (weather, RSS, ESPN) and renders the scores image to
 * ./briefing-check.png — without calling Claude or sending anything to Telegram.
 */
import { writeFile } from "node:fs/promises";
import { renderScoresImages } from "../src/briefing/image";
import { embedLogos } from "../src/briefing/logos";
import { fetchHeadlines } from "../src/briefing/news";
import { hasGames, orderScores } from "../src/briefing/order";
import { fetchScores, scoreboardUrl } from "../src/briefing/scores";
import { LEAGUES, NEWS_FEEDS } from "../src/briefing/sources";
import { fetchWeather } from "../src/briefing/weather";
import { fetchJson } from "../src/lib/http";
import { customRange, yesterdayRange } from "../src/lib/periods";
import { z } from "zod";

const tz = process.env.TZ_USER ?? "America/Sao_Paulo";
const lat = Number(process.env.WEATHER_LAT ?? -22.8);
const lon = Number(process.env.WEATHER_LON ?? -43.2);
const favorites = (process.env.FAVORITE_TEAMS ?? "Flamengo").split(",").map((s) => s.trim());

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    console.log(`✅ ${name}: ${await fn()}`);
  } catch (err) {
    console.log(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  const now = new Date();
  const date = process.argv[2];
  const range = date ? customRange(date, date, tz) : yesterdayRange(now, tz);

  await check("Open-Meteo", async () => JSON.stringify(await fetchWeather(lat, lon, tz)));

  for (const feed of [...NEWS_FEEDS.brasilMundo, ...NEWS_FEEDS.esportes]) {
    await check(`RSS ${feed.name}`, async () => {
      const items = await fetchHeadlines([feed], { now, maxAgeHours: 48 });
      return `${items.length} manchetes; ex.: "${items[0]?.title ?? "—"}"`;
    });
  }

  const day = range.from.toISOString().slice(0, 10).replaceAll("-", "");
  for (const league of LEAGUES) {
    await check(`ESPN ${league.name}`, async () => {
      const json = await fetchJson(scoreboardUrl(league, day), z.object({ events: z.array(z.unknown()).default([]) }));
      return `${json.events.length} eventos em ${day}`;
    });
  }

  await check("Placares + imagem", async () => {
    const scores = orderScores(await fetchScores(range), favorites);
    if (!hasGames(scores)) return "nenhum jogo finalizado no período (imagem não gerada)";
    const pngs = await renderScoresImages({
      scores,
      title: "Teste de resultados",
      favoriteLabel: favorites.join(", "),
      logos: await embedLogos(scores),
    });
    await Promise.all(pngs.map((png, i) => writeFile(`briefing-check${i ? `-${i + 1}` : ""}.png`, png)));
    const total = scores.favorites.length + scores.leagues.reduce((n, l) => n + l.games.length, 0);
    return `${total} jogos, ${pngs.length} imagem(ns) → briefing-check.png`;
  });
}

main().catch((err: unknown) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
