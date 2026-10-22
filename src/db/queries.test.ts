import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createEntry } from "./entries";
import { countByType, findEntries, fuelSpending, latestIdeas, recentFuelLogs, spendingByCategory } from "./queries";
import { createTestDb, truncateAll } from "./test-db";
import type { Db } from "./types";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
beforeEach(async () => {
  await truncateAll(db);
  await seed();
});
afterAll(() => close());

const at = (iso: string) => new Date(iso);
const october = { from: at("2026-10-01T03:00:00Z"), to: at("2026-11-01T03:00:00Z") };

async function seed() {
  const rows = [
    { type: "gasto", rawText: "uber 23,50", amountCents: 2350, category: "transporte", createdAt: at("2026-10-05T12:00:00Z") },
    { type: "gasto", rawText: "Uber pro aeroporto", amountCents: 6000, category: "transporte", createdAt: at("2026-10-10T12:00:00Z") },
    { type: "gasto", rawText: "mercado 100", amountCents: 10000, category: "mercado", createdAt: at("2026-10-12T12:00:00Z") },
    { type: "gasto", rawText: "uber setembro", amountCents: 1000, category: "transporte", createdAt: at("2026-09-30T12:00:00Z") },
    // 31/10 23:30 local = 01/11 02:30 UTC: still October in Brasília.
    { type: "gasto", rawText: "uber 50% off", amountCents: 1500, category: "transporte", createdAt: at("2026-11-01T02:30:00Z") },
    { type: "ideia", rawText: "camiseta", tags: ["astro", "camiseta"], payload: { summary: "Camiseta X" }, createdAt: at("2026-10-02T12:00:00Z") },
    { type: "ideia", rawText: "app", tags: ["dev"], createdAt: at("2026-10-03T12:00:00Z") },
    { type: "tarefa", rawText: "pagar boleto", createdAt: at("2026-10-04T12:00:00Z") },
  ] as const;
  for (const r of rows) await createEntry(db, { ...r, tags: "tags" in r ? [...r.tags] : [] });

  await createEntry(db, {
    type: "abastecimento", rawText: "abasteci 150", amountCents: 15000, category: "combustível",
    fuel: { totalCents: 15000, liters: 26, odometerKm: 45230 }, createdAt: at("2026-10-15T12:00:00Z"),
  });
}

describe("spendingByCategory", () => {
  it("groups spending and fuel by category, biggest first, within the range", async () => {
    expect(await spendingByCategory(db, october)).toEqual([
      { category: "combustível", totalCents: 15000, count: 1 },
      { category: "mercado", totalCents: 10000, count: 1 },
      { category: "transporte", totalCents: 9850, count: 3 },
    ]);
  });
});

describe("countByType", () => {
  it("counts each type", async () => {
    expect(await countByType(db, october)).toEqual({ gasto: 4, ideia: 2, tarefa: 1, abastecimento: 1 });
  });
});

describe("latestIdeas", () => {
  it("returns newest first, optionally by tag", async () => {
    expect((await latestIdeas(db)).map((e) => e.rawText)).toEqual(["app", "camiseta"]);
    expect((await latestIdeas(db, { tag: "astro" })).map((e) => e.rawText)).toEqual(["camiseta"]);
    expect(await latestIdeas(db, { tag: "nada" })).toEqual([]);
  });
});

describe("fuel", () => {
  it("lists logs and sums the month", async () => {
    expect((await recentFuelLogs(db, 5))[0]).toMatchObject({ totalCents: 15000, odometerKm: 45230 });
    expect(await fuelSpending(db, october)).toEqual({ totalCents: 15000, count: 1 });
  });
});

describe("findEntries", () => {
  it("filters by text (case-insensitive), type and period", async () => {
    const result = await findEntries(db, { types: ["gasto"], search: "uber", range: october });
    expect(result.totalCents).toBe(2350 + 6000 + 1500);
    expect(result.count).toBe(3);
    expect(result.items[0]!.rawText).toBe("uber 50% off");
  });

  it("treats LIKE wildcards in the search as literal text", async () => {
    expect((await findEntries(db, { search: "50%" })).count).toBe(1);
    expect((await findEntries(db, { search: "%" })).count).toBe(1);
    expect((await findEntries(db, { search: "_" })).count).toBe(0);
  });

  it("searches the summary and filters by category and tag", async () => {
    expect((await findEntries(db, { search: "camiseta x" })).count).toBe(1);
    expect((await findEntries(db, { categories: ["mercado"] })).totalCents).toBe(10000);
    expect((await findEntries(db, { tags: ["astro"] })).count).toBe(1);
  });

  it("limits items but not totals", async () => {
    const result = await findEntries(db, { types: ["gasto"] }, 2);
    expect(result.items).toHaveLength(2);
    expect(result.count).toBe(5);
  });
});
