import { z } from "zod";
import { fetchJson } from "@/lib/http";
import { OPEN_METEO_URL } from "./sources";

export interface Weather {
  currentC: number;
  maxC: number | null;
  minC: number | null;
  rainChancePct: number | null;
  weatherCode: number;
}

const OpenMeteoSchema = z.object({
  current: z.object({ temperature_2m: z.number(), weather_code: z.number().int() }),
  daily: z.object({
    temperature_2m_max: z.array(z.number().nullable()).min(1),
    temperature_2m_min: z.array(z.number().nullable()).min(1),
    precipitation_probability_max: z.array(z.number().nullable()).min(1),
  }),
});

export function weatherUrl(lat: number, lon: number, timeZone: string): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: timeZone,
    forecast_days: "1",
  });
  return `${OPEN_METEO_URL}?${params}`;
}

export function parseWeather(json: unknown): Weather {
  const data = OpenMeteoSchema.parse(json);
  return {
    currentC: data.current.temperature_2m,
    weatherCode: data.current.weather_code,
    maxC: data.daily.temperature_2m_max[0] ?? null,
    minC: data.daily.temperature_2m_min[0] ?? null,
    rainChancePct: data.daily.precipitation_probability_max[0] ?? null,
  };
}

export async function fetchWeather(lat: number, lon: number, timeZone: string): Promise<Weather> {
  return parseWeather(await fetchJson(weatherUrl(lat, lon, timeZone), z.unknown()));
}

/** WMO weather code → emoji. */
export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫";
  if (code <= 57) return "🌦";
  if (code <= 67 || (code >= 80 && code <= 82)) return "🌧";
  if (code <= 77 || code === 85 || code === 86) return "❄️";
  if (code >= 95) return "⛈";
  return "🌤";
}
