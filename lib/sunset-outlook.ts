import type { Forecast, ForecastHour, TerrainProfile } from "./forecast-types";
import { destination, solarDay, sunPosition, type Point } from "./solar";
import { terrainState } from "./terrain";
import { weatherAt } from "./weather";
export type Outlook = { label: "More favorable" | "Mixed" | "Likely obscured" | "Weather unavailable"; explanation: string };
export function viewingOutlook(local: ForecastHour | null, west: ForecastHour | null = null): Outlook {
  if (!local || local.low === null || local.visibility === null || local.precipitation === null || local.cloud === null) return { label: "Weather unavailable", explanation: "Required forecast fields are missing. Visibility cannot be assessed." };
  const samples = [local, west].filter((s): s is ForecastHour => !!s);
  if (samples.some(s => s.low !== null && s.low >= 75)) return { label: "Likely obscured", explanation: "Extensive low clouds may obscure the sunset horizon." };
  if (samples.some(s => s.visibility !== null && s.visibility < 5000)) return { label: "Likely obscured", explanation: "Forecast visibility below 5 km may obscure distant views." };
  if (samples.some(s => s.precipitation !== null && s.precipitation >= .5)) return { label: "Likely obscured", explanation: "Forecast precipitation may obscure the view." };
  if (samples.some(s => (s.low !== null && s.low >= 30) || (s.mid !== null && s.mid >= 60) || (s.visibility !== null && s.visibility < 15000) || (s.precipitation !== null && s.precipitation > 0))) return { label: "Mixed", explanation: "Clouds, haze or precipitation could interrupt the view." };
  if (local.mid === null || (west && (west.low === null || west.mid === null || west.visibility === null || west.precipitation === null))) return { label: "Mixed", explanation: "Some cloud-layer or horizon forecast fields are missing." };
  return { label: "More favorable", explanation: "Limited low clouds and better regional visibility favor an open view. High clouds alone do not rule it out." };
}
export function sunsetOutlook(point: Point, time: number, forecast: Forecast | null, now: number) {
  const day = solarDay(point, time);
  if (day.sunset === null || day.sunsetBearing === null) return { ...viewingOutlook(null), horizonSampled: false };
  const horizon = weatherAt(forecast, destination(point, day.sunsetBearing, 30_000), day.sunset, now);
  return { ...viewingOutlook(weatherAt(forecast, point, day.sunset, now), horizon), horizonSampled: !!horizon };
}
export function sunlightState(point: Point, time: number, forecast: Forecast | null, profile: TerrainProfile | null, now: number) {
  const terrain = terrainState(point, time, profile);
  if (terrain.state === "night" || terrain.state === "twilight") return { label: terrain.state === "night" ? "Sun below horizon · night" : "Sun below horizon · civil twilight", terrain };
  if (terrain.state === "blocked") return { label: "Sun estimated blocked by terrain", terrain };
  const w = weatherAt(forecast, point, time, now), outlook = viewingOutlook(w);
  const suffix = terrain.state === "unknown" ? " · terrain unknown" : "";
  if (outlook.label === "Weather unavailable") return { label: `Sun above horizon · weather unavailable${suffix}`, terrain };
  // Instantaneous horizontal radiation is supporting evidence only above 10°;
  // near-horizon values are small even in clear weather, so do not ratio them.
  if (outlook.label === "Likely obscured") return { label: `Direct sunlight less likely${suffix}`, terrain };
  if (w?.direct !== null && w?.direct !== undefined && sunPosition(point, time).elevation > 10 && w.direct >= 100 && outlook.label === "More favorable") return { label: `Direct sunlight more likely${suffix}`, terrain };
  return { label: `Direct sunlight uncertain${suffix}`, terrain };
}
