import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const ENTRY_TYPES = ["gasto", "abastecimento", "ideia", "tarefa", "nota"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const entryType = pgEnum("entry_type", ENTRY_TYPES);

const id = () => bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

export const entries = pgTable(
  "entries",
  {
    id: id(),
    type: entryType("type").notNull(),
    rawText: text("raw_text").notNull(),
    amountCents: integer("amount_cents"),
    // Validated in the app (see SPENDING_CATEGORIES) so new categories don't need a migration.
    category: text("category"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // Calendar day ("sexta"), not an instant, so no timezone is involved.
    dueDate: date("due_date", { mode: "string" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("entries_created_at_idx").on(t.createdAt.desc()),
    index("entries_type_created_at_idx").on(t.type, t.createdAt.desc()),
    index("entries_tags_idx").using("gin", t.tags),
    check("entries_amount_non_negative", sql`${t.amountCents} >= 0`),
    check("entries_gasto_has_amount", sql`${t.type} <> 'gasto' or ${t.amountCents} is not null`),
  ],
);

export const fuelLogs = pgTable(
  "fuel_logs",
  {
    id: id(),
    entryId: bigint("entry_id", { mode: "number" })
      .notNull()
      .unique()
      .references(() => entries.id, { onDelete: "cascade" }),
    totalCents: integer("total_cents").notNull(),
    liters: numeric("liters", { precision: 7, scale: 3, mode: "number" }),
    odometerKm: integer("odometer_km"),
    pricePerLiterCents: integer("price_per_liter_cents"),
    createdAt: createdAt(),
  },
  (t) => [
    index("fuel_logs_created_at_idx").on(t.createdAt.desc()),
    check("fuel_logs_total_positive", sql`${t.totalCents} > 0`),
    check("fuel_logs_liters_positive", sql`${t.liters} > 0`),
    check("fuel_logs_odometer_non_negative", sql`${t.odometerKm} >= 0`),
  ],
);

export const briefings = pgTable(
  "briefings",
  {
    id: id(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    content: text("content").notNull(),
    hadImage: boolean("had_image").notNull(),
  },
  (t) => [index("briefings_sent_at_idx").on(t.sentAt.desc())],
);

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type FuelLog = typeof fuelLogs.$inferSelect;
export type Briefing = typeof briefings.$inferSelect;
