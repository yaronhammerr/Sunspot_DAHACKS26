"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { LocateFixed, Minus, Plus } from "lucide-react";
import type { Viewpoint } from "../../lib/types";
import { mapFocusOffset, mapFramePoints, mapViewportPadding, viewpointPanOptions, type MapLocation } from "../../lib/map-experience";
import type * as Leaflet from "leaflet";

type Props = {
  viewpoints: Viewpoint[]; recommendations: Viewpoint[]; highlightedIds: string[];
  activeId: string | null; focusedId?: string | null; onSelect: (v: Viewpoint) => void; location: MapLocation | null;
  onLocate: () => void; locating: boolean; searching: boolean; expanded: boolean;
};
export default function ViewpointMap({ viewpoints, recommendations, highlightedIds, activeId, focusedId, onSelect, location, onLocate, locating, searching, expanded }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null), layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null), markers = useRef(new Map<string, Leaflet.CircleMarker>());
  const selectRef = useRef(onSelect), frameRef = useRef(false), targetZoom = useRef(12);
  const drag = useRef<{ y: number; zoom: number; pointer: number } | null>(null);
  const animation = useRef<number | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVisible = useRef("");
  const lastRecommendations = useRef(recommendations);
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [tilesFailed, setTilesFailed] = useState(false);
  const [zoom, setZoom] = useState(12);
  selectRef.current = onSelect;
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      cancelFocus();
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      animation.current = null; drag.current = null;
      removeBasemap?.();
      mapRef.current?.remove(); mapRef.current = null; markers.current.clear();
      layerRef.current = null; leafletRef.current = null;
    };
  }, []);
  useEffect(() => {
    const L = leafletRef.current, layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers(); markers.current.clear();
    for (const v of viewpoints) {
      const label = document.createElement("span"); label.textContent = v.name;
      const marker = L.circleMarker([v.lat, v.lng], {
        radius: 5, fillColor: "#a78c6b", color: "#fffaf3", weight: 2, fillOpacity: .9,
      }).bindTooltip(label, { direction: "top", className: "spot-tooltip" });
      marker.on("click", () => selectRef.current(v));
      marker.addTo(layer); markers.current.set(v.id, marker);
    }
    if (location) {
      L.circle([location.lat, location.lng], { radius: 140, color: "#3e7168", weight: 1, fillOpacity: .1, interactive: false }).addTo(layer);
      L.circleMarker([location.lat, location.lng], { radius: 8, fillColor: "#3e7168", color: "white", weight: 3, fillOpacity: 1 })
        .bindTooltip(location.label ? `Near ${location.label} (city center)` : "Your location").addTo(layer);
    }
  }, [ready, viewpoints, location]);
  // Hover only highlights a pin. Camera movement is reserved for selection.
  useEffect(() => {
    const highlighted = new Set(highlightedIds);
    for (const [id, marker] of markers.current) {
      const active = id === activeId, shown = highlighted.has(id);
      marker.setStyle({ radius: active ? 13 : shown ? 10 : 5, fillColor: active ? "#392115" : shown ? "#dc632d" : "#a78c6b", weight: active ? 4 : shown ? 3 : 2, fillOpacity: shown || active ? 1 : .8 });
      if (shown || active) marker.bringToFront();
      if (active) marker.openTooltip(); else marker.closeTooltip();
    }
  }, [ready, viewpoints, location, highlightedIds, activeId]);
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
    const options = { ...mapViewportPadding(size.x, size.y, padding()), maxZoom: points.length === 1 ? 12 : 14, animate: frameRef.current && !reducedMotion(), duration: .55 };
    map.stop();
    if (options.animate) map.flyToBounds(bounds, options); else map.fitBounds(bounds, options);
    frameRef.current = true;
  }, [ready, recommendations, location, searching]);
  useEffect(() => {
    const map = mapRef.current, L = leafletRef.current;
    const next = highlightedIds.join("|");
    if (lastRecommendations.current !== recommendations) { lastRecommendations.current = recommendations; lastVisible.current = next; return; }
    if (!ready || !map || !L || !next) return;
    const changed = !!lastVisible.current && next !== lastVisible.current;
    lastVisible.current = next;
    if (!changed) return;
    const shown = recommendations.filter(v => highlightedIds.includes(v.id));
    if (!shown.length) return;
    const center = L.latLngBounds(shown.map(v => [v.lat, v.lng] as [number, number])).getCenter();
    focusPoint({ lat: center.lat, lng: center.lng });
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
      onPointerDownCapture={startDrag}
      onPointerMoveCapture={e => { if (drag.current && e.pointerId === drag.current.pointer) { e.preventDefault(); e.stopPropagation(); dragZoom(drag.current.zoom + (drag.current.y - e.clientY) / 90); } }}
      onPointerUpCapture={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} />
    {!ready && <div className="map-loading" role="status">{error ? "The map couldn’t load. You can still explore the spots below." : "Finding a fresh perspective…"}</div>}
    {tilesFailed && <p className="tile-notice" role="status">Map tiles are unavailable. Your spots are still here; reconnect to see the map.</p>}
    <div className="map-tools" aria-label="Map controls">
      <button className="recenter-map" disabled={locating || !ready} title={location ? "Back to my location" : "Find my location"} aria-label={location ? "Back to my location" : "Find my location"} onClick={() => {
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
