import { vi } from "vitest";
import type { Message, Update, UserFromGetMe } from "grammy/types";
import type { Db } from "@/db/types";
import { createBot } from "./bot";
import type { BotDeps } from "./deps";

/** Test-only helpers: a bot whose Telegram API calls are recorded instead of sent. */
export const OWNER = 111;
const botInfo = { id: 1, is_bot: true, first_name: "Test", username: "test_bot" } as UserFromGetMe;

export type Call = { method: string; payload: Record<string, unknown> };

export function setupBot(db: Db, overrides: Partial<BotDeps> = {}) {
  const deps: BotDeps = {
    getDb: () => db,
    classify: vi.fn(),
    parseQuery: vi.fn(),
    now: () => new Date("2026-10-22T10:00:00Z"),
    timeZone: "America/Sao_Paulo",
    runBriefing: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const bot = createBot("1:fake", OWNER, deps);
  bot.botInfo = botInfo;
  const calls: Call[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: method === "sendMessage" ? { message_id: 99 } : true } as never;
  });
  const sent = () => calls.filter((c) => ["sendMessage", "editMessageText"].includes(c.method));
  return { bot, calls, sent, deps };
}

let updateId = 0;

export function textUpdate(text: string, chatId = OWNER): Update {
  const command = text.startsWith("/") ? text.split(" ")[0]! : null;
  return {
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat: { id: chatId, type: "private", first_name: "X" },
      from: { id: chatId, is_bot: false, first_name: "X" },
      text,
      ...(command && { entities: [{ type: "bot_command", offset: 0, length: command.length }] }),
    },
  } as Update;
}

export function callbackUpdate(data: string, replyToText?: string): Update {
  const chat = { id: OWNER, type: "private" as const, first_name: "X" };
  return {
    update_id: ++updateId,
    callback_query: {
      id: String(updateId),
      from: { id: OWNER, is_bot: false, first_name: "X" },
      chat_instance: "x",
      data,
      message: {
        message_id: 50,
        date: 0,
        chat,
        text: "Não entendi bem 🤔 Isso é o quê?",
        ...(replyToText && { reply_to_message: { message_id: 49, date: 0, chat, text: replyToText } as Message }),
      },
    },
  } as Update;
}

export const buttonsOf = (call: Call) =>
  ((call.payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] })
    ?.inline_keyboard ?? []).flat();
