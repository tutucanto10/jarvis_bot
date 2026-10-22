import type { Classifier } from "@/ai/classify";
import type { QueryParser } from "@/ai/query";
import type { Api } from "grammy";
import type { Db } from "@/db/types";

/** Everything handlers touch outside Telegram, injectable for tests. */
export interface BotDeps {
  getDb: () => Db;
  classify: Classifier;
  parseQuery: QueryParser;
  now: () => Date;
  timeZone: string;
  /** Builds and sends the morning briefing to the owner's chat. */
  runBriefing: (api: Api) => Promise<unknown>;
}
