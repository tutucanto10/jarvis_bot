import { briefings, type Briefing } from "./schema";
import type { Db } from "./types";

export async function saveBriefing(
  db: Db,
  input: { content: string; hadImage: boolean; sentAt?: Date },
): Promise<Briefing> {
  const [row] = await db.insert(briefings).values(input).returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}
