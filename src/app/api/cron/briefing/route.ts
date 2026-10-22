import { runBriefing, defaultBriefingDeps } from "@/briefing/run";
import { isCronAuthorized } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { getBot } from "@/telegram/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorized(req)) return new Response("unauthorized", { status: 401 });

  try {
    const result = await runBriefing(defaultBriefingDeps(getBot().api));
    return Response.json({ ok: true, messages: result.messages.length, hadImage: result.hadImage, scores: result.delivery });
  } catch (err) {
    logger.error("briefing cron failed", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
