import { describe, expect, it, vi } from "vitest";

describe("getTelegramEnv", () => {
  it("strips characters Telegram rejects from generated webhook secrets", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:ABC-def_ghi");
    vi.stubEnv("ALLOWED_CHAT_ID", "111");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "q8+/Zx9k=Lm2Pp4Rr7Tt/Vv1Ww3Yy5==");
    const { getTelegramEnv } = await import("./env");
    expect(getTelegramEnv().TELEGRAM_WEBHOOK_SECRET).toBe("q8Zx9kLm2Pp4Rr7TtVv1Ww3Yy5");
    vi.unstubAllEnvs();
  });
});

describe("getAiEnv", () => {
  const load = async (env: Record<string, string>) => {
    vi.resetModules();
    for (const key of ["AI_PROVIDER", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_MODEL"]) vi.stubEnv(key, undefined as never);
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { getAiEnv } = await import("./env");
    try {
      return getAiEnv();
    } finally {
      vi.unstubAllEnvs();
    }
  };

  it("prefers Gemini when its key is set", async () => {
    expect(await load({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" })).toMatchObject({ AI_PROVIDER: "gemini", GEMINI_MODEL: "gemini-2.5-flash" });
    expect(await load({ ANTHROPIC_API_KEY: "a" })).toMatchObject({ AI_PROVIDER: "anthropic" });
    expect(await load({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", AI_PROVIDER: "anthropic" })).toMatchObject({ AI_PROVIDER: "anthropic" });
  });

  it("fails clearly when the selected provider has no key", async () => {
    await expect(load({})).rejects.toThrow(/GEMINI_API_KEY/);
    await expect(load({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a" })).rejects.toThrow(/GEMINI_API_KEY/);
  });
});
