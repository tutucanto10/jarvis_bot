/**
 * Test fixtures shaped like ESPN's scoreboard response (site.api.espn.com/.../scoreboard).
 * Hand-written from the known format — not captured from a live response.
 */
interface FixtureTeam {
  name: string;
  abbr: string;
  score: string;
  winner?: boolean;
}

export function espnEvent(opts: {
  id: string;
  date: string;
  home: FixtureTeam;
  away: FixtureTeam;
  state?: "pre" | "in" | "post";
  completed?: boolean;
  statusName?: string;
}) {
  const state = opts.state ?? "post";
  const competitor = (t: FixtureTeam, homeAway: "home" | "away") => ({
    id: `${t.abbr}-id`,
    homeAway,
    winner: t.winner ?? false,
    score: t.score,
    team: {
      id: `${t.abbr}-id`,
      displayName: t.name,
      shortDisplayName: t.name,
      abbreviation: t.abbr,
      logo: `https://a.espncdn.com/i/teamlogos/${t.abbr.toLowerCase()}.png`,
    },
  });
  return {
    id: opts.id,
    date: opts.date,
    name: `${opts.away.name} at ${opts.home.name}`,
    status: {
      type: {
        name: opts.statusName ?? (state === "post" ? "STATUS_FULL_TIME" : "STATUS_SCHEDULED"),
        state,
        completed: opts.completed ?? state === "post",
        shortDetail: "FT",
      },
    },
    competitions: [{ id: opts.id, competitors: [competitor(opts.home, "home"), competitor(opts.away, "away")] }],
  };
}

export const scoreboard = (events: unknown[]) => ({ leagues: [{ name: "League" }], events });
