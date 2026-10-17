import { forecastUrl, parseForecast, WEATHER_FRESH_MS, WEATHER_GRID, WEATHER_STALE_MS } from "./weather";
import type { Forecast, ForecastResponse } from "./forecast-types";

type SharedCache = { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<unknown> };
export class WeatherService {
  private saved: Forecast | null = null;
  private pending: Promise<ForecastResponse> | null = null;
  private retryAt = 0;
  private counts = new Map<string, number>();
  constructor(private fetcher: typeof fetch = fetch, private clock = Date.now, private cache?: SharedCache) {}
  // Each batch is charged as 49 location-equivalents, including failed attempts.
  // Counters are per isolate, NOT globally atomic. Edge cache is per Cloudflare
  // data center; deployments needing a global hard cap need a shared coordinator.
  private reserve(now: number) {
    const keys = [Math.floor(now / 60_000), Math.floor(now / 3_600_000), Math.floor(now / 86_400_000)].map((n, i) => `${i}:${n}`);
    for (const k of this.counts.keys()) if (!keys.includes(k)) this.counts.delete(k);
    if (keys.some((k, i) => (this.counts.get(k) ?? 0) + WEATHER_GRID.length > [98, 98, 2500][i])) return false;
    keys.forEach(k => this.counts.set(k, (this.counts.get(k) ?? 0) + WEATHER_GRID.length));
    return true;
  }
  get(): Promise<ForecastResponse> {
    if (!this.pending) this.pending = this.load().finally(() => { this.pending = null; });
    return this.pending;
  }
  private async load(): Promise<ForecastResponse> {
    const now = this.clock(), key = new Request("https://sunspot-cache.internal/forecast-v1");
    // Another isolate may have refreshed the shared entry since our local copy
    // expired. Check it before spending quota, including during local backoff.
    if ((!this.saved || now - this.saved.fetchedAt >= WEATHER_FRESH_MS) && this.cache) {
      try {
        const response = await this.cache.match(key);
        if (response) {
          const cached = await response.json() as Forecast;
          if (validCachedForecast(cached, now) && (!this.saved || cached.fetchedAt > this.saved.fetchedAt)) this.saved = { ...cached, cache: "edge" };
        }
      } catch { /* Continue with the bounded provider fetch if edge cache fails. */ }
    }
    if (this.saved && now - this.saved.fetchedAt < WEATHER_FRESH_MS) return { forecast: { ...this.saved, stale: false } };
    if (now < this.retryAt) return this.fallback(now, "Weather refresh temporarily unavailable.");
    let error = "Weather provider unavailable.";
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.reserve(this.clock())) { error = "Weather request budget reached."; break; }
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await this.fetcher(forecastUrl(), { signal: controller.signal });
        if (!response.ok) {
          // A 429 is not retried. Never bypass provider limits with another host.
          if (response.status === 429) { error = "Weather provider rate limit reached."; break; }
          if (response.status < 500) { error = "Weather request unavailable."; break; }
          throw new Error("Weather provider unavailable.");
        }
        const forecast = parseForecast(await response.json(), this.clock());
        this.saved = forecast; this.retryAt = 0;
        if (this.cache) {
          try { await this.cache.put(key, Response.json(forecast, { headers: { "Cache-Control": `public, max-age=${WEATHER_STALE_MS / 1000}` } })); this.saved.cache = "edge"; } catch { /* Local shared cache still works. */ }
        }
        return { forecast: this.saved };
      } catch { error = "Weather provider unavailable or timed out."; }
      finally { clearTimeout(timer); }
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
    }
    this.retryAt = this.clock() + 10 * 60_000;
    return this.fallback(this.clock(), error);
  }
  private fallback(now: number, error: string): ForecastResponse {
    return { forecast: this.saved && now - this.saved.fetchedAt <= WEATHER_STALE_MS ? { ...this.saved, stale: true, error } : null, error, retryAt: this.retryAt };
  }
}
// Cache entries survive process upgrades. Validate the shape needed by map and
// detail consumers rather than trusting an arbitrary JSON object from storage.
function validCachedForecast(value: unknown, now: number): value is Forecast {
  if (!value || typeof value !== "object") return false;
  const cached = value as Forecast;
  if (cached.version !== 1 || !Number.isFinite(cached.fetchedAt) || cached.fetchedAt > now || !Array.isArray(cached.cells) || cached.cells.length !== WEATHER_GRID.length) return false;
  return cached.cells.every((cell, i) => {
    const point = WEATHER_GRID[i];
    if (!cell || cell.id !== point.id || cell.lat !== point.lat || cell.lng !== point.lng || !Number.isFinite(cell.modelLat) || !Number.isFinite(cell.modelLng) || !Array.isArray(cell.hours) || cell.hours.length < 2) return false;
    return cell.hours.every((hour, j) => hour && Number.isFinite(hour.time) && (j === 0 || hour.time > cell.hours[j - 1].time) && ["cloud", "low", "mid", "high", "visibility", "precipitation", "direct"].every(key => {
      const n = hour[key as keyof typeof hour];
      return n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0 && (!["cloud", "low", "mid", "high"].includes(key) || n <= 100));
    }));
  });
}
let service: WeatherService | undefined;
export function regionalForecast() {
  service ??= new WeatherService(fetch, Date.now, (globalThis as unknown as { caches?: { default?: SharedCache } }).caches?.default);
  return service.get();
}
