"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { Viewpoint } from "../../lib/types";
import type * as Leaflet from "leaflet";
export default function ViewpointMap({ viewpoints, onSelect, location }: { viewpoints: Viewpoint[]; onSelect: (v: Viewpoint) => void; location: { lat: number; lng: number; label?: string } | null }) {
  const container = useRef<HTMLDivElement>(null), mapRef = useRef<Leaflet.Map | null>(null), layerRef = useRef<Leaflet.LayerGroup | null>(null), leafletRef = useRef<typeof Leaflet | null>(null), selectRef = useRef(onSelect);
  const [ready, setReady] = useState(false), [error, setError] = useState(false);
  selectRef.current = onSelect;
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then(L => {
      if (cancelled || !container.current) return;
      leafletRef.current = L;
      const map = L.map(container.current, { preferCanvas: true, zoomControl: true, scrollWheelZoom: false }).setView([37.8, -122.2], 9);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }).addTo(map);
      mapRef.current = map; layerRef.current = L.layerGroup().addTo(map); setReady(true);
      const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(container.current); map.on("unload", () => observer.disconnect());
    }).catch(() => setError(true));
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const L = leafletRef.current, map = mapRef.current, layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    for (const v of viewpoints) { const marker = L.circleMarker([v.lat, v.lng], { radius: v.photos.length ? 8 : 5, fillColor: v.photos.length ? "#dc632d" : "#b28662", color: "#fffaf3", weight: 2, opacity: 1, fillOpacity: .95 }); const label = document.createElement("span"); label.textContent = v.name; marker.bindTooltip(label, { direction: "top" }); marker.on("click", () => selectRef.current(v)); marker.addTo(layer); }
    if (location) L.circleMarker([location.lat, location.lng], { radius: 9, fillColor: "#3e7168", color: "white", weight: 3, fillOpacity: 1 }).bindTooltip(location.label ? `Near ${location.label} (city center)` : "Your location").addTo(layer);
    if (viewpoints.length) map.fitBounds(L.latLngBounds(viewpoints.map(v => [v.lat, v.lng] as [number, number])), { padding: [35, 35], maxZoom: 13 });
  }, [ready, viewpoints, location]);
  return <div className="map-shell"><div className="leaflet-map" ref={container} role="region" aria-label={`Interactive map of ${viewpoints.length} viewpoints`} />{!ready && <div className="map-loading">{error ? "The map couldn’t load. You can browse every place in the list." : "Unfolding the map…"}</div>}<div className="map-legend"><MapPin size={14} /><span>Every dot, a new perspective</span><span className="map-dot" />Photo available</div></div>;
}
