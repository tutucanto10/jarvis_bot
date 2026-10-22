import type { Game } from "./scores";
import { LEAGUES } from "./sources";

export interface LeagueBlock {
  leagueId: string;
  leagueName: string;
  games: Game[];
}

export interface OrderedScores {
  /** Games of FAVORITE_TEAMS, any competition — shown first and not repeated below. */
  favorites: Game[];
  leagues: LeagueBlock[];
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export function isFavoriteTeam(name: string, favorites: string[]): boolean {
  const n = normalize(name);
  return favorites.some((fav) => new RegExp(`(^|\\W)${escapeRegExp(normalize(fav))}($|\\W)`).test(n));
}

export function isFavoriteGame(game: Game, favorites: string[]): boolean {
  return [game.home, game.away].some(
    (t) => isFavoriteTeam(t.name, favorites) || isFavoriteTeam(t.fullName, favorites),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const byStart = (a: Game, b: Game) => a.startsAt.getTime() - b.startsAt.getTime();
const leagueRank = (id: string) => {
  const i = LEAGUES.findIndex((l) => l.id === id);
  return i === -1 ? LEAGUES.length : i;
};

/** Favorites first, then one block per league in the fixed order; empty leagues are dropped. */
export function orderScores(games: Game[], favorites: string[]): OrderedScores {
  const fav = games.filter((g) => isFavoriteGame(g, favorites));
  const rest = games.filter((g) => !fav.includes(g));

  const blocks = new Map<string, LeagueBlock>();
  for (const game of rest) {
    const block = blocks.get(game.leagueId) ?? { leagueId: game.leagueId, leagueName: game.leagueName, games: [] };
    block.games.push(game);
    blocks.set(game.leagueId, block);
  }

  return {
    favorites: fav.sort((a, b) => leagueRank(a.leagueId) - leagueRank(b.leagueId) || byStart(a, b)),
    leagues: [...blocks.values()]
      .sort((a, b) => leagueRank(a.leagueId) - leagueRank(b.leagueId))
      .map((b) => ({ ...b, games: b.games.sort(byStart) })),
  };
}

export const hasGames = (s: OrderedScores) => s.favorites.length > 0 || s.leagues.length > 0;
