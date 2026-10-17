import type { Viewpoint } from "./types";

export type MapOverlayRect = { left: number; top: number; right: number; bottom: number };

/** Explicit detail selection wins; pointer previews never move the camera. */
export function sunPreviewViewpoint(viewpoints: Viewpoint[], focusedId: string | null | undefined, hoveredId: string | null, activeId: string | null) {
  for (const id of [focusedId, hoveredId, activeId]) {
    const match = id ? viewpoints.find(v => v.id === id) : undefined;
    if (match) return match;
  }
  return null;
}

/** Anchor a compact direction pill inside the viewport, including small phones. */
export function sunBadgeAnchor(x: number, y: number, width: number, height: number, pillWidth = 205) {
  const inset = Math.min(pillWidth / 2 + 12, width / 2);
  return { x: Math.max(inset, Math.min(width - inset, x)), y: Math.max(Math.min(48, height), Math.min(height - 12, y)) };
}

/** Shared geometry keeps the preview clear of the actual sun and its label.
 * Only the card moves; the sun's ray always retains its calculated bearing.
 * Clearance includes the card's short entrance animation and the icon rays.
 */
export function mapSunLayout(origin: { x: number; y: number }, bearing: number, width: number, height: number, pillWidth = 205, pillHeight = 32) {
  const angle = bearing * Math.PI / 180, length = Math.min(130, width * .24);
  const end = { x: origin.x + Math.sin(angle) * length, y: origin.y - Math.cos(angle) * length };
  const badge = sunBadgeAnchor(end.x, end.y + 54, width, height, pillWidth);
  const avoid: MapOverlayRect = {
    left: Math.max(0, Math.min(end.x - 36, badge.x - pillWidth / 2 - 18)),
    right: Math.min(width, Math.max(end.x + 36, badge.x + pillWidth / 2 + 18)),
    top: Math.max(0, Math.min(end.y - 36, badge.y - pillHeight - 18)),
    bottom: Math.min(height, Math.max(end.y + 36, badge.y + 18)),
  };
  return { end, badge, avoid };
}
