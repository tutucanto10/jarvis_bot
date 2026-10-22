import { desc, eq, inArray, sql } from "drizzle-orm";
import { entries, fuelLogs, type EntryType, type Entry, type FuelLog } from "./schema";
import type { Db } from "./types";

export interface FuelInput {
  totalCents: number;
  liters?: number | null;
  odometerKm?: number | null;
}

export interface CreateEntryInput {
  type: EntryType;
  rawText: string;
  amountCents?: number | null;
  category?: string | null;
  tags?: string[];
  dueDate?: string | null;
  payload?: Record<string, unknown>;
  /** Defaults to now; settable for imports and tests. */
  createdAt?: Date;
  fuel?: FuelInput;
}

export interface EntryWithFuel {
  entry: Entry;
  fuelLog: FuelLog | null;
}

export function pricePerLiterCents(fuel: FuelInput): number | null {
  return fuel.liters ? Math.round(fuel.totalCents / fuel.liters) : null;
}

export async function createEntry(db: Db, input: CreateEntryInput): Promise<EntryWithFuel> {
  const { fuel, ...values } = input;
  const insert = db.insert(entries).values(values);

  if (!fuel) {
    const [entry] = await insert.returning();
    return { entry: required(entry), fuelLog: null };
  }

  // Single statement so entry and fuel log are saved atomically (neon-http has no transactions).
  const result = await db.execute(sql`
    with new_entry as (${insert.returning({ id: entries.id, createdAt: entries.createdAt }).getSQL()})
    insert into ${fuelLogs} (
      ${sql.identifier(fuelLogs.entryId.name)},
      ${sql.identifier(fuelLogs.totalCents.name)},
      ${sql.identifier(fuelLogs.liters.name)},
      ${sql.identifier(fuelLogs.odometerKm.name)},
      ${sql.identifier(fuelLogs.pricePerLiterCents.name)},
      ${sql.identifier(fuelLogs.createdAt.name)}
    )
    select id, ${fuel.totalCents}, ${fuel.liters ?? null}, ${fuel.odometerKm ?? null},
           ${pricePerLiterCents(fuel)}, created_at
    from new_entry
    returning ${sql.identifier(fuelLogs.entryId.name)} as id
  `);

  const id = Number(rowsOf<{ id: number }>(result)[0]?.id);
  return required(await getEntryWithFuel(db, id));
}

export async function getEntryWithFuel(db: Db, id: number): Promise<EntryWithFuel | null> {
  const [row] = await db
    .select({ entry: entries, fuelLog: fuelLogs })
    .from(entries)
    .leftJoin(fuelLogs, eq(fuelLogs.entryId, entries.id))
    .where(eq(entries.id, id));
  return row ?? null;
}

/** Deletes one entry (its fuel log goes with it via ON DELETE CASCADE). */
export async function deleteEntry(db: Db, id: number): Promise<Entry | null> {
  const [deleted] = await db.delete(entries).where(eq(entries.id, id)).returning();
  return deleted ?? null;
}

export async function deleteLastEntry(db: Db): Promise<Entry | null> {
  const last = db
    .select({ id: entries.id })
    .from(entries)
    .orderBy(desc(entries.createdAt), desc(entries.id))
    .limit(1);
  const [deleted] = await db.delete(entries).where(inArray(entries.id, last)).returning();
  return deleted ?? null;
}

function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("insert returned no row");
  return value;
}
