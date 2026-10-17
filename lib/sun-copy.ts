import { compass } from "./solar";

const names: Record<string, string> = { N: "north", NNE: "north-northeast", NE: "northeast", ENE: "east-northeast", E: "east", ESE: "east-southeast", SE: "southeast", SSE: "south-southeast", S: "south", SSW: "south-southwest", SW: "southwest", WSW: "west-southwest", W: "west", WNW: "west-northwest", NW: "northwest", NNW: "north-northwest" };
export function compassWords(bearing: number) { return names[compass(bearing)]; }
export function sunDirectionCopy(bearing: number, state: "above" | "unknown" | "blocked" | "night" | "twilight") {
  return state === "night" || state === "twilight" ? "Below the horizon" : `Face ${compassWords(bearing)}`;
}

/** The arrow points where to look, from the viewpoint toward the sun symbol. */
export function sunArrowHead(origin: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - origin.x, dy = end.y - origin.y, length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length;
  const tip = { x: origin.x + dx * .6, y: origin.y + dy * .6 };
  return { tip, left: { x: tip.x - ux * 11 - uy * 6, y: tip.y - uy * 11 + ux * 6 }, right: { x: tip.x - ux * 11 + uy * 6, y: tip.y - uy * 11 - ux * 6 } };
}
