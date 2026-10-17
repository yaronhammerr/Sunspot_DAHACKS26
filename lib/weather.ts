import type { Forecast, ForecastCell, ForecastHour } from "./forecast-types";
import type { Point } from "./solar";
export const WEATHER_FRESH_MS = 60 * 60_000;
export const WEATHER_STALE_MS = 3 * WEATHER_FRESH_MS;
export function forecastRangeEnd(forecast: Forecast | null, now: number) {
  const astronomyEnd = now + 48 * 3_600_000;
  if (!forecast || now - forecast.fetchedAt > WEATHER_STALE_MS || !forecast.cells.length) return astronomyEnd;
  const last = Math.min(...forecast.cells.map(c => c.hours.at(-1)?.time ?? 0));
  return last >= now ? Math.min(last, astronomyEnd) : astronomyEnd;
}
export const GRID_STEP = .3;
export const WEATHER_GRID = Array.from({ length: 49 }, (_, i) => ({ id: `bay-${i}`, lat: +(36.95 + Math.floor(i / 7) * GRID_STEP).toFixed(2), lng: +(-123.05 + (i % 7) * GRID_STEP).toFixed(2) }));
export function inWeatherCoverage(p: Point) { return Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= 36.8 && p.lat <= 38.9 && p.lng >= -123.2 && p.lng <= -121.1; }
export const WEATHER_FIELDS = ["cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "visibility", "precipitation", "direct_radiation_instant"] as const;
export function forecastUrl() {
  const u = new URL("https://api.open-meteo.com/v1/gfs");
  u.search = new URLSearchParams({ latitude: WEATHER_GRID.map(c => c.lat).join(","), longitude: WEATHER_GRID.map(c => c.lng).join(","), hourly: WEATHER_FIELDS.join(","), forecast_hours: "51", past_hours: "1", timezone: "GMT", timeformat: "unixtime", cell_selection: "nearest" }).toString();
  return u.toString();
}
export function parseForecast(raw: unknown, fetchedAt: number): Forecast {
  if (!Array.isArray(raw) || raw.length !== WEATHER_GRID.length) throw new Error("Incomplete regional forecast.");
  const cells: ForecastCell[] = raw.map((item, i) => {
    if (!item || typeof item !== "object") throw new Error("Invalid forecast response.");
    const { hourly: h, hourly_units: units, latitude, longitude } = item;
    if (!h || !Array.isArray(h.time) || h.time.length < 2 || units?.time !== "unixtime" || units?.cloud_cover !== "%" || units?.visibility !== "m" || units?.precipitation !== "mm" || units?.direct_radiation_instant !== "W/m²") throw new Error("Unexpected forecast units or time axis.");
    const value = (key: string, index: number, max = Infinity) => { const n = h[key]?.[index]; return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
    const hours: ForecastHour[] = h.time.map((seconds: unknown, j: number) => {
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || (j && seconds <= h.time[j - 1])) throw new Error("Invalid forecast timestamps.");
      return { time: seconds * 1000, cloud: value("cloud_cover", j, 100), low: value("cloud_cover_low", j, 100), mid: value("cloud_cover_mid", j, 100), high: value("cloud_cover_high", j, 100), visibility: value("visibility", j), precipitation: value("precipitation", j), direct: value("direct_radiation_instant", j) };
    });
    if (typeof latitude !== "number" || typeof longitude !== "number" || Math.abs(latitude - WEATHER_GRID[i].lat) > .5 || Math.abs(longitude - WEATHER_GRID[i].lng) > .5) throw new Error("Forecast grid mismatch.");
    return { ...WEATHER_GRID[i], modelLat: latitude, modelLng: longitude, hours };
  });
  return { version: 1, fetchedAt, source: "Open-Meteo · NOAA GFS/HRRR seamless", resolution: "Hourly · regional 0.3° sample grid", cells, stale: false, cache: "process" };
}
export function nearestCell(forecast: Forecast | null, point: Point): ForecastCell | null {
  if (!forecast || !inWeatherCoverage(point)) return null;
  return forecast.cells.reduce<ForecastCell | null>((best, c) => !best || ((c.lat - point.lat) ** 2 + ((c.lng - point.lng) * .79) ** 2 < (best.lat - point.lat) ** 2 + ((best.lng - point.lng) * .79) ** 2) ? c : best, null);
}
// Use the nearest hourly model instant (no extrapolation). The 15-minute UI is
// for astronomy; precipitation is the preceding-hour total, not instantaneous.
export function weatherAt(forecast: Forecast | null, point: Point, time: number, now = Date.now()): ForecastHour | null {
  if (!forecast || now - forecast.fetchedAt > WEATHER_STALE_MS) return null;
  const h = nearestCell(forecast, point)?.hours;
  if (!h?.length || time < h[0].time || time > h[h.length - 1].time) return null;
  return h.reduce((best, row) => Math.abs(row.time - time) < Math.abs(best.time - time) ? row : best);
}
