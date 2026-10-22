/**
 * External sources for the morning briefing.
 * Check them with `pnpm briefing:check` — the ESPN endpoints are unofficial and can change.
 */

export const NEWS_FEEDS = {
  brasilMundo: [
    { name: "g1", url: "https://g1.globo.com/rss/g1/" },
    { name: "BBC News Brasil", url: "https://feeds.bbci.co.uk/portuguese/rss.xml" },
  ],
  esportes: [{ name: "ge", url: "https://ge.globo.com/rss/ge/" }],
} as const;

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export const ESPN_SCOREBOARD_BASE = "https://site.api.espn.com/apis/site/v2/sports";

export interface League {
  id: string;
  /** Path after /sports/ in the ESPN API. */
  espnPath: string;
  name: string;
}

/** Display order after favorite teams. */
export const LEAGUES: League[] = [
  { id: "brasileirao", espnPath: "soccer/bra.1", name: "Brasileirão" },
  { id: "copa-do-brasil", espnPath: "soccer/bra.copa_do_brazil", name: "Copa do Brasil" },
  { id: "libertadores", espnPath: "soccer/conmebol.libertadores", name: "Libertadores" },
  { id: "champions", espnPath: "soccer/uefa.champions", name: "Champions League" },
  { id: "premier", espnPath: "soccer/eng.1", name: "Premier League" },
  { id: "nba", espnPath: "basketball/nba", name: "NBA" },
  { id: "nfl", espnPath: "football/nfl", name: "NFL" },
];
