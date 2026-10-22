import { describe, expect, it } from "vitest";
import { averageKmPerLiter, kmPerLiter } from "./fuel";

describe("kmPerLiter", () => {
  it("divides distance since the previous reading by liters filled", () => {
    expect(
      kmPerLiter([
        { odometerKm: 45000, liters: 30 },
        { odometerKm: 45300, liters: 25 },
        { odometerKm: 45600, liters: 30 },
      ]),
    ).toEqual([null, 12, 10]);
  });

  it("adds liters from fill-ups without odometer to the next reading", () => {
    expect(
      kmPerLiter([
        { odometerKm: 45000, liters: 30 },
        { odometerKm: null, liters: 10 },
        { odometerKm: 45400, liters: 30 },
      ]),
    ).toEqual([null, null, 10]);
  });

  it("is null when liters are unknown or the odometer goes backwards", () => {
    expect(
      kmPerLiter([
        { odometerKm: 45000, liters: 30 },
        { odometerKm: null, liters: null },
        { odometerKm: 45400, liters: 30 },
        { odometerKm: 45300, liters: 20 },
        { odometerKm: 45500, liters: null },
      ]),
    ).toEqual([null, null, null, null, null]);
  });

  it("averages over all computable stretches", () => {
    expect(
      averageKmPerLiter([
        { odometerKm: 45000, liters: 30 },
        { odometerKm: 45300, liters: 25 },
        { odometerKm: 45600, liters: 35 },
      ]),
    ).toBeCloseTo(600 / 60);
    expect(averageKmPerLiter([{ odometerKm: 45000, liters: 30 }])).toBeNull();
  });
});
