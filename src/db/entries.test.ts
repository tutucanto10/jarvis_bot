import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, truncateAll } from "./test-db";
import { createEntry, deleteEntry, deleteLastEntry, getEntryWithFuel, pricePerLiterCents } from "./entries";
import { saveBriefing } from "./briefings";
import { fuelLogs } from "./schema";
import type { Db } from "./types";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
beforeEach(() => truncateAll(db));
afterAll(() => close());

describe("createEntry", () => {
  it("saves a spending entry with defaults", async () => {
    const { entry, fuelLog } = await createEntry(db, {
      type: "gasto",
      rawText: "gastei 40 no mercado",
      amountCents: 4000,
      category: "mercado",
    });
    expect(entry).toMatchObject({ type: "gasto", amountCents: 4000, category: "mercado", tags: [], payload: {} });
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(fuelLog).toBeNull();
  });

  it("saves an idea with tags and a task with due date", async () => {
    const idea = await createEntry(db, { type: "ideia", rawText: "ideia pra ASTRO", tags: ["astro"] });
    const task = await createEntry(db, { type: "tarefa", rawText: "pagar boleto", dueDate: "2026-10-23" });
    expect(idea.entry.tags).toEqual(["astro"]);
    expect(task.entry.dueDate).toBe("2026-10-23");
  });

  it("saves entry and fuel log together", async () => {
    const { entry, fuelLog } = await createEntry(db, {
      type: "abastecimento",
      rawText: "abasteci 150 reais, 45230 km, 26 litros",
      amountCents: 15000,
      category: "combustível",
      fuel: { totalCents: 15000, liters: 26, odometerKm: 45230 },
    });
    expect(fuelLog).toMatchObject({
      entryId: entry.id,
      totalCents: 15000,
      liters: 26,
      odometerKm: 45230,
      pricePerLiterCents: 577,
    });
  });

  it("is atomic: an invalid fuel log leaves no orphan entry", async () => {
    await expect(
      createEntry(db, { type: "abastecimento", rawText: "x", fuel: { totalCents: 0 } }),
    ).rejects.toThrow();
    expect(await deleteLastEntry(db)).toBeNull();
  });

  it("rejects a spending entry without amount", async () => {
    await expect(createEntry(db, { type: "gasto", rawText: "gastei" })).rejects.toThrow();
  });
});

describe("deleting", () => {
  it("deleteLastEntry removes the newest entry and its fuel log", async () => {
    const first = await createEntry(db, { type: "nota", rawText: "primeira" });
    const fuel = await createEntry(db, {
      type: "abastecimento",
      rawText: "abasteci 100",
      fuel: { totalCents: 10000 },
    });

    expect((await deleteLastEntry(db))?.id).toBe(fuel.entry.id);
    expect(await db.select().from(fuelLogs)).toHaveLength(0);
    expect((await deleteLastEntry(db))?.id).toBe(first.entry.id);
    expect(await deleteLastEntry(db)).toBeNull();
  });

  it("deleteEntry removes by id", async () => {
    const { entry } = await createEntry(db, { type: "nota", rawText: "x" });
    expect((await deleteEntry(db, entry.id))?.id).toBe(entry.id);
    expect(await getEntryWithFuel(db, entry.id)).toBeNull();
    expect(await deleteEntry(db, entry.id)).toBeNull();
  });
});

describe("saveBriefing", () => {
  it("stores what was sent", async () => {
    const row = await saveBriefing(db, { content: "Bom dia", hadImage: true });
    expect(row).toMatchObject({ content: "Bom dia", hadImage: true });
    expect(row.sentAt).toBeInstanceOf(Date);
  });
});

describe("pricePerLiterCents", () => {
  it("rounds total / liters and is null without liters", () => {
    expect(pricePerLiterCents({ totalCents: 15000, liters: 26 })).toBe(577);
    expect(pricePerLiterCents({ totalCents: 15000 })).toBeNull();
  });
});
