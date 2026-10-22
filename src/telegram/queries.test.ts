import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryOutcome } from "@/ai/query";
import { createEntry, type CreateEntryInput } from "@/db/entries";
import { createTestDb, truncateAll } from "@/db/test-db";
import type { Db } from "@/db/types";
import { setupBot, textUpdate } from "./test-utils";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
beforeEach(() => truncateAll(db));
afterAll(() => close());

// "now" in setupBot is Thursday 22/10/2026 07:00 BRT; the week started Monday 19/10.
const at = (iso: string) => new Date(iso);
const add = (e: Omit<CreateEntryInput, "rawText"> & { rawText?: string }) =>
  createEntry(db, { rawText: e.rawText ?? "x", ...e });

async function reply(text: string, overrides = {}) {
  const { bot, sent } = setupBot(db, overrides);
  await bot.handleUpdate(textUpdate(text));
  const [message] = sent();
  return { text: message?.payload.text as string, payload: message?.payload, count: sent().length };
}

describe("/resumo", () => {
  beforeEach(async () => {
    await add({ type: "gasto", amountCents: 4000, category: "mercado", createdAt: at("2026-10-20T12:00:00Z") });
    await add({ type: "gasto", amountCents: 2350, category: "transporte", createdAt: at("2026-10-21T12:00:00Z") });
    await add({ type: "gasto", amountCents: 1000, category: "lazer", createdAt: at("2026-10-21T13:00:00Z") });
    await add({ type: "gasto", amountCents: 500, category: "outros", createdAt: at("2026-10-21T14:00:00Z") });
    await add({ type: "gasto", amountCents: 9900, category: "contas", createdAt: at("2026-10-05T12:00:00Z") });
    await add({ type: "ideia", createdAt: at("2026-10-21T12:00:00Z") });
    await add({ type: "tarefa", createdAt: at("2026-10-21T12:00:00Z") });
    await add({ type: "tarefa", createdAt: at("2026-10-21T12:00:00Z") });
  });

  it("defaults to this week with the top 3 categories", async () => {
    const { text, payload } = await reply("/resumo");
    expect(payload!.parse_mode).toBe("HTML");
    expect(text).toBe(
      [
        "📊 <b>Resumo da semana</b> · 19/10 – 22/10",
        "",
        "💸 Total gasto: <b>R$ 78,50</b>",
        "• mercado — R$ 40,00",
        "• transporte — R$ 23,50",
        "• lazer — R$ 10,00",
        "",
        "💡 1 ideia · ✅ 2 tarefas",
      ].join("\n"),
    );
  });

  it("/resumo mes covers the month", async () => {
    const { text } = await reply("/resumo mes");
    expect(text).toContain("<b>Resumo de outubro</b> · 01/10 – 22/10");
    expect(text).toContain("R$ 177,50");
    expect(text).toContain("• contas — R$ 99,00");
  });

  it("explains usage for an unknown period", async () => {
    expect((await reply("/resumo ano")).text).toContain("/resumo mes");
  });
});

describe("/gastos", () => {
  it("lists every category of the month with share and total", async () => {
    await add({ type: "gasto", amountCents: 7500, category: "mercado", createdAt: at("2026-10-02T12:00:00Z") });
    await add({ type: "gasto", amountCents: 2500, category: "transporte", createdAt: at("2026-10-03T12:00:00Z") });
    await add({ type: "gasto", amountCents: 99999, category: "lazer", createdAt: at("2026-09-30T12:00:00Z") });
    expect((await reply("/gastos")).text).toBe(
      [
        "💸 <b>Gastos de outubro</b> · 01/10 – 22/10",
        "",
        "• mercado — R$ 75,00 (75%)",
        "• transporte — R$ 25,00 (25%)",
        "",
        "<b>Total: R$ 100,00</b>",
      ].join("\n"),
    );
  });

  it("says when there is nothing yet", async () => {
    expect((await reply("/gastos")).text).toBe("Nenhum gasto em outubro ainda. 🙌");
  });
});

describe("/ideias", () => {
  it("lists the latest ideas, filtered by tag, escaping HTML", async () => {
    await add({ type: "ideia", tags: ["astro"], payload: { summary: "Camiseta <estampa> & boné" }, createdAt: at("2026-10-20T12:00:00Z") });
    await add({ type: "ideia", tags: ["dev"], payload: { summary: "App de treino" }, createdAt: at("2026-10-21T12:00:00Z") });

    expect((await reply("/ideias")).text).toBe(
      [
        "💡 <b>Últimas ideias</b>",
        "",
        "• 21/10 — App de treino · #dev",
        "• 20/10 — Camiseta &lt;estampa&gt; &amp; boné · #astro",
      ].join("\n"),
    );
    expect((await reply("/ideias #ASTRO")).text).toContain("Camiseta");
    expect((await reply("/ideias astro")).text).not.toContain("App de treino");
    expect((await reply("/ideias nada")).text).toContain("Nenhuma ideia com essa tag");
  });
});

