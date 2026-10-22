import { describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { isAllowedChat, onlyAllowedChat } from "./guard";

const OWNER = 123456789;

function ctxFrom(chatId: number | undefined): Context {
  return { chat: chatId === undefined ? undefined : { id: chatId } } as unknown as Context;
}

describe("isAllowedChat", () => {
  it("accepts only the owner's chat", () => {
    expect(isAllowedChat(OWNER, OWNER)).toBe(true);
    expect(isAllowedChat(987, OWNER)).toBe(false);
    expect(isAllowedChat(-OWNER, OWNER)).toBe(false);
    expect(isAllowedChat(undefined, OWNER)).toBe(false);
  });
});

describe("onlyAllowedChat middleware", () => {
  it("passes the owner's updates through", async () => {
    const next = vi.fn().mockResolvedValue(undefined);
    await onlyAllowedChat(OWNER)(ctxFrom(OWNER), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("silently drops other chats and chatless updates", async () => {
    const next = vi.fn();
    await onlyAllowedChat(OWNER)(ctxFrom(42), next);
    await onlyAllowedChat(OWNER)(ctxFrom(undefined), next);
    expect(next).not.toHaveBeenCalled();
  });
});
