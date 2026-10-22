export const DEFAULT_TZ = "America/Sao_Paulo";

function parts(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("pt-BR", { timeZone, ...options }).formatToParts(date)) {
    out[p.type] = p.value;
  }
  return out;
}

/** "22/10" in the user's timezone. */
export function formatDayMonth(date: Date, timeZone = DEFAULT_TZ): string {
  const p = parts(date, timeZone, { day: "2-digit", month: "2-digit" });
  return `${p.day}/${p.month}`;
}

/** "22/10 14:05" in the user's timezone. */
export function formatDateTime(date: Date, timeZone = DEFAULT_TZ): string {
  const p = parts(date, timeZone, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** "quinta" — weekday without the "-feira" suffix. */
export function formatWeekday(date: Date, timeZone = DEFAULT_TZ): string {
  return parts(date, timeZone, { weekday: "long" }).weekday!.replace(/-feira$/, "");
}

/** Calendar day "YYYY-MM-DD" of an instant in the user's timezone. */
export function toLocalDate(date: Date, timeZone = DEFAULT_TZ): string {
  const p = parts(date, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day in "YYYY-MM-DD" form (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/** "2026-10-23" → "sexta, 23/10". Calendar days carry no timezone, so format at UTC noon. */
export function formatCalendarDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return `${formatWeekday(d, "UTC")}, ${formatDayMonth(d, "UTC")}`;
}
