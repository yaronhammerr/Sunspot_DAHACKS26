"use client";
import { useEffect, useState } from "react";
import type { ForecastResponse, TerrainData } from "../../lib/forecast-types";
import { WEATHER_FRESH_MS } from "../../lib/weather";

let shared: Promise<ForecastResponse> | null = null, saved: ForecastResponse | null = null, checkedAt = 0;
function loadForecast() {
  if (saved && Date.now() - checkedAt < WEATHER_FRESH_MS) return Promise.resolve(saved);
  if (!shared) shared = fetch("/api/forecast", { signal: AbortSignal.timeout(30_000) }).then(async response => {
    if (!response.ok) throw new Error("Weather unavailable.");
    const data = await response.json() as ForecastResponse;
    if (!data || !(data.forecast === null || (data.forecast?.version === 1 && Array.isArray(data.forecast.cells)))) throw new Error("Invalid weather response.");
    saved = data; checkedAt = Date.now(); return data;
  }).finally(() => { shared = null; });
  return shared;
}
export function useForecast(enabled: boolean) {
  const [data, setData] = useState<ForecastResponse>({ forecast: null });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    // Cancel delivery on unmount; the deduplicated shared fetch may complete for
    // another subscriber. Selected time is deliberately not a dependency.
    const cancellation = new AbortController();
    const load = async () => {
      if (!cancellation.signal.aborted) setLoading(true);
      try { const result = await loadForecast(); if (!cancellation.signal.aborted) setData(result); }
      catch { if (!cancellation.signal.aborted) setData(previous => ({ ...previous, error: "Weather unavailable. Solar and terrain estimates still work." })); }
      finally { if (!cancellation.signal.aborted) setLoading(false); }
    };
    void load(); const timer = setInterval(() => void load(), WEATHER_FRESH_MS);
    return () => { cancellation.abort(); clearInterval(timer); };
  }, [enabled]);
  return { ...data, loading };
}
export function useTerrain(enabled: boolean) {
  const [data, setData] = useState<TerrainData | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/terrain/horizons.json", { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error("Terrain data unavailable");
      const data = await r.json() as TerrainData;
      if (data.version !== 1 || !data.profiles) throw new Error("Invalid terrain data");
      if (!controller.signal.aborted) setData(data);
    }).catch(() => { /* Missing terrain is displayed explicitly. */ });
    return () => controller.abort();
  }, [enabled]);
  return data;
}
