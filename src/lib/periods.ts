import { DEFAULT_TZ, formatDayMonth } from "./dates";

/** Half-open UTC interval [from, to). */
export interface DateRange {
  from: Date;
  to: Date;
}

interface LocalDay {
  year: number;
  month: number; // 1-12
  day: number;
}

const DAY_MS = 86_400_000;

function localDay(date: Date, timeZone: string): LocalDay & { weekday: number } {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date)) {
    p[part.type] = part.value;
  }
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday!);
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), weekday };
}

/** Offset (ms) between the timezone's wall clock and UTC at a given instant. */
function tzOffset(date: Date, timeZone: string): number {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date)) {
    p[part.type] = part.value;
  }
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant of 00:00 local time on a calendar day (month/day may overflow, like Date.UTC). */
export function startOfLocalDay(day: LocalDay, timeZone = DEFAULT_TZ): Date {
  const guess = Date.UTC(day.year, day.month - 1, day.day);
  const first = guess - tzOffset(new Date(guess), timeZone);
  // Second pass handles days where the offset changes (DST).
  return new Date(guess - tzOffset(new Date(first), timeZone));
}

function addDays(day: LocalDay, n: number): LocalDay {
  const d = new Date(Date.UTC(day.year, day.month - 1, day.day) + n * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function todayRange(now: Date, timeZone = DEFAULT_TZ): DateRange {
  const today = localDay(now, timeZone);
  return { from: startOfLocalDay(today, timeZone), to: startOfLocalDay(addDays(today, 1), timeZone) };
}

/** 00:00–24:00 of yesterday in the user's timezone. */
export function yesterdayRange(now: Date, timeZone = DEFAULT_TZ): DateRange {
  const today = localDay(now, timeZone);
  return { from: startOfLocalDay(addDays(today, -1), timeZone), to: startOfLocalDay(today, timeZone) };
}

/** Monday 00:00 of the current week until now. */
export function thisWeekRange(now: Date, timeZone = DEFAULT_TZ): DateRange {
  const today = localDay(now, timeZone);
  const sinceMonday = (today.weekday + 6) % 7;
  return { from: startOfLocalDay(addDays(today, -sinceMonday), timeZone), to: now };
}

export function lastWeekRange(now: Date, timeZone = DEFAULT_TZ): DateRange {
  const thisWeek = thisWeekRange(now, timeZone);
  const monday = localDay(thisWeek.from, timeZone);
  return { from: startOfLocalDay(addDays(monday, -7), timeZone), to: thisWeek.from };
}

export function monthRange(year: number, month: number, timeZone = DEFAULT_TZ): DateRange {
  return {
    from: startOfLocalDay({ year, month, day: 1 }, timeZone),
    to: startOfLocalDay({ year, month: month + 1, day: 1 }, timeZone),
  };
}

/** First day of the current month until now. */
export function thisMonthRange(now: Date, timeZone = DEFAULT_TZ): DateRange {
  const { year, month } = localDay(now, timeZone);
  return { from: monthRange(year, month, timeZone).from, to: now };
}

export function lastMonthRange(now: Date, timeZone = DEFAULT_TZ): DateRange {
  const { year, month } = localDay(now, timeZone);
  return monthRange(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1, timeZone);
}

export function thisYearRange(now: Date, timeZone = DEFAULT_TZ): DateRange {
  const { year } = localDay(now, timeZone);
  return { from: startOfLocalDay({ year, month: 1, day: 1 }, timeZone), to: now };
}

/** A named month without a year means the most recent one: "outubro" in March → last October. */
export function resolveMonth(month: number, year: number | null, now: Date, timeZone = DEFAULT_TZ): DateRange {
  const current = localDay(now, timeZone);
  const y = year ?? (month > current.month ? current.year - 1 : current.year);
  return monthRange(y, month, timeZone);
}

/** Inclusive local calendar days "YYYY-MM-DD" → range. */
export function customRange(fromIso: string, toIso: string, timeZone = DEFAULT_TZ): DateRange {
  const [fy, fm, fd] = fromIso.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split("-").map(Number) as [number, number, number];
  return {
    from: startOfLocalDay({ year: fy, month: fm, day: fd }, timeZone),
    to: startOfLocalDay(addDays({ year: ty, month: tm, day: td }, 1), timeZone),
  };
}

/** "20/10 – 22/10" for display; `to` is exclusive, so show the last included instant. */
export function formatRange(range: DateRange, timeZone = DEFAULT_TZ): string {
  const from = formatDayMonth(range.from, timeZone);
  const to = formatDayMonth(new Date(range.to.getTime() - 1), timeZone);
  return from === to ? from : `${from} – ${to}`;
}

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month);
}
