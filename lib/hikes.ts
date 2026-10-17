import type { Viewpoint } from "./types";
import type { TrailRoute } from "./visit";
import type { Preferences } from "./preferences";
import { distanceMiles } from "./discovery";

export type HikeRoute = { viewpointId: string; route: TrailRoute };
export type HikeMatch = HikeRoute & { viewpoint: Viewpoint; miles: number; steps: [number, number]; away: number | null };
export type HikeBudget = { unit: "miles" | "steps"; amount: number };
export function matchingHikes(routes: HikeRoute[], viewpoints: Viewpoint[], budget: HikeBudget, preferences: Preferences, location: { lat: number; lng: number } | null): HikeMatch[] {
  if (!Number.isFinite(budget.amount) || budget.amount <= 0) return [];
  const places = new Map(viewpoints.map(v => [v.id, v]));
  return routes.flatMap(({ viewpointId, route }) => {
    const viewpoint = places.get(viewpointId), miles = route.distanceMiles.value;
    if (!viewpoint || !["loop", "round-trip"].includes(route.distanceType) || route.distanceMiles.status !== "reported" || miles === null || !Number.isFinite(miles) || miles <= 0) return [];
    if (preferences.tags.length && !viewpoint.tags.some(tag => preferences.tags.includes(tag))) return [];
    const steps: [number, number] = [Math.round(miles * 1900), Math.ceil(miles * 2600 - 1e-8)];
    if ((budget.unit === "miles" ? miles : steps[1]) > budget.amount) return [];
    const start = route.startCoordinates ?? viewpoint;
    const away = location ? distanceMiles(location, start) : null;
    if (away !== null && preferences.radius !== null && away > preferences.radius) return [];
    return [{ viewpointId, route, viewpoint, miles, steps, away }];
  }).sort((a, b) => (a.away ?? 0) - (b.away ?? 0) || b.miles - a.miles || a.route.name.localeCompare(b.route.name));
}
