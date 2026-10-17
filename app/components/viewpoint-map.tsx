"use client";
import { prefersReducedMotion } from "../../lib/motion";
import { useEffect, useReducer, useRef, useState, type PointerEvent } from "react";
import { LocateFixed, Minus, Plus } from "lucide-react";
import type { Viewpoint } from "../../lib/types";
import { mapFocusOffset, mapFramePoints, mapViewportPadding, viewpointPanOptions, visibleRecommendation, type MapLocation } from "../../lib/map-experience";
import type * as Leaflet from "leaflet";
import { addForecastLayer, type MapForecastState } from "../../lib/map-forecast-layer";
import { terrainState } from "../../lib/terrain";
import { sunPreviewViewpoint } from "../../lib/sun-preview";
import { EMPTY_MAP_PREVIEW, mapPreviewReducer, mapPreviewZoom, restoreMapPreviewCamera } from "../../lib/map-preview";
import MapSpotPreview from "./map-spot-preview";

type Props = {
  viewpoints: Viewpoint[]; recommendations: Viewpoint[]; highlightedIds: string[];
  activeId: string | null; focusedId?: string | null; onSelect: (v: Viewpoint) => void; location: MapLocation | null;
  onLocate: () => void; locating: boolean; locationAccess: boolean; searching: boolean; expanded: boolean;
  forecastState: Omit<MapForecastState, "selected">; onCenter: (point: MapLocation) => void;
};
export default function ViewpointMap({ viewpoints, recommendations, highlightedIds, activeId, focusedId, onSelect, location, onLocate, locating, locationAccess, searching, expanded, forecastState, onCenter }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null), layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null), markers = useRef(new Map<string, Leaflet.CircleMarker>());
  const selectRef = useRef(onSelect), frameRef = useRef(false), targetZoom = useRef(12);
  const drag = useRef<{ y: number; zoom: number; pointer: number } | null>(null);
  const animation = useRef<number | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVisible = useRef("");
  const lastRecommendations = useRef(recommendations);
  const forecastLayer = useRef<ReturnType<typeof addForecastLayer> | null>(null), centerCallback = useRef(onCenter);
  centerCallback.current = onCenter;
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [tilesFailed, setTilesFailed] = useState(false);
  const [zoom, setZoom] = useState(12);
  const [previewState, dispatchPreview] = useReducer(mapPreviewReducer, EMPTY_MAP_PREVIEW);
  const previewStateRef = useRef(previewState); previewStateRef.current = previewState;
  const hoverExit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardId = previewState.hoveredId ?? previewState.pinnedId;
  const card = viewpoints.find(v => v.id === cardId) ?? null;
  const preview = sunPreviewViewpoint(viewpoints, focusedId, previewState.hoveredId, previewState.pinnedId ?? activeId);
  const locateLabel = location ? "Back to my location" : locating ? "Finding your location…" : locationAccess ? "Retry device location" : "Find my location";
  const keepPreview = () => { if (hoverExit.current !== null) clearTimeout(hoverExit.current); hoverExit.current = null; };
  const leavePreview = (id: string) => {
    keepPreview();
    hoverExit.current = setTimeout(() => { hoverExit.current = null; dispatchPreview({ type: "leave", id }); }, 180);
  };
  const closePreview = () => {
    keepPreview(); cancelFocus();
    const returnView = previewStateRef.current.returnView;
    dispatchPreview({ type: "close" });
    const map = mapRef.current;
    if (map && returnView) {
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      animation.current = null;
      restoreMapPreviewCamera(map, returnView, prefersReducedMotion());
      targetZoom.current = returnView.zoom;
    }
  };
  selectRef.current = onSelect;
  const reducedMotion = () => prefersReducedMotion();
  const padding = () => {
    const home = container.current?.closest(".map-home");
    const mapBox = container.current?.getBoundingClientRect();
    const top = home?.querySelector(".map-topbar")?.getBoundingClientRect();
    const dock = home?.querySelector('.recommendation-dock:not([hidden]):not([data-hidden="true"])')?.getBoundingClientRect();
    return {
      paddingTopLeft: [28, top && mapBox ? top.bottom - mapBox.top + 26 : 180] as [number, number],
      paddingBottomRight: [72, dock && mapBox ? mapBox.bottom - dock.top + 26 : 140] as [number, number],
    };
  };
  const cancelFocus = () => { if (focusTimer.current !== null) clearTimeout(focusTimer.current); focusTimer.current = null; };
  const focusPoint = (point: MapLocation, target?: number) => {
    const map = mapRef.current, L = leafletRef.current;
    if (!map || !L) return;
    const size = map.getSize(), offset = mapFocusOffset(size.x, size.y, padding());
    map.stop();
    const zoom = target ?? map.getZoom();
    const center = map.unproject(map.project([point.lat, point.lng], zoom).subtract(L.point(offset)), zoom);
    if (zoom === map.getZoom()) map.panTo(center, viewpointPanOptions(reducedMotion()));
    else map.flyTo(center, zoom, { animate: !reducedMotion(), duration: .55 });
    targetZoom.current = zoom;
  };
  useEffect(() => {
    let cancelled = false;
    let removeBasemap: (() => void) | undefined;
    import("leaflet").then(L => {
      if (cancelled || !container.current) return;
      leafletRef.current = L;
      const map = L.map(container.current, {
        preferCanvas: true, zoomControl: false, scrollWheelZoom: true,
        touchZoom: true, zoomSnap: 0, zoomDelta: 1, minZoom: 3, maxZoom: 19,
        wheelPxPerZoomLevel: 110, zoomAnimation: true,
      }).setView([37.77, -122.43], 12);
      mapRef.current = map; layerRef.current = L.layerGroup().addTo(map);
      map.on("click", closePreview);
      map.on("keydown", event => { if (event.originalEvent.key === "Escape") closePreview(); });
      forecastLayer.current = addForecastLayer(L, map);
      map.on("moveend", () => { const p = map.getCenter(); centerCallback.current({ lat: p.lat, lng: p.lng }); });
      // Load the vector renderer only on the client, after Leaflet is ready.
      import("../../lib/map-basemap").then(({ addBasemap }) => {
        if (!cancelled) removeBasemap = addBasemap(L, map, setTilesFailed);
      }).catch(() => {
        if (cancelled) return;
        let failures = 0;
        const raster = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
        }).on("tileerror", () => { if (++failures >= 3) setTilesFailed(true); })
          .on("tileload", () => { failures = 0; setTilesFailed(false); }).addTo(map);
        removeBasemap = () => { raster.remove(); };
      });
      map.on("zoom", () => setZoom(map.getZoom()));
      map.on("zoomend", () => { targetZoom.current = map.getZoom(); });
      map.on("dragstart", cancelFocus);
      const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      observer.observe(container.current); map.on("unload", () => observer.disconnect());
      setReady(true);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      keepPreview();
      cancelFocus();
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      animation.current = null; drag.current = null;
      removeBasemap?.();
      forecastLayer.current?.remove(); forecastLayer.current = null;
      mapRef.current?.remove(); mapRef.current = null; markers.current.clear();
      layerRef.current = null; leafletRef.current = null;
    };
  }, []);
  useEffect(() => {
    const L = leafletRef.current, layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers(); markers.current.clear();
    dispatchPreview({ type: "reconcile", ids: viewpoints.map(v => v.id) });
    for (const v of viewpoints) {
      const marker = L.circleMarker([v.lat, v.lng], {
        radius: 5, fillColor: "#a78c6b", color: "#fffaf3", weight: 2, fillOpacity: .9, bubblingMouseEvents: false,
      });
      marker.on("click", () => {
        keepPreview(); cancelFocus();
        const alreadyPinned = previewStateRef.current.pinnedId === v.id;
        if (alreadyPinned) { closePreview(); return; }
        const map = mapRef.current;
        if (!map) return;
        map.stop();
        const center = map.getCenter();
        dispatchPreview({ type: "pin", id: v.id, view: { lat: center.lat, lng: center.lng, zoom: map.getZoom() } });
        focusPoint(v, mapPreviewZoom(map.getZoom(), map.getMaxZoom()));
      });
      marker.on("mouseover", () => { keepPreview(); dispatchPreview({ type: "hover", id: v.id }); });
      marker.on("mouseout", () => leavePreview(v.id));
      marker.addTo(layer); markers.current.set(v.id, marker);
    }
    if (location) {
      L.circle([location.lat, location.lng], { radius: 140, color: "#3e7168", weight: 1, fillOpacity: .1, interactive: false }).addTo(layer);
      L.circleMarker([location.lat, location.lng], { radius: 8, fillColor: "#3e7168", color: "white", weight: 3, fillOpacity: 1 })
        .bindTooltip(location.label ? `Near ${location.label} (city center)` : "Your location").addTo(layer);
    }
  }, [ready, viewpoints, location]);
  // Hover previews the sun and highlights a pin; only selection moves the camera.
  useEffect(() => {
    const highlighted = new Set(highlightedIds);
    for (const [id, marker] of markers.current) {
      const active = id === preview?.id, shown = highlighted.has(id);
      marker.setStyle({ radius: active ? 13 : shown ? 10 : 5, fillColor: active ? "#392115" : shown ? "#dc632d" : "#a78c6b", weight: active ? 4 : shown ? 3 : 2, fillOpacity: shown || active ? 1 : .8 });
      if (shown || active) marker.bringToFront();
    }
  }, [ready, viewpoints, location, highlightedIds, preview?.id]);
  useEffect(() => {
    if (!ready) return;
    forecastLayer.current?.update({ ...forecastState, selected: preview });
    for (const v of viewpoints) {
      const state = terrainState(v, forecastState.time, forecastState.terrain?.profiles[v.id]);
      const blocked = state.state === "blocked";
      markers.current.get(v.id)?.setStyle({ dashArray: blocked ? "3 3" : undefined, color: blocked ? "#694d6e" : "#fffaf3" });
    }
  }, [ready, forecastState, viewpoints, preview]);
  useEffect(() => {
    if (!ready || !focusedId) return;
    const target = viewpoints.find(v => v.id === focusedId);
    if (!target) return;
    cancelFocus();
    focusTimer.current = setTimeout(() => { focusTimer.current = null; focusPoint(target); }, reducedMotion() ? 0 : 100);
    return cancelFocus;
  }, [ready, focusedId, viewpoints]);
  useEffect(() => {
    const L = leafletRef.current, map = mapRef.current;
    if (!ready || !L || !map || (!recommendations.length && !location)) return;
    const points = mapFramePoints(recommendations, location, searching);
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]));
    const size = map.getSize();
    const safe = mapViewportPadding(size.x, size.y, padding());
    const options = { ...safe, maxZoom: points.length === 1 ? 12 : 14, animate: frameRef.current && !reducedMotion(), duration: .55 };
    cancelFocus(); keepPreview(); dispatchPreview({ type: "close" });
    map.stop();
    if (searching && recommendations[0]) {
      const inset = L.point(safe.paddingTopLeft).add(L.point(safe.paddingBottomRight));
      const zoom = Math.max(10, Math.min(options.maxZoom, map.getBoundsZoom(bounds, false, inset)));
      focusPoint(recommendations[0], zoom);
    } else if (options.animate) map.flyToBounds(bounds, options); else map.fitBounds(bounds, options);
    frameRef.current = true;
  }, [ready, recommendations, location, searching]);
  useEffect(() => {
    const map = mapRef.current, L = leafletRef.current;
    const next = recommendations.filter(v => highlightedIds.includes(v.id)).map(v => v.id).join("|");
    // The carousel reports its first measured cards one frame after its data
    // changes. That reset must not override the new category's camera target.
    if (lastRecommendations.current !== recommendations) { lastRecommendations.current = recommendations; lastVisible.current = ""; return; }
    if (!ready || !map || !L || !next) return;
    const changed = !!lastVisible.current && next !== lastVisible.current;
    lastVisible.current = next;
    if (!changed) return;
    const shown = visibleRecommendation(recommendations, highlightedIds);
    if (shown) focusPoint(shown);
  }, [ready, recommendations, highlightedIds]);
  const smoothZoom = (delta: number) => {
    const map = mapRef.current; if (!map) return;
    cancelFocus();
    const next = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), targetZoom.current + delta));
    map.flyTo(map.getCenter(), next, { animate: !reducedMotion(), duration: .55 });
    // flyTo stops the previous flight synchronously, emitting zoomend. Preserve
    // this click's target after that event so rapid + / - clicks accumulate.
    targetZoom.current = next;
  };
  const dragZoom = (value: number) => {
    const map = mapRef.current; if (!map) return;
    const next = Math.max(3, Math.min(19, value)); targetZoom.current = next;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = requestAnimationFrame(() => { map.setZoom(next, { animate: false }); animation.current = null; });
  };
  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.shiftKey || e.button !== 0 || !mapRef.current) return;
    e.preventDefault(); e.stopPropagation(); cancelFocus(); mapRef.current.stop(); mapRef.current.dragging.disable();
    drag.current = { y: e.clientY, zoom: mapRef.current.getZoom(), pointer: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const endDrag = () => { if (!drag.current) return; drag.current = null; mapRef.current?.dragging.enable(); };
  return <div className={`map-shell immersive-map ${expanded ? "map-expanded" : ""}`}>
    <div className="leaflet-map" ref={container} role="region" aria-label={`Interactive map of ${viewpoints.length} viewpoints. Drag to pan; pinch, scroll, or Shift-drag vertically to zoom.`}
      onPointerLeave={() => { const id = previewStateRef.current.hoveredId; if (id) leavePreview(id); }} onPointerDownCapture={startDrag}
      onPointerMoveCapture={e => { if (drag.current && e.pointerId === drag.current.pointer) { e.preventDefault(); e.stopPropagation(); dragZoom(drag.current.zoom + (drag.current.y - e.clientY) / 90); } }}
      onPointerUpCapture={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} />
    <MapSpotPreview map={mapRef.current} viewpoint={card} sunViewpoint={preview} time={forecastState.time} location={location} pinned={card?.id === previewState.pinnedId}
      onEnter={keepPreview} onLeave={leavePreview} onClose={closePreview} onOpen={v => selectRef.current(v)} />
    {!ready && <div className="map-loading" role="status">{error ? "The map couldn’t load. You can still explore the spots below." : "Finding a fresh perspective…"}</div>}
    {tilesFailed && <p className="tile-notice" role="status">Map tiles are unavailable. Your spots are still here; reconnect to see the map.</p>}
    <div className="map-tools" aria-label="Map controls">
      <button className="recenter-map" disabled={locating || !ready} title={locateLabel} aria-label={locateLabel} onClick={() => {
        const map = mapRef.current; cancelFocus();
        if (location && map) focusPoint(location, Math.max(12, map.getZoom())); else onLocate();
      }}><LocateFixed size={20} /></button>
      <div className="zoom-controls">
        <button disabled={!ready || zoom >= 19} onClick={() => smoothZoom(1)} aria-label="Zoom in" title="Zoom in"><Plus size={20} /></button>
        <label className="drag-zoom" title="Drag up to zoom in, down to zoom out"><span className="sr-only">Drag to zoom</span><input type="range" min="3" max="19" step="0.05" value={zoom} disabled={!ready} aria-label="Map zoom; drag up to zoom in" aria-valuetext={`Zoom level ${zoom.toFixed(1)}`} onPointerDown={() => { cancelFocus(); mapRef.current?.stop(); }} onChange={e => dragZoom(Number(e.target.value))} /></label>
        <button disabled={!ready || zoom <= 3} onClick={() => smoothZoom(-1)} aria-label="Zoom out" title="Zoom out"><Minus size={20} /></button>
      </div><span className="zoom-hint">Drag to zoom</span>
    </div>
  </div>;
}
