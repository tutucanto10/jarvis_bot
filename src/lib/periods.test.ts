import { describe, expect, it } from "vitest";
import {
  customRange,
  formatRange,
  lastMonthRange,
  lastWeekRange,
  resolveMonth,
  startOfLocalDay,
  thisMonthRange,
  thisWeekRange,
  todayRange,
  yesterdayRange,
} from "./periods";

// Thursday 22/10/2026 07:00 in Brasília.
const now = new Date("2026-10-22T10:00:00Z");
const iso = (d: Date) => d.toISOString();

describe("periods in America/Sao_Paulo (UTC-3)", () => {
  it("local midnight is 03:00 UTC", () => {
    expect(iso(startOfLocalDay({ year: 2026, month: 10, day: 22 }))).toBe("2026-10-22T03:00:00.000Z");
  });

  it("today and yesterday", () => {
    expect(todayRange(now)).toEqual({
      from: new Date("2026-10-22T03:00:00Z"),
      to: new Date("2026-10-23T03:00:00Z"),
    });
    expect(yesterdayRange(now)).toEqual({
      from: new Date("2026-10-21T03:00:00Z"),
      to: new Date("2026-10-22T03:00:00Z"),
    });
  });

  it("yesterday is based on the local day, even right after local midnight", () => {
    // 22/10 00:30 local = 03:30 UTC; at 02:30 UTC it is still 21/10 locally.
    expect(iso(yesterdayRange(new Date("2026-10-22T03:30:00Z")).from)).toBe("2026-10-21T03:00:00.000Z");
    expect(iso(yesterdayRange(new Date("2026-10-22T02:30:00Z")).from)).toBe("2026-10-20T03:00:00.000Z");
  });

  it("week starts on Monday", () => {
    expect(iso(thisWeekRange(now).from)).toBe("2026-10-19T03:00:00.000Z");
    expect(thisWeekRange(now).to).toBe(now);
    expect(lastWeekRange(now)).toEqual({
      from: new Date("2026-10-12T03:00:00Z"),
      to: new Date("2026-10-19T03:00:00Z"),
    });
    // On a Monday the week starts that same day.
    expect(iso(thisWeekRange(new Date("2026-10-19T12:00:00Z")).from)).toBe("2026-10-19T03:00:00.000Z");
    // On a Sunday it started 6 days earlier.
    expect(iso(thisWeekRange(new Date("2026-10-25T12:00:00Z")).from)).toBe("2026-10-19T03:00:00.000Z");
  });

  it("months, including year wrap", () => {
    expect(iso(thisMonthRange(now).from)).toBe("2026-10-01T03:00:00.000Z");
    expect(lastMonthRange(now)).toEqual({
      from: new Date("2026-09-01T03:00:00Z"),
      to: new Date("2026-10-01T03:00:00Z"),
    });
    expect(iso(lastMonthRange(new Date("2026-01-15T12:00:00Z")).from)).toBe("2025-12-01T03:00:00.000Z");
  });

  it("a month without a year resolves to the most recent one", () => {
    expect(iso(resolveMonth(10, null, now).from)).toBe("2026-10-01T03:00:00.000Z");
    expect(iso(resolveMonth(12, null, now).from)).toBe("2025-12-01T03:00:00.000Z");
    expect(iso(resolveMonth(12, 2026, now).to)).toBe("2027-01-01T03:00:00.000Z");
  });

  it("custom ranges include the last day", () => {
    expect(customRange("2026-10-01", "2026-10-15")).toEqual({
      from: new Date("2026-10-01T03:00:00Z"),
      to: new Date("2026-10-16T03:00:00Z"),
    });
  });

  it("formats ranges for display", () => {
    expect(formatRange(thisWeekRange(now))).toBe("19/10 – 22/10");
    expect(formatRange(yesterdayRange(now))).toBe("21/10");
  });
});
