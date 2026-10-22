import type { z } from "zod";

const USER_AGENT = "segundo-cerebro-bot/1.0 (+personal use)";

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

/** fetch with a hard timeout; throws HttpError on non-2xx. */
export async function fetchOk(url: string, timeoutMs = 8000, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": USER_AGENT, ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new HttpError(url, res.status);
  return res;
}

/** Fetches JSON and validates it; external APIs are never trusted blindly. */
export async function fetchJson<T extends z.ZodType>(url: string, schema: T, timeoutMs?: number): Promise<z.infer<T>> {
  const res = await fetchOk(url, timeoutMs);
  return schema.parse(await res.json());
}
