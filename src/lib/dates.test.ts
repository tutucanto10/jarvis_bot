import { describe, expect, it } from "vitest";
import {
  formatCalendarDay,
  formatDateTime,
  formatDayMonth,
  formatWeekday,
  isIsoDate,
  toLocalDate,
} from "./dates";

describe("dates in America/Sao_Paulo", () => {
  // 2026-10-22 02:30 UTC is still Wednesday 21/10 23:30 in Brasília (UTC-3).
  const lateNight = new Date("2026-10-22T02:30:00Z");

  it("uses the local calendar day, not UTC", () => {
    expect(toLocalDate(lateNight)).toBe("2026-10-21");
    expect(formatDayMonth(lateNight)).toBe("21/10");
    expect(formatWeekday(lateNight)).toBe("quarta");
    expect(formatDateTime(lateNight)).toBe("21/10 23:30");
  });

  it("drops the -feira suffix and keeps weekend names", () => {
    expect(formatWeekday(new Date("2026-10-22T12:00:00Z"))).toBe("quinta");
    expect(formatWeekday(new Date("2026-10-24T12:00:00Z"))).toBe("sábado");
  });
});

describe("calendar days", () => {
  it("validates real dates only", () => {
    expect(isIsoDate("2026-10-23")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("23/10/2026")).toBe(false);
  });

  it("formats without timezone drift", () => {
    expect(formatCalendarDay("2026-10-23")).toBe("sexta, 23/10");
  });
});
