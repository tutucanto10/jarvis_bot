import { webhookCallback } from "grammy";
import { getBot } from "@/telegram/bot";
import { getTelegramEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { safeEqual } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Classification takes a few seconds; leave headroom on Vercel.
export const maxDuration = 60;

const SECRET_HEADER = "x-telegram-bot-api-secret-token";

type Handler = (req: Request) => Promise<Response>;
let handler: Handler | undefined;

function getHandler(secret: string): Handler {
  handler ??= webhookCallback(getBot(), "std/http", {
    secretToken: secret,
    timeoutMilliseconds: 50_000,
    // Answer 200 on timeout: a non-2xx makes Telegram redeliver and we'd save the entry twice.
    onTimeout: () => logger.warn("webhook handler timed out"),
  });
  return handler;
}

export async function POST(req: Request): Promise<Response> {
  const { TELEGRAM_WEBHOOK_SECRET: secret } = getTelegramEnv();

  // Checked here (not only by grammY) so unauthenticated calls never reach Telegram's API.
  if (!safeEqual(req.headers.get(SECRET_HEADER), secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    return await getHandler(secret)(req);
  } catch (err) {
    logger.error("webhook failed", err);
    // Handler errors are caught by bot.catch; reaching here means init/timeout. Let Telegram retry.
    return new Response(null, { status: 500 });
  }
}
