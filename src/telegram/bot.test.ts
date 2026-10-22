import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Classification, ClassifyOutcome } from "@/ai/classify";
import { createTestDb, truncateAll } from "@/db/test-db";
import { entries, fuelLogs } from "@/db/schema";
import type { Db } from "@/db/types";
import type { BotDeps } from "./deps";
import { buttonsOf, callbackUpdate, setupBot, textUpdate } from "./test-utils";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
beforeEach(() => truncateAll(db));
afterAll(() => close());

const setup = (classify: BotDeps["classify"] = vi.fn()) => setupBot(db, { classify });

const ok = (c: Partial<Classification> & Pick<Classification, "type">): ClassifyOutcome => ({
  status: "ok",
  classification: { tags: [], summary: "x", confidence: 0.95, ...c },
});

describe("access control", () => {
  it("ignores other chats completely", async () => {
    const classify = vi.fn();
    const { bot, calls } = setup(classify);
    await bot.handleUpdate(textUpdate("gastei 40 no mercado", 999));
    await bot.handleUpdate(textUpdate("/desfazer", 999));
    expect(calls).toHaveLength(0);
    expect(classify).not.toHaveBeenCalled();
  });
});

describe("commands", () => {
  it("answers /start, /ajuda and unknown commands without calling the AI", async () => {
    const classify = vi.fn();
    const { bot, sent } = setup(classify);
    await bot.handleUpdate(textUpdate("/start"));
    await bot.handleUpdate(textUpdate("/ajuda"));
    await bot.handleUpdate(textUpdate("/xyz"));
    expect(sent()).toHaveLength(3);
    expect(sent()[2]!.payload.text).toContain("Não conheço");
    expect(classify).not.toHaveBeenCalled();
  });
});

describe("capture", () => {
  it("saves a spending and confirms with an undo button", async () => {
    const { bot, sent } = setup(
      vi.fn().mockResolvedValue(ok({ type: "gasto", amount_cents: 4000, category: "mercado", summary: "Mercado" })),
    );
    await bot.handleUpdate(textUpdate("gastei 40 no mercado"));

    const [row] = await db.select().from(entries);
    expect(row).toMatchObject({ type: "gasto", amountCents: 4000, category: "mercado", rawText: "gastei 40 no mercado" });
    expect(row!.payload).toMatchObject({ summary: "Mercado", confidence: 0.95 });

    const reply = sent()[0]!;
    expect(reply.payload.text).toBe("✅ Gasto: R$ 40,00 · mercado");
    expect(buttonsOf(reply)).toEqual([{ text: "Desfazer", callback_data: `undo:${row!.id}` }]);
  });

  it("saves a fuel log with price per liter", async () => {
    const { bot, sent } = setup(
      vi.fn().mockResolvedValue(
        ok({
          type: "abastecimento",
          amount_cents: 15000,
          category: "combustível",
          fuel: { total_cents: 15000, liters: 26, odometer_km: 45230 },
        }),
      ),
    );
    await bot.handleUpdate(textUpdate("abasteci 150 reais, 45230 km, 26 litros"));
    expect(await db.select().from(fuelLogs)).toHaveLength(1);
    expect(sent()[0]!.payload.text).toBe("✅ Abastecimento: R$ 150,00 · 26 L · R$ 5,77/L · 45.230 km");
  });

  it("shows tags and due dates", async () => {
    const classify = vi
      .fn()
      .mockResolvedValueOnce(ok({ type: "ideia", tags: ["astro"], summary: "Camiseta com estampa X" }))
      .mockResolvedValueOnce(ok({ type: "tarefa", due_date: "2026-10-23", summary: "Pagar o boleto" }));
    const { bot, sent } = setup(classify);
    await bot.handleUpdate(textUpdate("ideia astro: camiseta com estampa X"));
    await bot.handleUpdate(textUpdate("lembrar de pagar o boleto sexta"));
    expect(sent().map((c) => c.payload.text)).toEqual([
      "✅ Ideia: Camiseta com estampa X · #astro",
      "✅ Tarefa: Pagar o boleto · sexta, 23/10",
    ]);
  });

  it("asks with buttons instead of guessing when unsure", async () => {
    const { bot, sent } = setup(vi.fn().mockResolvedValue({ status: "unsure", reason: "low confidence" }));
    const update = textUpdate("40");
    await bot.handleUpdate(update);

    expect(await db.select().from(entries)).toHaveLength(0);
    const question = sent()[0]!;
    expect(question.payload.text).toContain("Não entendi");
    expect(question.payload.reply_parameters).toEqual({ message_id: update.message!.message_id });
    expect(buttonsOf(question).map((b) => b.callback_data)).toEqual([
      "pick:gasto",
      "pick:ideia",
      "pick:tarefa",
      "pick:nota",
    ]);
  });

  it("says it couldn't save when the AI or the DB fails", async () => {
    const { bot, sent } = setup(vi.fn().mockRejectedValue(new Error("529 overloaded")));
    await bot.handleUpdate(textUpdate("gastei 40"));
    expect(sent()[0]!.payload.text).toBe("não consegui salvar agora, tenta de novo");

    const failingDb = setup(vi.fn().mockResolvedValue(ok({ type: "nota" })));
    failingDb.deps.getDb = () => {
      throw new Error("db down");
    };
    await failingDb.bot.handleUpdate(textUpdate("anota isso"));
    expect(failingDb.sent()[0]!.payload.text).toBe("não consegui salvar agora, tenta de novo");
  });
});

