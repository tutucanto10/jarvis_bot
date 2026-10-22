import { beforeAll, describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

const SECRET = "cron-secret-for-tests-123";

beforeAll(() => {
  Object.assign(process.env, { CRON_SECRET: SECRET, WEATHER_LAT: "-22.8", WEATHER_LON: "-43.2" });
});

const req = (headers: Record<string, string> = {}, query = "") =>
  new Request(`https://app.test/api/cron/briefing${query}`, { headers });

describe("isCronAuthorized", () => {
  it("accepts only the right bearer token", () => {
    expect(isCronAuthorized(req({ authorization: `Bearer ${SECRET}` }))).toBe(true);
    expect(isCronAuthorized(req({ authorization: "Bearer wrong" }))).toBe(false);
    expect(isCronAuthorized(req({ authorization: SECRET }))).toBe(false);
    expect(isCronAuthorized(req())).toBe(false);
  });

  it("accepts ?secret= only where allowed (image route)", () => {
    expect(isCronAuthorized(req({}, `?secret=${SECRET}`))).toBe(false);
    expect(isCronAuthorized(req({}, `?secret=${SECRET}`), { allowQuery: true })).toBe(true);
    expect(isCronAuthorized(req({}, "?secret=nope"), { allowQuery: true })).toBe(false);
  });
});