describe("/abastecimentos", () => {
  it("shows km/l between fill-ups and the month's fuel spending", async () => {
    const fill = (totalCents: number, liters: number, odometerKm: number, iso: string) =>
      add({ type: "abastecimento", amountCents: totalCents, category: "combustível", fuel: { totalCents, liters, odometerKm }, createdAt: at(iso) });
    await fill(15000, 30, 45000, "2026-09-20T12:00:00Z");
    await fill(12500, 25, 45300, "2026-10-05T12:00:00Z");
    await fill(15000, 26, 45600, "2026-10-20T12:00:00Z");

    expect((await reply("/abastecimentos")).text).toBe(
      [
        "⛽ <b>Abastecimentos</b>",
        "",
        "• 20/10 — R$ 150,00 · 26 L · R$ 5,77/L · 45.600 km · <b>11,5 km/l</b>",
        "• 05/10 — R$ 125,00 · 25 L · R$ 5,00/L · 45.300 km · <b>12,0 km/l</b>",
        "• 20/09 — R$ 150,00 · 30 L · R$ 5,00/L · 45.000 km",
        "",
        "Média: <b>11,8 km/l</b>",
        "Combustível em outubro: <b>R$ 275,00</b> (2 abastecimentos)",
      ].join("\n"),
    );
  });

  it("says when there is nothing yet", async () => {
    expect((await reply("/abastecimentos")).text).toContain("Nenhum abastecimento");
  });
});

describe("natural-language questions", () => {
  const uberInOctober: QueryOutcome = {
    status: "ok",
    query: {
      intent: "total",
      period: { preset: "month", month: 10, year: null, from: null, to: null },
      filter: {
        types: ["gasto", "abastecimento"],
        search: "uber",
        range: { from: at("2026-10-01T03:00:00Z"), to: at("2026-11-01T03:00:00Z") },
      },
    },
  };

  beforeEach(async () => {
    await add({ type: "gasto", rawText: "uber 23,50", amountCents: 2350, category: "transporte", payload: { summary: "Uber" }, createdAt: at("2026-10-05T12:00:00Z") });
    await add({ type: "gasto", rawText: "uber aeroporto", amountCents: 6000, category: "transporte", payload: { summary: "Uber aeroporto" }, createdAt: at("2026-10-10T12:00:00Z") });
    await add({ type: "gasto", rawText: "uber setembro", amountCents: 1000, category: "transporte", createdAt: at("2026-09-10T12:00:00Z") });
  });

  it("answers from the structured filter, never from AI-written SQL", async () => {
    const parseQuery = vi.fn().mockResolvedValue(uberInOctober);
    const classify = vi.fn();
    const { text } = await reply("quanto gastei com uber em outubro?", { parseQuery, classify });

    expect(classify).not.toHaveBeenCalled();
    expect(parseQuery).toHaveBeenCalledWith("quanto gastei com uber em outubro?", expect.anything());
    expect(text).toBe(
      [
        "💸 <b>R$ 83,50</b> com “uber” em outubro · 2 registros",
        "",
        "• 10/10 — R$ 60,00 · transporte",
        "• 05/10 — R$ 23,50 · transporte",
      ].join("\n"),
    );
  });

  it("says when nothing matched", async () => {
    const empty: QueryOutcome = { ...uberInOctober, query: { ...uberInOctober.query, filter: { search: "netflix" } } };
    const { text } = await reply("quanto gastei com netflix?", { parseQuery: vi.fn().mockResolvedValue(empty) });
    expect(text).toBe("🔎 Não achei nada com “netflix” em outubro.");
  });

  it("asks to rephrase when the question isn't understood", async () => {
    const { text } = await reply("qual o sentido da vida?", {
      parseQuery: vi.fn().mockResolvedValue({ status: "unsure", reason: "not understood" }),
    });
    expect(text).toContain("Não entendi a pergunta");
  });

  it("never stays silent when the AI or the DB fails", async () => {
    const aiDown = await reply("quanto gastei?", { parseQuery: vi.fn().mockRejectedValue(new Error("down")) });
    expect(aiDown.text).toBe("não consegui consultar agora, tenta de novo");

    const dbDown = await reply("quanto gastei?", {
      parseQuery: vi.fn().mockResolvedValue(uberInOctober),
      getDb: () => {
        throw new Error("db down");
      },
    });
    expect(dbDown.text).toBe("não consegui consultar agora, tenta de novo");
  });
});

describe("/briefing", () => {
  it("runs the briefing on demand", async () => {
    const runBriefing = vi.fn().mockResolvedValue(undefined);
    const { bot, sent } = setupBot(db, { runBriefing });
    await bot.handleUpdate(textUpdate("/briefing"));
    expect(runBriefing).toHaveBeenCalledOnce();
    expect(sent()[0]!.payload.text).toContain("Montando o briefing");
  });

  it("tells the owner when it fails", async () => {
    const { bot, sent } = setupBot(db, { runBriefing: vi.fn().mockRejectedValue(new Error("boom")) });
    await bot.handleUpdate(textUpdate("/briefing"));
    expect(sent().at(-1)!.payload.text).toBe("não consegui montar o briefing agora, tenta de novo");
  });
});
