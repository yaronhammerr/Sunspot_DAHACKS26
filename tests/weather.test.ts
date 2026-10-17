import test from "node:test";
import assert from "node:assert/strict";
import { FORECAST_NOW, providerForecast } from "./fixtures/forecast-helper";
import { forecastRangeEnd, forecastUrl, inWeatherCoverage, nearestCell, parseForecast, weatherAt, WEATHER_GRID, WEATHER_STALE_MS } from "../lib/weather";
import { sunlightState, viewingOutlook } from "../lib/sunset-outlook";
import { fromPacific } from "../lib/solar";
const sf = { lat: 37.7749, lng: -122.4194 };
test("bounded regional forecast request has no credentials or arbitrary parameters", () => {
  const u = new URL(forecastUrl());
  assert.equal(u.origin, "https://api.open-meteo.com");
  assert.equal(u.searchParams.get("latitude")!.split(",").length, 49);
  assert.equal(u.searchParams.get("timeformat"), "unixtime");
  assert.equal(u.searchParams.get("hourly")!.split(",").length, 7);
  assert.ok(!u.search.includes("apikey")); assert.ok(!inWeatherCoverage({ lat: 34, lng: -118 }));
});
test("parser preserves missing fields and rejects wrong units, grids and times", () => {
  const raw = providerForecast(); raw[0].hourly.cloud_cover[0] = null;
  const f = parseForecast(raw, FORECAST_NOW); assert.equal(f.cells[0].hours[0].cloud, null);
  assert.equal(forecastRangeEnd(f, FORECAST_NOW), FORECAST_NOW + 48 * 3_600_000);
  const short = { ...f, cells: f.cells.map(c => ({ ...c, hours: c.hours.slice(0, 24) })) };
  assert.equal(forecastRangeEnd(short, FORECAST_NOW), short.cells[0].hours.at(-1)!.time);
  assert.ok(nearestCell(f, sf)); assert.equal(nearestCell(f, { lat: 34, lng: -118 }), null);
  assert.equal(weatherAt(f, WEATHER_GRID[0], f.cells[0].hours[0].time - 1, FORECAST_NOW), null);
  assert.equal(weatherAt(f, sf, FORECAST_NOW, FORECAST_NOW + WEATHER_STALE_MS + 1), null);
  assert.ok(weatherAt(f, sf, FORECAST_NOW + 15 * 60_000, FORECAST_NOW));
  const units = providerForecast(); units[0].hourly_units.visibility = "km"; assert.throws(() => parseForecast(units, FORECAST_NOW));
  const times = providerForecast(); times[0].hourly.time[1] = times[0].hourly.time[0]; assert.throws(() => parseForecast(times, FORECAST_NOW));
  assert.throws(() => parseForecast([], FORECAST_NOW));
});
test("outlooks explain low cloud, haze and rain without making high clouds a veto", () => {
  const f = parseForecast(providerForecast(), FORECAST_NOW), w = f.cells[0].hours[0];
  assert.equal(viewingOutlook({ ...w, high: 100 }).label, "More favorable");
  assert.equal(viewingOutlook({ ...w, low: 90 }).label, "Likely obscured");
  assert.equal(viewingOutlook({ ...w, visibility: 4000 }).label, "Likely obscured");
  assert.equal(viewingOutlook({ ...w, precipitation: 1 }).label, "Likely obscured");
  assert.equal(viewingOutlook({ ...w, low: null }).label, "Weather unavailable");
  assert.equal(viewingOutlook(w, { ...w, low: 90 }).label, "Likely obscured");
  assert.ok(!sunlightState(sf, fromPacific("2026-10-16T23:00")!, f, null, FORECAST_NOW).label.includes("more likely"));
});
