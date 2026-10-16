import { distanceMiles, SCENERY } from "./discovery";
import type { Viewpoint } from "./types";

export type Preferences = { tags: string[]; radius: number | null; priority: "nearby" | "scenery" };
export const DEFAULT_PREFERENCES: Preferences = { tags: [], radius: null, priority: "nearby" };
export const PREFERENCES_KEY = "sunspot.preferences.v1";
export function readPreferences(value: string | null): Preferences | null {
  try {
    if (!value) return null;
    const p = JSON.parse(value);
    if (!p || !Array.isArray(p.tags) || !p.tags.every((t: unknown) => typeof t === "string" && SCENERY.includes(t as typeof SCENERY[number])) || ![null, 10, 25, 50].includes(p.radius) || !["nearby", "scenery"].includes(p.priority)) return null;
    return { tags: [...new Set<string>(p.tags)], radius: p.radius, priority: p.priority };
  } catch { return null; }
}
export function personalizedViews(all: Viewpoint[], preferences: Preferences, location: { lat: number; lng: number } | null) {
  const matches = (v: Viewpoint) => v.tags.filter(t => preferences.tags.includes(t)).length;
  return all.filter(v => !location || preferences.radius === null || distanceMiles(location, v) <= preferences.radius).sort((a, b) => {
    const scenery = matches(b) - matches(a);
    const distance = location ? distanceMiles(location, a) - distanceMiles(location, b) : 0;
    return (preferences.priority === "scenery" ? scenery || distance : distance || scenery)
      || (a.featured ?? 99999) - (b.featured ?? 99999) || a.name.localeCompare(b.name);
  });
}
