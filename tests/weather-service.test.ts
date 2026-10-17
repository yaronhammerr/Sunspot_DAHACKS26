import test from "node:test";
import assert from "node:assert/strict";
import { WeatherService } from "../lib/weather-service";
import { parseForecast, WEATHER_FRESH_MS, WEATHER_GRID, WEATHER_STALE_MS } from "../lib/weather";
import { FORECAST_NOW, providerForecast } from "./fixtures/forecast-helper";
import type { Forecast } from "../lib/forecast-types";

function storedForecast(fetchedAt = FORECAST_NOW) { return parseForecast(providerForecast(fetchedAt), fetchedAt); }
function edgeCache(initial: Forecast | unknown = undefined) {
  let value = initial;
  let reads = 0, writes = 0;
  return {
    async match() { reads++; return value === undefined ? undefined : Response.json(value); },
    async put(_request: Request, response: Response) { writes++; value = await response.json(); },
    set(next: unknown) { value = next; },
    stats() { return { reads, writes }; },
  };
}
const successfulFetch = (() => Promise.resolve(Response.json(providerForecast()))) as typeof fetch;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test("concurrent callers share one batch and subsequent fresh reads use its local copy", async () => {
  let calls = 0;
  let release!: (response: Response) => void;
  const fetcher = (() => { calls++; return new Promise<Response>(resolve => { release = resolve; }); }) as typeof fetch;
  const cache = edgeCache();
  const service = new WeatherService(fetcher, () => FORECAST_NOW, cache);
  const first = service.get(), second = service.get();
  assert.equal(first, second);
  await flush();
  assert.equal(calls, 1);
  release(Response.json(providerForecast()));
  const result = await first;
  assert.equal(result.forecast?.cells.length, WEATHER_GRID.length);
  assert.equal(result.forecast?.stale, false);
  await service.get();
  assert.equal(calls, 1);
  assert.deepEqual(cache.stats(), { reads: 1, writes: 1 });
});

test("expired local weather adopts a newer fresh edge entry without another provider request", async () => {
  let now = FORECAST_NOW, calls = 0;
  const cache = edgeCache();
  const service = new WeatherService((async () => { calls++; return Response.json(providerForecast(now)); }) as typeof fetch, () => now, cache);
  await service.get();
  now += WEATHER_FRESH_MS;
  cache.set(storedForecast(now - 60_000));
  const result = await service.get();
  assert.equal(calls, 1);
  assert.equal(result.forecast?.fetchedAt, now - 60_000);
  assert.equal(result.forecast?.stale, false);
  assert.equal(result.forecast?.cache, "edge");
  assert.equal(cache.stats().reads, 2);
});

test("edge cache can recover weather during provider backoff, while older entries never replace newer local data", async () => {
  let now = FORECAST_NOW, calls = 0;
  const cache = edgeCache(storedForecast(now - WEATHER_FRESH_MS));
  const service = new WeatherService((async () => { calls++; return new Response(null, { status: 429 }); }) as typeof fetch, () => now, cache);
  const limited = await service.get();
  assert.equal(limited.forecast?.stale, true);
  now += 1000;
  cache.set(storedForecast(now));
  const recovered = await service.get();
  assert.equal(recovered.forecast?.stale, false);
  assert.equal(calls, 1);
  now += WEATHER_FRESH_MS;
  cache.set(storedForecast(FORECAST_NOW - 2 * WEATHER_FRESH_MS));
  const older = await service.get();
  assert.equal(older.forecast?.fetchedAt, FORECAST_NOW + 1000);
  assert.equal(calls, 2);
});

test("provider 429 is never retried and its cooldown prevents repeated upstream requests", async () => {
  let calls = 0;
  const service = new WeatherService((async () => { calls++; return new Response(null, { status: 429 }); }) as typeof fetch, () => FORECAST_NOW);
  const result = await service.get();
  assert.equal(result.forecast, null);
  assert.match(result.error!, /rate limit/);
  assert.equal(result.retryAt, FORECAST_NOW + 10 * 60_000);
  await service.get();
  assert.equal(calls, 1);
});

