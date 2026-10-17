import { distanceMiles } from "./discovery";
import type { Preferences } from "./preferences";
import type { Viewpoint } from "./types";

const sceneryNames: Record<string, string> = { ocean: "ocean", bay: "bay and harbor", water: "lake and river", skyline: "skyline", bridges: "bridge", hills: "hills", greenery: "nature" };

/** Explain actual matches; never imply route effort or weather influenced ranking. */
export function recommendationReasons(candidates: Viewpoint[], preferences: Preferences, location: { lat: number; lng: number } | null, scenery = "") {
  const closest = new Set(location ? [...candidates].sort((a, b) => distanceMiles(location, a) - distanceMiles(location, b)).slice(0, 3).map(v => v.id) : []);
  return Object.fromEntries(candidates.map(viewpoint => {
    const match = viewpoint.tags.find(tag => preferences.tags.includes(tag));
    let reason: string;
    if (scenery && viewpoint.tags.includes(scenery)) reason = `${sceneryNames[scenery] ?? scenery} scenery you selected`;
    else if (preferences.priority === "scenery" && match) reason = `Matches your ${sceneryNames[match] ?? match} preference`;
    else if (location && closest.has(viewpoint.id) && distanceMiles(location, viewpoint) <= 80) reason = "One of your closest matches";
    else if (match) reason = `Matches your ${sceneryNames[match] ?? match} preference`;
    else reason = viewpoint.featured !== null ? "A featured viewpoint" : "Another view to explore";
    return [viewpoint.id, reason];
  }));
}
