import type { Bot } from "grammy";
import { looksLikeQuestion } from "@/ai/query";
import { logger } from "@/lib/logger";
import { handleCapture, handlePick, handleUndo, handleUndoLast, PICKABLE_TYPES } from "./capture";
import type { BotDeps } from "./deps";
import { handleFuel, handleIdeas, handleQuestion, handleSpending, handleSummary } from "./queries";
import { texts } from "./texts";

export function registerHandlers(bot: Bot, deps: BotDeps): void {
  bot.command("start", (ctx) => ctx.reply(texts.start));
  bot.command("ajuda", (ctx) => ctx.reply(texts.help, { parse_mode: "HTML" }));
  bot.command("desfazer", (ctx) => handleUndoLast(ctx, deps));
  bot.command("resumo", (ctx) => handleSummary(ctx, deps, ctx.match));
  bot.command("gastos", (ctx) => handleSpending(ctx, deps));
  bot.command("ideias", (ctx) => handleIdeas(ctx, deps, ctx.match));
  bot.command("abastecimentos", (ctx) => handleFuel(ctx, deps));
  bot.command("briefing", async (ctx) => {
    await ctx.reply(texts.briefingStarting);
    try {
      await deps.runBriefing(ctx.api);
    } catch (err) {
      logger.error("manual briefing failed", err);
      await ctx.reply(texts.briefingError);
    }
  });

  bot.callbackQuery(new RegExp(`^pick:(${PICKABLE_TYPES.join("|")})$`), (ctx) =>
    handlePick(ctx, deps, ctx.match[1] as (typeof PICKABLE_TYPES)[number]),
  );
  bot.callbackQuery(/^undo:(\d+)$/, (ctx) => handleUndo(ctx, deps, Number(ctx.match[1])));
  bot.on("callback_query:data", (ctx) => ctx.answerCallbackQuery());

  bot.on("message:text", (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return ctx.reply(texts.unknownCommand);
    if (looksLikeQuestion(text)) return handleQuestion(ctx, deps, text);
    return handleCapture(ctx, deps, text);
  });
}
