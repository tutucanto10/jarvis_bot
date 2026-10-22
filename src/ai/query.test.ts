import { describe, expect, it } from "vitest";
import { looksLikeQuestion, toStructuredQuery, type RawQuery } from "./query";

const now = new Date("2026-10-22T10:00:00Z");
const tz = "America/Sao_Paulo";

const raw = (r: Partial<RawQuery>): RawQuery => ({
  intent: "total",
  types: [],
  categories: [],
  tags: [],
  search: null,
  period: { preset: "all", month: null, year: null, from: null, to: null },
  understood: true,
  ...r,
});

describe("toStructuredQuery", () => {
  it("builds a filter for 'quanto gastei com uber em outubro'", () => {
    const r = toStructuredQuery(
      raw({
        types: ["gasto", "abastecimento"],
        search: " uber ",
        period: { preset: "month", month: 10, year: null, from: null, to: null },
      }),
      now,
      tz,
    );
    expect(r).toEqual({
      ok: true,
      value: expect.objectContaining({
        intent: "total",
        filter: {
          types: ["gasto", "abastecimento"],
          categories: undefined,
          tags: undefined,
          search: "uber",
          range: { from: new Date("2026-10-01T03:00:00Z"), to: new Date("2026-11-01T03:00:00Z") },
        },
      }),
    });
  });

  it("'all' means no date range", () => {
    const r = toStructuredQuery(raw({ intent: "list", tags: ["#Astro"] }), now, tz);
    expect(r.ok && r.value.filter).toMatchObject({ tags: ["astro"], range: undefined });
  });

  it("rejects invalid periods and questions it didn't understand", () => {
    const bad = (period: Partial<RawQuery["period"]>) =>
      toStructuredQuery(raw({ period: { preset: "month", month: null, year: null, from: null, to: null, ...period } }), now, tz).ok;
    expect(bad({ month: 13 })).toBe(false);
    expect(bad({ month: 0 })).toBe(false);
    expect(bad({ month: 5, year: 1999 })).toBe(false);
    expect(bad({ preset: "custom", from: "2026-10-10", to: "2026-10-01" })).toBe(false);
    expect(bad({ preset: "custom", from: "2026-02-30", to: "2026-03-01" })).toBe(false);
    expect(toStructuredQuery(raw({ understood: false }), now, tz).ok).toBe(false);
  });
});

describe("looksLikeQuestion", () => {
  it.each([
    ["quanto gastei com uber em outubro?", true],
    ["Quanto gastei semana passada", true],
    ["quais ideias da astro", true],
    ["cadê a senha do wifi", true],
    ["o que eu anotei sobre o carro", true],
    ["gastei 40 no mercado", false],
    ["lembrar de ver quanto custa o pneu", false],
    ["ideia pra ASTRO: camiseta", false],
  ])("%s → %s", (text, expected) => {
    expect(looksLikeQuestion(text)).toBe(expected);
  });
});
