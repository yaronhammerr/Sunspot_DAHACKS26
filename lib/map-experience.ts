import { distanceMiles } from "./discovery";
import type { Viewpoint } from "./types";

export type MapLocation = { lat: number; lng: number; label?: string };
export type MapPadding = { paddingTopLeft: [number, number]; paddingBottomRight: [number, number] };

export function mapViewportPadding(width: number, height: number, padding: MapPadding): MapPadding {
  const inset = (value: number, size: number) => Math.max(0, Math.min(value, Math.max(0, (size - 80) / 2)));
  return {
    paddingTopLeft: [inset(padding.paddingTopLeft[0], width), inset(padding.paddingTopLeft[1], height)],
    paddingBottomRight: [inset(padding.paddingBottomRight[0], width), inset(padding.paddingBottomRight[1], height)],
  };
}

// Place the focused pin in the usable map area between the floating toolbar
// and cards. Clamp on short screens so overlays never invert the visible area.
export function mapFocusOffset(width: number, height: number, padding: MapPadding): [number, number] {
  const safe = mapViewportPadding(width, height, padding);
  return [
    (safe.paddingTopLeft[0] - safe.paddingBottomRight[0]) / 2,
    (safe.paddingTopLeft[1] - safe.paddingBottomRight[1]) / 2,
  ];
}

// Pan at the current scale instead of Leaflet's flight curve, which zooms far
// out on long trips. Every switch finishes quickly, even across the region.
export function viewpointPanOptions(reducedMotion: boolean) {
  return { animate: !reducedMotion, duration: reducedMotion ? 0 : .48, easeLinearity: .25, noMoveStart: true };
}

// Preserve preference ranking within a local pool, including at least the three
// closest candidates in sparse areas instead of fitting the entire catalog.
export function localRecommendations(ranked: Viewpoint[], location: MapLocation | null) {
  if (!location) return ranked.slice(0, 12);
  const nearest = [...ranked].sort((a, b) => distanceMiles(location, a) - distanceMiles(location, b));
  const thirdOrLast = nearest[Math.min(2, nearest.length - 1)];
  const radius = Math.max(25, thirdOrLast ? distanceMiles(location, thirdOrLast) : 0);
  const nearbyIds = new Set(nearest.filter(v => distanceMiles(location, v) <= radius).slice(0, 24).map(v => v.id));
  return ranked.filter(v => nearbyIds.has(v.id)).slice(0, 12);
}

export function mapFramePoints(views: Viewpoint[], location: MapLocation | null, searching = false): MapLocation[] {
  const points = views.slice(0, 3).map(({ lat, lng }) => ({ lat, lng }));
  // Explicit filters explore the results, even when the user's location is
  // distant. Keep a compact group around a real recommendation; do not frame
  // an empty midpoint between the user and unrelated, scattered destinations.
  if (searching) return points.filter(p => distanceMiles(points[0], p) <= 25);
  if (!location) return points;
  if (!points.length) return [location];
  const nearby = points.some(p => distanceMiles(location, p) <= 80);
  // Without explicit filters, visitors outside coverage open on their own
  // location instead of fitting a cross-country map.
  if (!nearby) return [location];
  return [location, ...points];
}

/** A visible card is always the destination, never the center between pins. */
export function visibleRecommendation(views: Viewpoint[], ids: string[]) {
  return views.find(v => ids.includes(v.id)) ?? null;
}
