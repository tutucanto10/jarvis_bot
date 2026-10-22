type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SECRET_PATTERN = /\d{6,}:[\w-]{30,}|sk-ant-[\w-]+/g;

/** Strips anything that looks like a bot token or API key. */
export function redact(value: string): string {
  return value.replace(SECRET_PATTERN, "[redacted]");
}

function serializeError(err: unknown): Fields {
  if (err instanceof Error) {
    return { error: redact(err.message), name: err.name, stack: err.stack && redact(err.stack) };
  }
  return { error: redact(String(err)) };
}

function write(level: Level, msg: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, msg, ...fields, time: new Date().toISOString() });
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  out(line);
}

/**
 * Structured logger. Callers must never pass message text, tokens or keys;
 * log ids, types and lengths instead.
 */
export const logger = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, err?: unknown, fields?: Fields) =>
    write("error", msg, { ...fields, ...(err === undefined ? {} : serializeError(err)) }),
};
