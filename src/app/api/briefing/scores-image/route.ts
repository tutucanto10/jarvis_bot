import { renderScoresImages } from "@/briefing/image";
import { embedLogos } from "@/briefing/logos";
import { dayLabel } from "@/briefing/message";
import { hasGames, orderScores } from "@/briefing/order";
import { fetchScores } from "@/briefing/scores";
import { getAppEnv, getBriefingEnv } from "@/lib/env";
import { isCronAuthorized } from "@/lib/cron-auth";
import { isIsoDate } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { customRange } from "@/lib/periods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/briefing/scores-image?date=YYYY-MM-DD[&page=N] — for debugging the image in a browser. */
export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorized(req, { allowQuery: true })) return new Response("unauthorized", { status: 401 });

  const params = new URL(req.url).searchParams;
  const date = params.get("date") ?? "";
  const page = Number(params.get("page") ?? "1");
  if (!isIsoDate(date) || !Number.isInteger(page) || page < 1) {
    return new Response("use ?date=YYYY-MM-DD&page=1", { status: 400 });
  }

  try {
    const { TZ_USER: timeZone } = getAppEnv();
    const { FAVORITE_TEAMS } = getBriefingEnv();
    const range = customRange(date, date, timeZone);
    const scores = orderScores(await fetchScores(range), FAVORITE_TEAMS);
    if (!hasGames(scores)) return new Response("no finished games on that day", { status: 404 });

    const pngs = await renderScoresImages({
      scores,
      title: `Resultados de ${dayLabel(range.from, timeZone)}`,
      favoriteLabel: FAVORITE_TEAMS.join(", "),
      logos: await embedLogos(scores),
    });
    const png = pngs[page - 1];
    if (!png) return new Response(`only ${pngs.length} page(s)`, { status: 404 });

    return new Response(new Uint8Array(png), {
      headers: { "content-type": "image/png", "cache-control": "private, no-store", "x-pages": String(pngs.length) },
    });
  } catch (err) {
    logger.error("scores image failed", err);
    return new Response("failed to render", { status: 502 });
  }
}
