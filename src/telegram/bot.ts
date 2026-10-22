import { Bot } from "grammy";
import { classify } from "@/ai/classify";
import { parseQuery } from "@/ai/query";
import { defaultBriefingDeps, runBriefing } from "@/briefing/run";
import { getDb } from "@/db/client";
import { getAppEnv, getTelegramEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { BotDeps } from "./deps";
import { onlyAllowedChat } from "./guard";
import { registerHandlers } from "./handlers";
import { texts } from "./texts";

export function createBot(token: string, allowedChatId: number, deps: BotDeps): Bot {
  const bot = new Bot(token);

  bot.use(onlyAllowedChat(allowedChatId));
  registerHandlers(bot, deps);

  bot.catch(async (err) => {
    logger.error("bot handler failed", err.error, {
      updateId: err.ctx.update.update_id,
    });
    // Never stay silent: tell the owner something went wrong.
    await err.ctx.reply(texts.error).catch(() => undefined);
  });

  return bot;
}

export function defaultDeps(): BotDeps {
  return {
    getDb,
    classify,
    parseQuery,
    now: () => new Date(),
    timeZone: getAppEnv().TZ_USER,
    runBriefing: (api) => runBriefing(defaultBriefingDeps(api)),
  };
}

let bot: Bot | undefined;

/** One bot per serverless instance, reused across warm invocations. */
export function getBot(): Bot {
  if (!bot) {
    const env = getTelegramEnv();
    bot = createBot(env.TELEGRAM_BOT_TOKEN, env.ALLOWED_CHAT_ID, defaultDeps());
  }
  return bot;
}
