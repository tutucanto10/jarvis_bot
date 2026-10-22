import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison; false for missing values. */
export function safeEqual(received: string | null | undefined, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