describe("type buttons", () => {
  it("re-classifies with the picked type and edits the question into a confirmation", async () => {
    const classify = vi.fn().mockResolvedValue(ok({ type: "gasto", amount_cents: 4000, category: "outros" }));
    const { bot, calls } = setup(classify);
    await bot.handleUpdate(callbackUpdate("pick:gasto", "40"));

    expect(classify).toHaveBeenCalledWith("40", expect.objectContaining({ forcedType: "gasto" }));
    const edit = calls.find((c) => c.method === "editMessageText")!;
    expect(edit.payload.text).toBe("✅ Gasto: R$ 40,00 · outros");
    expect(calls.some((c) => c.method === "answerCallbackQuery")).toBe(true);
  });

  it("falls back to a local entry when the AI is down", async () => {
    const { bot, calls } = setup(vi.fn().mockRejectedValue(new Error("down")));
    await bot.handleUpdate(callbackUpdate("pick:ideia", "ideia astro boné"));
    await bot.handleUpdate(callbackUpdate("pick:gasto", "uber 23,50"));
    await bot.handleUpdate(callbackUpdate("pick:gasto", "uber"));

    const rows = await db.select().from(entries).orderBy(entries.id);
    expect(rows.map((r) => [r.type, r.amountCents, r.tags])).toEqual([
      ["ideia", null, ["astro"]],
      ["gasto", 2350, []],
    ]);
    const edits = calls.filter((c) => c.method === "editMessageText").map((c) => c.payload.text);
    expect(edits[2]).toContain("Não achei o valor");
  });

  it("asks to resend when the original message isn't available", async () => {
    const { bot, calls } = setup();
    await bot.handleUpdate(callbackUpdate("pick:nota"));
    const answer = calls.find((c) => c.method === "answerCallbackQuery")!;
    expect(answer.payload.text).toContain("manda de novo");
  });
});

describe("undo", () => {
  it("the button deletes that entry, and a second tap is harmless", async () => {
    const { bot, calls } = setup(vi.fn().mockResolvedValue(ok({ type: "gasto", amount_cents: 4000, category: "mercado" })));
    await bot.handleUpdate(textUpdate("gastei 40 no mercado"));
    const [row] = await db.select().from(entries);

    await bot.handleUpdate(callbackUpdate(`undo:${row!.id}`));
    expect(await db.select().from(entries)).toHaveLength(0);
    expect(calls.find((c) => c.method === "editMessageText")!.payload.text).toBe(
      "↩️ Desfeito: Gasto: R$ 40,00 · mercado",
    );

    await bot.handleUpdate(callbackUpdate(`undo:${row!.id}`));
    expect(calls.filter((c) => c.method === "answerCallbackQuery").at(-1)!.payload.text).toContain("já tinha");
  });

  it("/desfazer deletes the latest entry", async () => {
    const classify = vi
      .fn()
      .mockResolvedValueOnce(ok({ type: "nota", summary: "Primeira" }))
      .mockResolvedValueOnce(ok({ type: "nota", summary: "Segunda" }));
    const { bot, sent } = setup(classify);
    await bot.handleUpdate(textUpdate("primeira"));
    await bot.handleUpdate(textUpdate("segunda"));
    await bot.handleUpdate(textUpdate("/desfazer"));
    await bot.handleUpdate(textUpdate("/desfazer"));
    await bot.handleUpdate(textUpdate("/desfazer"));

    expect(sent().slice(2).map((c) => c.payload.text)).toEqual([
      "↩️ Desfeito: Nota: Segunda",
      "↩️ Desfeito: Nota: Primeira",
      "Não tem nada pra desfazer.",
    ]);
  });
});
