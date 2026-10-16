import type * as Leaflet from "leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { getVersion, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { prepareMapStyle } from "./map-style";
import "maplibre-gl/dist/maplibre-gl.css";

// OpenFreeMap permits commercial use without registration or an API key.
// https://openfreemap.org/quick_start/ and https://openfreemap.org/tos/
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const CREDIT = '<a href="https://openfreemap.org/">OpenFreeMap</a> · &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> · &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function addBasemap(L: typeof Leaflet, map: Leaflet.Map, onUnavailable: (failed: boolean) => void) {
  let vector: Leaflet.MaplibreGL | null = null, raster: Leaflet.TileLayer | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null, disposed = false;
  const request = new AbortController();
  let detachVectorEvents = () => {};
  const clearTimeoutGuard = () => { if (timeout !== null) clearTimeout(timeout); timeout = null; };
  const removeVector = () => {
    if (!vector) return;
    detachVectorEvents(); detachVectorEvents = () => {};
    // A WebGL constructor failure can happen before the bridge owns a GL map.
    // Still remove its Leaflet listeners and partial container in that case.
    if (!vector.getMaplibreMap()) {
      const partial = vector;
      partial.onRemove = () => { partial.getContainer()?.remove(); return partial; };
    }
    const layer = vector; vector = null;
    layer.remove();
  };
  const fallback = () => {
    clearTimeoutGuard();
    if (disposed || raster) return;
    request.abort();
    removeVector();
    let errors = 0;
    raster = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).on("tileerror", () => { if (++errors >= 3) onUnavailable(true); })
      .on("tileload", () => { errors = 0; if (!disposed) onUnavailable(false); }).addTo(map);
  };
  const mountVector = (style: StyleSpecification) => {
    if (disposed || raster) return;
    const options = { style: prepareMapStyle(style), attributionControl: { customAttribution: CREDIT },
      interactive: false, renderWorldCopies: true, fadeDuration: 120, updateInterval: 16 };
    vector = maplibreGL(options);
    vector.addTo(map);
    const gl = vector.getMaplibreMap();
    let errors = 0;
    const onError = () => { if (++errors >= 3) fallback(); };
    const onStyleLoad = () => {
      if (disposed || !vector) return;
      // Keep the detailed streets, paths and labels; soften the land and water
      // to Sunspot's cream and sage without tinting or blurring the canvas.
      for (const [id, property, color] of [
        ["background", "background-color", "#f4f0e7"],
        ["water", "fill-color", "#bfd7d3"],
        ["park", "fill-color", "#dce5cf"],
        ["park", "fill-outline-color", "#c4d1b3"],
        ["landcover_wood", "fill-color", "#a9c096"],
        ["landcover_grass", "fill-color", "#becba5"],
      ] as const) if (gl.getLayer(id)) gl.setPaintProperty(id, property, color);
    };
    const onLoad = () => { clearTimeoutGuard(); if (!disposed) onUnavailable(false); };
    gl.on("error", onError);
    gl.on("webglcontextlost", fallback);
    gl.once("style.load", onStyleLoad);
    gl.once("load", onLoad);
    detachVectorEvents = () => {
      gl.off("error", onError); gl.off("webglcontextlost", fallback);
      gl.off("style.load", onStyleLoad); gl.off("load", onLoad);
    };
  };
  // Cover both the style request and initial tile load. Falling back aborts a
  // pending request so it cannot mount a second basemap after the timeout.
  timeout = setTimeout(fallback, 8000);
  try {
    // scripts/copy-map-worker.mjs copies the installed distribution unchanged.
    // A public asset bypasses Vite's HMR injection into module workers.
    setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${encodeURIComponent(getVersion())}`);
    void fetch(STYLE, { signal: request.signal }).then(response => {
      if (!response.ok) throw new Error(`Map style request failed: ${response.status}`);
      return response.json() as Promise<StyleSpecification>;
    }).then(mountVector).catch(() => { if (!request.signal.aborted) fallback(); });
  } catch { fallback(); }
  return () => {
    if (disposed) return;
    disposed = true; clearTimeoutGuard(); request.abort();
    removeVector(); raster?.remove();
  };
}
