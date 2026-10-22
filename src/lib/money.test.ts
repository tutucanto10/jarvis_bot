import { describe, expect, it } from "vitest";
import { extractAmountCents, formatBRL, parseBRL, parseDecimalBR } from "./money";

describe("formatBRL", () => {
  it.each([
    [4000, "R$ 40,00"],
    [2350, "R$ 23,50"],
    [123456, "R$ 1.234,56"],
    [5, "R$ 0,05"],
    [0, "R$ 0,00"],
  ])("%i → %s", (cents, expected) => {
    expect(formatBRL(cents)).toBe(expected);
  });
});

describe("parseBRL", () => {
  it.each([
    ["40", 4000],
    ["23,50", 2350],
    ["23,5", 2350],
    ["23.50", 2350],
    ["R$ 1.234,56", 123456],
    ["r$1.234,56", 123456],
    ["1,234.56", 123456],
    ["1.500", 150000],
    ["1.234.567,89", 123456789],
    ["150 conto", 15000],
    ["150 contos", 15000],
    ["150 reais", 15000],
    ["R$ 40", 4000],
    ["40 pila", 4000],
    ["2 mil", 200000],
    ["1,5k", 150000],
    ["0,99", 99],
  ])("%s → %i", (input, cents) => {
    expect(parseBRL(input)).toBe(cents);
  });

  it.each(["", "abc", "0", "0,00", "1,500", "12.34.5", "1.23,45", "40,123", "-5", "40 e 50", "1,2,3"])(
    "rejects %j",
    (input) => {
      expect(parseBRL(input)).toBeNull();
    },
  );
});

describe("parseDecimalBR", () => {
  it("parses liters with comma or dot", () => {
    expect(parseDecimalBR("26")).toBe(26);
    expect(parseDecimalBR("26,5")).toBe(26.5);
    expect(parseDecimalBR("26.512")).toBe(26.512);
    expect(parseDecimalBR("0")).toBeNull();
    expect(parseDecimalBR("x")).toBeNull();
  });
});

describe("extractAmountCents", () => {
  it("finds the first amount in free text", () => {
    expect(extractAmountCents("uber 23,50 ontem")).toBe(2350);
    expect(extractAmountCents("gastei R$ 1.234,56 no mercado.")).toBe(123456);
    expect(extractAmountCents("abasteci 150 conto")).toBe(15000);
    expect(extractAmountCents("paguei 40.")).toBe(4000);
    expect(extractAmountCents("sem valor nenhum")).toBeNull();
  });
});
