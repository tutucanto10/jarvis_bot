import { describe, expect, it } from "vitest";
import { safeEqual } from "./secrets";

describe("safeEqual", () => {
  it("matches only identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abd", "abc")).toBe(false);
    expect(safeEqual("abcd", "abc")).toBe(false);
    expect(safeEqual(null, "abc")).toBe(false);
    expect(safeEqual("", "abc")).toBe(false);
  });
});
