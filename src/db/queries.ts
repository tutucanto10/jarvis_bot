import { and, arrayOverlaps, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { DateRange } from "@/lib/periods";
import { entries, fuelLogs, type Entry, type EntryType, type FuelLog } from "./schema";
import type { Db } from "./types";

/** Structured filter — the only way natural-language questions reach the database. */
export interface EntryFilter {
  types?: EntryType[];
  categories?: string[];
  tags?: string[];
  search?: string;
  range?: DateRange;
}

const SPENDING_TYPES: EntryType[] = ["gasto", "abastecimento"];

const totalCents = sql<number>`coalesce(sum(${entries.amountCents}), 0)`.mapWith(Number);

function inRange(range: DateRange): SQL {
  return and(gte(entries.createdAt, range.from), lt(entries.createdAt, range.to))!;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

function filterConditions(filter: EntryFilter): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    filter.types?.length ? inArray(entries.type, filter.types) : undefined,
    filter.categories?.length ? inArray(entries.category, filter.categories) : undefined,
    filter.tags?.length ? arrayOverlaps(entries.tags, filter.tags) : undefined,
    filter.range ? inRange(filter.range) : undefined,
  ];
  if (filter.search) {
    const pattern = `%${escapeLike(filter.search)}%`;
    conditions.push(or(ilike(entries.rawText, pattern), ilike(sql`${entries.payload}->>'summary'`, pattern)));
  }
  return and(...conditions);
}

export interface CategoryTotal {
  category: string;
  totalCents: number;
  count: number;
}

/** Spending (gastos + abastecimentos) grouped by category, biggest first. */
export async function spendingByCategory(db: Db, range: DateRange): Promise<CategoryTotal[]> {
  const rows = await db
    .select({ category: entries.category, totalCents, count: count() })
    .from(entries)
    .where(and(inArray(entries.type, SPENDING_TYPES), inRange(range)))
    .groupBy(entries.category)
    .orderBy(desc(totalCents));
  return rows.map((r) => ({ ...r, category: r.category ?? "outros" }));
}

export async function countByType(db: Db, range: DateRange): Promise<Partial<Record<EntryType, number>>> {
  const rows = await db
    .select({ type: entries.type, count: count() })
    .from(entries)
    .where(inRange(range))
    .groupBy(entries.type);
  return Object.fromEntries(rows.map((r) => [r.type, r.count]));
}

export async function latestIdeas(db: Db, options: { tag?: string; limit?: number } = {}): Promise<Entry[]> {
  return db
    .select()
    .from(entries)
    .where(
      and(eq(entries.type, "ideia"), options.tag ? arrayOverlaps(entries.tags, [options.tag]) : undefined),
    )
    .orderBy(desc(entries.createdAt), desc(entries.id))
    .limit(options.limit ?? 15);
}

/** Newest first. */
export async function recentFuelLogs(db: Db, limit: number): Promise<FuelLog[]> {
  return db.select().from(fuelLogs).orderBy(desc(fuelLogs.createdAt), desc(fuelLogs.id)).limit(limit);
}

export async function fuelSpending(db: Db, range: DateRange): Promise<{ totalCents: number; count: number }> {
  const [row] = await db
    .select({ totalCents: sql<number>`coalesce(sum(${fuelLogs.totalCents}), 0)`.mapWith(Number), count: count() })
    .from(fuelLogs)
    .where(and(gte(fuelLogs.createdAt, range.from), lt(fuelLogs.createdAt, range.to)));
  return row ?? { totalCents: 0, count: 0 };
}

export interface FindResult {
  totalCents: number;
  count: number;
  items: Entry[];
}

/** Totals over every match plus the newest `limit` rows. */
export async function findEntries(db: Db, filter: EntryFilter, limit = 10): Promise<FindResult> {
  const where = filterConditions(filter);
  const [totals, items] = await Promise.all([
    db.select({ totalCents, count: count() }).from(entries).where(where),
    db.select().from(entries).where(where).orderBy(desc(entries.createdAt), desc(entries.id)).limit(limit),
  ]);
  return { totalCents: totals[0]?.totalCents ?? 0, count: totals[0]?.count ?? 0, items };
}

