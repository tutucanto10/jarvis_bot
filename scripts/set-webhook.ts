/**
 * Usage: pnpm webhook:set [https://seu-app.vercel.app]
 * Falls back to APP_URL from .env when no argument is given.
 */
import { Api } from "grammy";
import { getTelegramEnv } from "../src/lib/env";

async function main(): Promise<void> {
  const env = getTelegramEnv();
  const baseUrl = process.argv[2] ?? process.env.APP_URL;
  if (!baseUrl) throw new Error("Passe a URL: pnpm webhook:set https://seu-app.vercel.app (ou defina APP_URL)");

  const url = new URL("/api/telegram", baseUrl);
  if (url.protocol !== "https:") throw new Error("O Telegram exige HTTPS no webhook");

  const api = new Api(env.TELEGRAM_BOT_TOKEN);
  await api.setWebhook(url.toString(), {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });

  await api.setMyCommands([
    { command: "resumo", description: "Resumo da semana (ou: /resumo mes)" },
    { command: "gastos", description: "Gastos do mês por categoria" },
    { command: "ideias", description: "Últimas ideias (ou: /ideias astro)" },
    { command: "abastecimentos", description: "Abastecimentos e km/l" },
    { command: "briefing", description: "Briefing do dia agora" },
    { command: "desfazer", description: "Apaga o último registro" },
    { command: "ajuda", description: "Como usar" },
  ]);

  const info = await api.getWebhookInfo();
  console.log(`✅ Webhook configurado: ${info.url}`);
  console.log(`   pendentes: ${info.pending_update_count}`);
  if (info.last_error_message) console.log(`   último erro: ${info.last_error_message}`);
}

main().catch((err: unknown) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
