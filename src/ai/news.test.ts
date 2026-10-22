import { describe, expect, it } from "vitest";
import { firstHeadlines, validatePicks } from "./news";

describe("validatePicks", () => {
  it("keeps valid, unique picks pointing at real headlines, max 3", () => {
    expect(
      validatePicks(
        [
          { index: 0, line: "  Câmara aprova reforma   tributária. " },
          { index: 0, line: "Repetida do mesmo índice" },
          { index: 9, line: "Índice que não existe na lista" },
          { index: 1.5, line: "Índice quebrado não vale nada" },
          { index: 2, line: "curta" },
          { index: 3, line: "Dólar fecha em queda com dados dos EUA" },
          { index: 4, line: "Chuva forte atinge o Rio nesta quinta" },
          { index: 1, line: "Quarta escolha ignorada pelo limite" },
        ],
        5,
      ),
    ).toEqual([
      "Câmara aprova reforma tributária",
      "Dólar fecha em queda com dados dos EUA",
      "Chuva forte atinge o Rio nesta quinta",
    ]);
  });
});

describe("firstHeadlines", () => {
  it("uses raw titles when the AI is unavailable", () => {
    const h = (title: string) => ({ title, source: "g1", publishedAt: null });
    expect(firstHeadlines({ brasilMundo: [h("a"), h("b"), h("c"), h("d")], esportes: [h("e")] })).toEqual({
      brasilMundo: ["a", "b", "c"],
      esportes: ["e"],
    });
  });
});
