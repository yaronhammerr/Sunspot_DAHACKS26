import type * as Leaflet from "leaflet";

// Leaflet's stop() can cancel flyTo without zoomend. The bridge consequently
// retains its zooming flag and stops repositioning its canvas on later pans.
// Its own end-of-zoom routine restores both the canvas transform and camera.
type BridgeLayer = Leaflet.MaplibreGL & {
  _resizeContainer(): void;
  _zoomEnd(): void;
};

export function bindBasemapLifecycle(L: typeof Leaflet, map: Leaflet.Map, layer: Leaflet.MaplibreGL) {
  const bridge = layer as BridgeLayer, gl = layer.getMaplibreMap();
  let disposed = false, frame: number | null = null;
  const synchronize = () => {
    frame = null;
    if (disposed || !map.hasLayer(layer)) return;
    bridge._resizeContainer();
    // Explicit resize avoids waiting for a separate ResizeObserver callback
    // before the first frame after layout or an asynchronous basemap mount.
    gl.resize(undefined, false);
    bridge._zoomEnd();
    gl.triggerRepaint();
  };
  const schedule = () => { if (!disposed && frame === null) frame = L.Util.requestAnimFrame(synchronize); };
  map.on("viewreset moveend resize", schedule);
  gl.on("load", schedule);
  schedule();
  return () => {
    disposed = true;
    map.off("viewreset moveend resize", schedule);
    gl.off("load", schedule);
    if (frame !== null) L.Util.cancelAnimFrame(frame);
    frame = null;
  };
}
