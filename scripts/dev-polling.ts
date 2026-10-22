/**
 * Local development via long polling. Removes the webhook first, because
 * Telegram refuses getUpdates while a webhook is set — run `pnpm webhook:set`
 * again afterwards to restore production.
 */
import { getTelegramEnv } from "../src/lib/env";
import { createBot, defaultDeps } from "../src/telegram/bot";

async function main(): Promise<void> {
  const env = getTelegramEnv();
  const bot = createBot(env.TELEGRAM_BOT_TOKEN, env.ALLOWED_CHAT_ID, defaultDeps());

  await bot.api.deleteWebhook();
  console.log("⚠️  Webhook removido. Rode `pnpm webhook:set` quando terminar.");

  process.once("SIGINT", () => void bot.stop());
  process.once("SIGTERM", () => void bot.stop());

  await bot.start({
    allowed_updates: ["message", "callback_query"],
    onStart: (me) => console.log(`🤖 @${me.username} rodando em long polling (Ctrl+C para sair)`),
  });
}

main().catch((err: unknown) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
