/** Usage: pnpm db:migrate — applies pending migrations from ./drizzle to DATABASE_URL. */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDbEnv } from "../src/lib/env";

async function main(): Promise<void> {
  const db = drizzle({ client: neon(getDbEnv().DATABASE_URL) });
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("✅ Migrations aplicadas");
}

main().catch((err: unknown) => {
  console.error("❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
