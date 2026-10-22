import { InputFile, InputMediaBuilder, type Api } from "grammy";
import { firstHeadlines, selectNews, type NewsSelection, type NewsSelector } from "@/ai/news";
import { getDb } from "@/db/client";
import { saveBriefing } from "@/db/briefings";
import { getAppEnv, getBriefingEnv, getTelegramEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { yesterdayRange, type DateRange } from "@/lib/periods";
import { renderScoresImages, type ScoresRenderer } from "./image";
import { embedLogos as embedLogosDefault, type LogoMap } from "./logos";
import { buildBriefingMessages, buildScoresFallback, dayLabel, type ScoresDelivery } from "./message";
import { fetchHeadlines, type Headline } from "./news";
import { hasGames, orderScores, type OrderedScores } from "./order";
import { fetchScores, type Game } from "./scores";
import { NEWS_FEEDS } from "./sources";
import { fetchWeather, type Weather } from "./weather";

export interface BriefingSender {
  text(html: string): Promise<void>;
  photos(pngs: Buffer[], caption: string): Promise<void>;
}

export interface BriefingDeps {
  now: () => Date;
  timeZone: string;
  weatherLabel: string;
  favoriteTeams: string[];
  fetchWeather: () => Promise<Weather>;
  fetchHeadlines: (now: Date) => Promise<{ brasilMundo: Headline[]; esportes: Headline[] }>;
  fetchScores: (range: DateRange) => Promise<Game[]>;
  selectNews: NewsSelector;
  embedLogos: (scores: OrderedScores) => Promise<LogoMap>;
  renderImages: ScoresRenderer;
  sender: BriefingSender;
  save: (input: { content: string; hadImage: boolean }) => Promise<unknown>;
}

export interface BriefingResult {
  messages: string[];
  hadImage: boolean;
  delivery: ScoresDelivery;
}

async function settle<T>(name: string, task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch (err) {
    logger.error(`briefing: ${name} failed`, err);
    return null;
  }
}

async function loadNews(deps: BriefingDeps, now: Date): Promise<NewsSelection | null> {
  const headlines = await settle("headlines", () => deps.fetchHeadlines(now));
  if (!headlines) return null;
  // If the AI fails, raw headlines are still better than nothing.
  return (await settle("news selection", () => deps.selectNews(headlines))) ?? firstHeadlines(headlines);
}

/** Collects every source (each one may fail independently), then sends text + scores and records it. */
export async function runBriefing(deps: BriefingDeps): Promise<BriefingResult> {
  const now = deps.now();
  const range = yesterdayRange(now, deps.timeZone);
  const yesterday = range.from;

  const [weather, news, games] = await Promise.all([
    settle("weather", deps.fetchWeather),
    loadNews(deps, now),
    settle("scores", () => deps.fetchScores(range)),
  ]);
  const scores = games ? orderScores(games, deps.favoriteTeams) : null;

  let pngs: Buffer[] | null = null;
  if (scores && hasGames(scores)) {
    pngs = await settle("scores image", async () =>
      deps.renderImages({
        scores,
        title: `Resultados de ${dayLabel(yesterday, deps.timeZone)}`,
        favoriteLabel: deps.favoriteTeams.join(", "),
        logos: await deps.embedLogos(scores),
      }),
    );
  }

  const delivery: ScoresDelivery = !scores ? "unavailable" : !hasGames(scores) ? "none" : pngs ? "image" : "text";
  const content = { now, yesterday, timeZone: deps.timeZone, weather, weatherLabel: deps.weatherLabel, news, scores, favoriteTeams: deps.favoriteTeams };

  const sent: string[] = [];
  for (const message of buildBriefingMessages({ ...content, delivery })) {
    await deps.sender.text(message);
    sent.push(message);
  }

  let hadImage = false;
  if (pngs) {
    const caption = `Resultados de ${dayLabel(yesterday, deps.timeZone)}`;
    hadImage = (await settle("send photo", () => deps.sender.photos(pngs, caption))) !== null;
    if (hadImage) sent.push(`[imagem] ${caption}`);
  }
  if (!hadImage && delivery !== "none") {
    for (const message of buildScoresFallback(content)) {
      await deps.sender.text(message);
      sent.push(message);
    }
  }

  await settle("save briefing", () => deps.save({ content: sent.join("\n\n---\n\n"), hadImage }));
  logger.info("briefing sent", { messages: sent.length, hadImage, delivery });
  return { messages: sent, hadImage, delivery };
}

export function telegramSender(api: Api, chatId: number): BriefingSender {
  return {
    async text(html) {
      await api.sendMessage(chatId, html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    },
    async photos(pngs, caption) {
      if (pngs.length === 1) {
        await api.sendPhoto(chatId, new InputFile(pngs[0]!, "resultados.png"), { caption });
        return;
      }
      await api.sendMediaGroup(
        chatId,
        pngs.map((png, i) => InputMediaBuilder.photo(new InputFile(png, `resultados-${i + 1}.png`), i === 0 ? { caption } : {})),
      );
    },
  };
}

/** Production wiring from env vars. */
export function defaultBriefingDeps(api: Api): BriefingDeps {
  const env = getBriefingEnv();
  const { TZ_USER: timeZone } = getAppEnv();
  return {
    now: () => new Date(),
    timeZone,
    weatherLabel: env.WEATHER_LABEL,
    favoriteTeams: env.FAVORITE_TEAMS,
    fetchWeather: () => fetchWeather(env.WEATHER_LAT, env.WEATHER_LON, timeZone),
    fetchHeadlines: async (now) => {
      const [brasilMundo, esportes] = await Promise.all([
        fetchHeadlines(NEWS_FEEDS.brasilMundo, { now }).catch(() => []),
        fetchHeadlines(NEWS_FEEDS.esportes, { now }).catch(() => []),
      ]);
      if (!brasilMundo.length && !esportes.length) throw new Error("no headlines");
      return { brasilMundo, esportes };
    },
    fetchScores: (range) => fetchScores(range),
    selectNews,
    embedLogos: (scores) => embedLogosDefault(scores),
    renderImages: renderScoresImages,
    sender: telegramSender(api, getTelegramEnv().ALLOWED_CHAT_ID),
    save: (input) => saveBriefing(getDb(), input),
  };
}
