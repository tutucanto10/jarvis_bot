import { z } from "zod";

const telegramSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]+$/, "invalid bot token format"),
  // Telegram only accepts A-Z a-z 0-9 _ - here; generated secrets (e.g. Render's base64) are
  // stripped of other characters. Route and setWebhook both read this same value, so they match.
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .transform((s) => s.replace(/[^\w-]/g, "").slice(0, 256))
    .refine((s) => s.length >= 16, "use at least 16 chars of A-Z, a-z, 0-9, _ or -"),
  ALLOWED_CHAT_ID: z.coerce.number().int(),
});

export type TelegramEnv = z.infer<typeof telegramSchema>;

const dbSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type DbEnv = z.infer<typeof dbSchema>;

const aiSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
});

export type AiEnv = z.infer<typeof aiSchema>;

const appSchema = z.object({
  TZ_USER: z
    .string()
    .default("America/Sao_Paulo")
    .refine(isValidTimeZone, "unknown IANA timezone"),
});

export type AppEnv = z.infer<typeof appSchema>;

const briefingSchema = z.object({
  CRON_SECRET: z.string().min(16, "use at least 16 chars"),
  WEATHER_LAT: z.coerce.number().min(-90).max(90),
  WEATHER_LON: z.coerce.number().min(-180).max(180),
  WEATHER_LABEL: z.string().default("Ilha do Governador"),
  FAVORITE_TEAMS: z
    .string()
    .default("Flamengo")
    .transform((v) => v.split(",").map((t) => t.trim()).filter(Boolean)),
});

export type BriefingEnv = z.infer<typeof briefingSchema>;

let telegramEnv: TelegramEnv | undefined;
let briefingEnv: BriefingEnv | undefined;
let aiEnv: AiEnv | undefined;
let appEnv: AppEnv | undefined;
let dbEnv: DbEnv | undefined;

/** Parses env lazily so a missing var fails the request, not the build. */
export function getTelegramEnv(): TelegramEnv {
  telegramEnv ??= parse(telegramSchema);
  return telegramEnv;
}

export function getDbEnv(): DbEnv {
  dbEnv ??= parse(dbSchema);
  return dbEnv;
}

export function getAiEnv(): AiEnv {
  aiEnv ??= parse(aiSchema);
  return aiEnv;
}

export function getAppEnv(): AppEnv {
  appEnv ??= parse(appSchema);
  return appEnv;
}

export function getBriefingEnv(): BriefingEnv {
  briefingEnv ??= parse(briefingSchema);
  return briefingEnv;
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parse<T extends z.ZodType>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // Only variable names and reasons, never values.
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment: ${issues.join("; ")}`);
  }
  return result.data;
}