test("stale forecasts are explicitly aged out at the documented three-hour cutoff", async () => {
  let now = FORECAST_NOW;
  const cache = edgeCache(storedForecast(now - WEATHER_STALE_MS));
  let calls = 0;
  const service = new WeatherService((async () => { calls++; return new Response(null, { status: 429 }); }) as typeof fetch, () => now, cache);
  const atCutoff = await service.get();
  assert.equal(atCutoff.forecast?.stale, true);
  assert.equal(atCutoff.forecast?.fetchedAt, FORECAST_NOW - WEATHER_STALE_MS);
  now++;
  const expired = await service.get();
  assert.equal(expired.forecast, null);
  assert.equal(calls, 1);
});

test("malformed or future-dated edge entries are rejected before consumers can read them", async () => {
  const malformed = storedForecast();
  (malformed.cells[0] as unknown as { hours: unknown }).hours = null;
  for (const entry of [malformed, storedForecast(FORECAST_NOW + 1), { version: 1, cells: Array(49).fill({}), fetchedAt: FORECAST_NOW }]) {
    let calls = 0;
    const service = new WeatherService((async () => { calls++; return Response.json(providerForecast()); }) as typeof fetch, () => FORECAST_NOW, edgeCache(entry));
    const result = await service.get();
    assert.equal(calls, 1);
    assert.equal(result.forecast?.cells[0].hours.length, 51);
  }
});

test("failed batches count all 49 locations against the hourly budget, which resets at the next hour", async () => {
  let now = FORECAST_NOW, calls = 0;
  const service = new WeatherService((async () => { calls++; return new Response(null, { status: 429 }); }) as typeof fetch, () => now);
  await service.get();
  now += 10 * 60_000;
  await service.get();
  now += 10 * 60_000;
  const blocked = await service.get();
  assert.equal(calls, 2, "98 hourly location-equivalents permit only two 49-location batches");
  assert.match(blocked.error!, /budget/);
  now = FORECAST_NOW + 3_600_000;
  await service.get();
  assert.equal(calls, 3);
});

test("server failures receive one bounded retry and retain valid stale weather", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const service = new WeatherService((async () => { calls++; return new Response(null, { status: 503 }); }) as typeof fetch, () => FORECAST_NOW, edgeCache(storedForecast(FORECAST_NOW - WEATHER_FRESH_MS)));
  const pending = service.get();
  await flush();
  assert.equal(calls, 1);
  context.mock.timers.tick(500);
  const result = await pending;
  assert.equal(calls, 2);
  assert.equal(result.forecast?.stale, true);
  assert.match(result.error!, /unavailable or timed out/);
});

test("silent providers abort each attempt at 12 seconds and release the request after one retry", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0, aborts = 0;
  const fetcher = ((_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    calls++;
    init.signal?.addEventListener("abort", () => { aborts++; reject(new DOMException("Timed out", "AbortError")); }, { once: true });
  })) as typeof fetch;
  const service = new WeatherService(fetcher, () => FORECAST_NOW);
  const pending = service.get();
  assert.equal(calls, 1);
  context.mock.timers.tick(12_000);
  await flush();
  context.mock.timers.tick(500);
  await flush();
  assert.equal(calls, 2);
  context.mock.timers.tick(12_000);
  const result = await pending;
  assert.equal(aborts, 2);
  assert.equal(result.forecast, null);
  assert.match(result.error!, /timed out/);
});

test("shared cache outages do not prevent a successful provider response", async () => {
  const cache = { async match() { throw new Error("Cache read unavailable"); }, async put() { throw new Error("Cache write unavailable"); } };
  const result = await new WeatherService(successfulFetch, () => FORECAST_NOW, cache).get();
  assert.equal(result.forecast?.stale, false);
  assert.equal(result.forecast?.cache, "process");
});
