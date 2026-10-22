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
