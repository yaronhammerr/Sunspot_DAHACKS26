import { WEATHER_GRID } from "../../lib/weather";

export const FORECAST_NOW = Date.UTC(2026, 9, 16, 20);
// A minimal provider response with real units, one sample for every bounded
// location and a complete 48-hour window plus the initial preceding hour.
export function providerForecast(now = FORECAST_NOW) {
  const start = Math.floor(now / 3_600_000) * 3_600_000 - 3_600_000;
  return WEATHER_GRID.map(point => ({
    latitude: point.lat,
    longitude: point.lng,
    hourly_units: { time: "unixtime", cloud_cover: "%", visibility: "m", precipitation: "mm", direct_radiation_instant: "W/m²" },
    hourly: {
      time: Array.from({ length: 51 }, (_, i) => (start + i * 3_600_000) / 1000),
      cloud_cover: Array(51).fill(35), cloud_cover_low: Array(51).fill(10),
      cloud_cover_mid: Array(51).fill(20), cloud_cover_high: Array(51).fill(30),
      visibility: Array(51).fill(20_000), precipitation: Array(51).fill(0), direct_radiation_instant: Array(51).fill(300),
    },
  }));
}
