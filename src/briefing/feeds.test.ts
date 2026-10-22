import { describe, expect, it } from "vitest";
import { dedupeHeadlines, parseFeed } from "./news";
import { parseWeather, weatherEmoji, weatherUrl } from "./weather";

// Minimal RSS 2.0 document, hand-written for the test.
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>g1</title>
  <item><title><![CDATA[ Câmara aprova   projeto ]]></title><pubDate>Wed, 21 Oct 2026 22:00:00 -0300</pubDate></item>
  <item><title>Dólar &amp; bolsa fecham em alta</title><pubDate>Wed, 21 Oct 2026 18:00:00 -0300</pubDate></item>
  <item><title></title></item>
</channel></rss>`;

describe("parseFeed", () => {
  it("extracts cleaned titles and dates", async () => {
    expect(await parseFeed(RSS, "g1")).toEqual([
      { title: "Câmara aprova projeto", source: "g1", publishedAt: new Date("2026-10-22T01:00:00Z") },
      { title: "Dólar & bolsa fecham em alta", source: "g1", publishedAt: new Date("2026-10-21T21:00:00Z") },
    ]);
  });

  it("dedupes repeated titles across feeds", () => {
    const h = (title: string, source: string) => ({ title, source, publishedAt: null });
    expect(dedupeHeadlines([h("A", "g1"), h("a", "bbc"), h("B", "bbc")]).map((x) => x.title)).toEqual(["A", "B"]);
  });
});

describe("weather", () => {
  it("builds the Open-Meteo URL", () => {
    const url = new URL(weatherUrl(-22.8, -43.2, "America/Sao_Paulo"));
    expect(url.searchParams.get("latitude")).toBe("-22.8");
    expect(url.searchParams.get("daily")).toBe("temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    expect(url.searchParams.get("timezone")).toBe("America/Sao_Paulo");
  });

  it("parses current and daily values", () => {
    // Shape of Open-Meteo's /v1/forecast response (hand-written).
    const json = {
      current: { time: "2026-10-22T07:00", interval: 900, temperature_2m: 22.4, weather_code: 2 },
      daily: {
        time: ["2026-10-22"],
        temperature_2m_max: [28.1],
        temperature_2m_min: [19.6],
        precipitation_probability_max: [10],
      },
    };
    expect(parseWeather(json)).toEqual({ currentC: 22.4, maxC: 28.1, minC: 19.6, rainChancePct: 10, weatherCode: 2 });
    expect(() => parseWeather({ current: {} })).toThrow();
  });

  it("maps WMO codes to emoji", () => {
    expect([0, 2, 3, 45, 61, 95].map(weatherEmoji)).toEqual(["☀️", "🌤", "☁️", "🌫", "🌧", "⛈"]);
  });
});
