import type { NewsSelection } from "@/ai/news";
import { formatDayMonth, formatWeekday } from "@/lib/dates";
import { escapeHtml } from "@/lib/html";
import { hasGames, type OrderedScores } from "./order";
import type { Game } from "./scores";
import { weatherEmoji, type Weather } from "./weather";

export const MESSAGE_LIMIT = 3500;

/** How the scores will be delivered after the text message. */
export type ScoresDelivery = "image" | "text" | "none" | "unavailable";

export interface BriefingContent {
  now: Date;
  yesterday: Date;
  timeZone: string;
  weather: Weather | null;
  weatherLabel: string;
  news: NewsSelection | null;
  scores: OrderedScores | null;
  favoriteTeams: string[];
  delivery: ScoresDelivery;
}

const deg = (c: number) => `${Math.round(c)}°`;

export function dayLabel(date: Date, timeZone: string): string {
  return `${formatWeekday(date, timeZone)}, ${formatDayMonth(date, timeZone)}`;
}

export function formatGame(g: Game): string {
  const shootout =
    g.home.shootoutScore != null && g.away.shootoutScore != null
      ? ` (${g.home.shootoutScore} x ${g.away.shootoutScore} pên.)`
      : "";
  return `${escapeHtml(g.home.name)} ${g.home.score} x ${g.away.score} ${escapeHtml(g.away.name)}${shootout}`;
}

function favoritesTitle(teams: string[]): string {
  const emoji = teams.length === 1 && teams[0]!.toLowerCase() === "flamengo" ? "🔴⚫" : "⭐";
  return `<b>${emoji} ${escapeHtml(teams.join(", "))}</b>`;
}

function weatherLine(w: Weather | null, label: string): string {
  if (!w) return `🌡 ${escapeHtml(label)}: clima indisponível`;
  const parts = [`${deg(w.currentC)} agora`];
  if (w.maxC != null) parts.push(`máx ${deg(w.maxC)}`);
  if (w.rainChancePct != null) parts.push(`${Math.round(w.rainChancePct)}% de chuva`);
  return `${weatherEmoji(w.weatherCode)} ${escapeHtml(label)}: ${parts.join(" · ")}`;
}

function bullets(title: string, lines: string[]): string | null {
  return lines.length ? [title, ...lines.map((l) => `• ${escapeHtml(l)}`)].join("\n") : null;
}

const FOOTER: Record<ScoresDelivery, string | null> = {
  image: "📊 Resultados completos na imagem abaixo",
  text: "📊 Resultados abaixo",
  none: "📊 Nenhum jogo das ligas acompanhadas ontem",
  unavailable: null,
};

/** Message 1 (HTML), split into more messages only if it exceeds the limit. */
export function buildBriefingMessages(c: BriefingContent): string[] {
  const sections: (string | null)[] = [
    [`☀️ <b>Bom dia, Tutu — ${dayLabel(c.now, c.timeZone)}</b>`, weatherLine(c.weather, c.weatherLabel)].join("\n"),
  ];

  if (c.news) {
    sections.push(bullets("<b>🌎 Brasil e mundo</b>", c.news.brasilMundo));
    sections.push(bullets("<b>⚽ Esportes</b>", c.news.esportes));
  } else {
    sections.push("⚠️ notícias indisponíveis");
  }

  if (c.scores?.favorites.length) {
    sections.push(
      [favoritesTitle(c.favoriteTeams), ...c.scores.favorites.map((g) => `${formatGame(g)} · ${escapeHtml(g.leagueName)}`)].join("\n"),
    );
  }

  sections.push(FOOTER[c.delivery]);
  return packSections(sections.filter((s): s is string => s !== null));
}

/** Message 2 when the image can't be sent: plain scores grouped by league. */
export function buildScoresFallback(c: Pick<BriefingContent, "scores" | "yesterday" | "timeZone" | "favoriteTeams">): string[] {
  if (!c.scores) return ["⚠️ placares indisponíveis"];
  if (!hasGames(c.scores)) return [];

  const sections = [`<b>Resultados de ${dayLabel(c.yesterday, c.timeZone)}</b>`];
  if (c.scores.favorites.length) {
    sections.push(
      [favoritesTitle(c.favoriteTeams), ...c.scores.favorites.map((g) => `${formatGame(g)} · ${escapeHtml(g.leagueName)}`)].join("\n"),
    );
  }
  for (const block of c.scores.leagues) {
    sections.push([`<b>${escapeHtml(block.leagueName)}</b>`, ...block.games.map(formatGame)].join("\n"));
  }
  sections.push("⚠️ imagem indisponível");
  return packSections(sections);
}

/**
 * Greedily packs whole sections into messages under the limit. A section is only broken
 * (between lines) if it alone exceeds the limit — content is never cut.
 */
export function packSections(sections: string[], limit = MESSAGE_LIMIT): string[] {
  const messages: string[] = [];
  let current = "";
  for (const section of sections.flatMap((s) => (s.length > limit ? splitLines(s, limit) : [s]))) {
    const candidate = current ? `${current}\n\n${section}` : section;
    if (candidate.length <= limit || !current) {
      current = candidate;
    } else {
      messages.push(current);
      current = section;
    }
  }
  if (current) messages.push(current);
  return messages;
}

function splitLines(section: string, limit: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const line of section.split("\n")) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= limit || !current) current = candidate;
    else {
      parts.push(current);
      current = line;
    }
  }
  if (current) parts.push(current);
  return parts;
}
