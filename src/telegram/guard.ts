import type { Context, MiddlewareFn } from "grammy";

export function isAllowedChat(chatId: number | undefined, allowedChatId: number): boolean {
  return chatId !== undefined && chatId === allowedChatId;
}

/** Drops every update that does not come from the owner's chat, without replying. */
export function onlyAllowedChat(allowedChatId: number): MiddlewareFn<Context> {
  return async (ctx, next) => {
    if (!isAllowedChat(ctx.chat?.id, allowedChatId)) return;
    await next();
  };
}
