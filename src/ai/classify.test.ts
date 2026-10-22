import { describe, expect, it } from "vitest";
import { normalizeClassification, type RawClassification } from "./classify";

const raw = (r: Partial<RawClassification> & Pick<RawClassification, "type">): RawClassification => ({
  amount_text: null,
  category: null,
  tags: [],
  due_date: null,
  fuel: null,
  summary: "Resumo",
  confidence: 0.9,
  ...r,
});

describe("normalizeClassification", () => {
  it("parses money deterministically", () => {
    const r = normalizeClassification(raw({ type: "gasto", amount_text: "23,50", category: "transporte" }), "uber 23,50");
    expect(r).toEqual({
      ok: true,
      value: expect.objectContaining({ type: "gasto", amount_cents: 2350, category: "transporte" }),
    });
  });

  it("rejects a spending without a parseable amount", () => {
    expect(normalizeClassification(raw({ type: "gasto", amount_text: null }), "gastei").ok).toBe(false);
    expect(normalizeClassification(raw({ type: "gasto", amount_text: "muito" }), "gastei muito").ok).toBe(false);
  });

  it("defaults the spending category to outros", () => {
    const r = normalizeClassification(raw({ type: "gasto", amount_text: "10" }), "10 em coisa");
    expect(r.ok && r.value.category).toBe("outros");
  });

  it("fills fuel fields and forces the combustível category", () => {
    const r = normalizeClassification(
      raw({
        type: "abastecimento",
        amount_text: "150 conto",
        category: "outros",
        fuel: { total_text: "150 conto", liters: 26, odometer_km: 45230 },
      }),
      "abasteci 150 conto, 26 litros, 45230 km",
    );
    expect(r).toEqual({
      ok: true,
      value: expect.objectContaining({
        amount_cents: 15000,
        category: "combustível",
        fuel: { total_cents: 15000, liters: 26, odometer_km: 45230 },
      }),
    });
  });

  it("uses amount_text when fuel is missing", () => {
    const r = normalizeClassification(raw({ type: "abastecimento", amount_text: "200" }), "abasteci 200");
    expect(r.ok && r.value.fuel).toEqual({ total_cents: 20000 });
  });

  it("adds the astro tag, cleans tags, and drops category for non-spending", () => {
    const r = normalizeClassification(
      raw({ type: "ideia", tags: ["#Camiseta", "camiseta"], category: "astro" }),
      "ideia pra ASTRO: camiseta",
    );
    expect(r.ok && r.value).toMatchObject({ tags: ["astro", "camiseta"] });
    expect(r.ok && r.value.category).toBeUndefined();
  });

  it("drops invalid due dates", () => {
    const r = normalizeClassification(raw({ type: "tarefa", due_date: "2026-02-30" }), "x");
    expect(r.ok && r.value.due_date).toBeUndefined();
  });

  it("honors the user-picked type", () => {
    const r = normalizeClassification(raw({ type: "nota", amount_text: "40" }), "40", "gasto");
    expect(r.ok && r.value).toMatchObject({ type: "gasto", amount_cents: 4000 });
  });

  it("rejects out-of-range confidence", () => {
    expect(normalizeClassification(raw({ type: "nota", confidence: 7 }), "x").ok).toBe(false);
  });
});
