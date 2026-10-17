import type * as Leaflet from "leaflet";
import { viewpointPanOptions } from "./map-experience";
import type { MapOverlayRect } from "./sun-preview";

export type MapPreviewCamera = { lat: number; lng: number; zoom: number };
export type MapPreviewState = { hoveredId: string | null; pinnedId: string | null; returnView: MapPreviewCamera | null };
export type MapPreviewAction =
  | { type: "hover" | "leave"; id: string }
  | { type: "pin"; id: string; view: MapPreviewCamera }
  | { type: "close" }
  | { type: "reconcile"; ids: string[] };
export const EMPTY_MAP_PREVIEW: MapPreviewState = { hoveredId: null, pinnedId: null, returnView: null };

export function mapPreviewReducer(state: MapPreviewState, action: MapPreviewAction): MapPreviewState {
  switch (action.type) {
    case "hover": return { ...state, hoveredId: action.id };
    // A delayed leave from the previous pin must not dismiss a newer preview.
    case "leave": return state.hoveredId === action.id ? { ...state, hoveredId: null } : state;
    case "pin": return state.pinnedId === action.id ? EMPTY_MAP_PREVIEW : {
      hoveredId: null, pinnedId: action.id, returnView: state.returnView ?? action.view,
    };
    case "close": return EMPTY_MAP_PREVIEW;
    case "reconcile": {
      const pinnedId = state.pinnedId && action.ids.includes(state.pinnedId) ? state.pinnedId : null;
      return {
        hoveredId: state.hoveredId && action.ids.includes(state.hoveredId) ? state.hoveredId : null,
        pinnedId, returnView: pinnedId ? state.returnView : null,
      };
    }
  }
}

/** Restore the exact camera, without applying the selected-pin layout offset. */
export function restoreMapPreviewCamera(map: Pick<Leaflet.Map, "stop" | "getZoom" | "panTo" | "flyTo">, view: MapPreviewCamera, reducedMotion: boolean) {
  map.stop();
  const center: [number, number] = [view.lat, view.lng];
  if (map.getZoom() === view.zoom) map.panTo(center, viewpointPanOptions(reducedMotion));
  else map.flyTo(center, view.zoom, { animate: !reducedMotion, duration: .48 });
}

/** A small step closer; switching pins never zooms repeatedly past street level. */
export function mapPreviewZoom(current: number, maximum = 19) {
  return Math.min(maximum, Math.max(current, Math.min(16, Math.max(13, current + .75))));
}

/** Keep the photo card on screen while its tip continues to point at the pin. */
export function mapPreviewPlacement(x: number, y: number, width: number, height: number, cardWidth: number, cardHeight: number, avoid?: MapOverlayRect) {
  const inset = Math.min(cardWidth / 2 + 12, width / 2);
  const center = Math.max(inset, Math.min(width - inset, x));
  const below = y - cardHeight - 22 < 12;
  const visible = x >= 0 && x <= width && y >= 0 && y <= height;
  if (!avoid) return { x: center, y: below ? y + 22 : y - 22, tip: x - center, below, visible, maxHeight: Math.max(1, height - 24) };
  const limit = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const overlaps = (left: number, top: number, h: number) => left < avoid.right - .01 && left + cardWidth > avoid.left + .01 && top < avoid.bottom - .01 && top + h > avoid.top + .01;
  const candidates = (h: number) => {
    const left = center - cardWidth / 2;
    const preferred = below ? y + 22 : y - h - 22;
    const distance = (p: { left: number; top: number }) => Math.hypot(Math.max(p.left - x, 0, x - p.left - cardWidth), Math.max(p.top - y, 0, y - p.top - h)) + ((p.top >= y) === below ? 0 : 2);
    return [
      [left, preferred], [left, below ? y - h - 22 : y + 22],
      [left, avoid.top - h], [left, avoid.bottom],
      [avoid.left - cardWidth, preferred], [avoid.right, preferred],
    ].map(([l, t]) => ({ left: limit(l, 12, Math.max(12, width - cardWidth - 12)), top: limit(t, 12, Math.max(12, height - h - 12)) }))
      .filter(p => !overlaps(p.left, p.top, h))
      .filter(p => !(x > p.left - 18 && x < p.left + cardWidth + 18 && y > p.top - 18 && y < p.top + h + 18))
      .sort((a, b) => distance(a) - distance(b));
  };
  let maxHeight = Math.max(1, height - 24), h = Math.min(cardHeight, maxHeight);
  let choices = candidates(h);
  if (!choices.length) {
    // A short viewport may not fit the whole guide/tip beside the sun. Give
    // the card its own scroll area rather than covering the direction symbol.
    let cursor = 12, available = 0;
    for (const [top, bottom] of [[avoid.top, avoid.bottom], [y - 22, y + 22]].sort((a, b) => a[0] - b[0])) {
      available = Math.max(available, Math.min(height - 12, top) - cursor);
      cursor = Math.max(cursor, bottom);
    }
    maxHeight = Math.max(1, available, height - 12 - cursor);
    h = Math.min(cardHeight, maxHeight); choices = candidates(h);
  }
  const rect = choices[0] ?? { left: center - cardWidth / 2, top: 12 };
  const isBelow = rect.top >= y;
  return { x: rect.left + cardWidth / 2, y: isBelow ? rect.top : rect.top + h, tip: x - rect.left - cardWidth / 2, below: isBelow, visible, maxHeight };
}
