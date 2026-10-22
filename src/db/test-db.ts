import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import type { Db } from "./types";

/** Fresh in-memory Postgres with the real migrations applied. Test-only. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { db, close: () => client.close() };
}

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`truncate table entries, fuel_logs, briefings restart identity cascade`);
}
