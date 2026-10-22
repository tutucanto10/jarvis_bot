import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getDbEnv } from "@/lib/env";
import * as schema from "./schema";
import type { Db } from "./types";

let db: Db | undefined;

/** Neon over HTTP: one round trip per query, no pool to manage on serverless. */
export function getDb(): Db {
  db ??= drizzle({ client: neon(getDbEnv().DATABASE_URL), schema });
  return db;
}
