import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import type * as Leaflet from "leaflet";
import { bindBasemapLifecycle } from "../lib/map-basemap-lifecycle";

type Callback = (...args: any[]) => void;
class Events {
  listeners = new Map<string, Set<Callback>>();
  on(names: string, callback: Callback) { for (const name of names.split(" ")) { const listeners = this.listeners.get(name) ?? new Set(); listeners.add(callback); this.listeners.set(name, listeners); } return this; }
  off(names: string, callback: Callback) { for (const name of names.split(" ")) this.listeners.get(name)?.delete(callback); return this; }
  fire(name: string) { for (const callback of [...this.listeners.get(name) ?? []]) callback(); }
}
class Point {
  constructor(public x: number, public y: number) {}
  multiplyBy(scale: number) { return new Point(this.x * scale, this.y * scale); }
  subtract(point: Point) { return new Point(this.x - point.x, this.y - point.y); }
}

function setup() {
  let nextFrame = 1;
  const frames = new Map<number, Callback>();
  const flush = () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); };
  const leaflet = {
    Layer: { extend(properties: Record<string, any>) {
      function Bridge(this: any, options: Record<string, unknown>) { this.options = { ...properties.options }; properties.initialize.call(this, options); }
      Object.assign(Bridge.prototype, properties);
      return Bridge;
    } },
    setOptions(layer: any, options: Record<string, unknown>) { Object.assign(layer.options, options); },
    Util: {
      throttle(callback: Callback, _interval: number, context: unknown) { return callback.bind(context); },
      requestAnimFrame(callback: Callback, context?: unknown) { const id = nextFrame++; frames.set(id, () => callback.call(context)); return id; },
      cancelAnimFrame(id: number) { frames.delete(id); },
    },
    DomUtil: {
      setPosition(element: any, position: Point) { element.position = { x: position.x, y: position.y }; },
      setTransform(element: any, position: Point | null, scale: number) { element.transform = { x: position?.x ?? 0, y: position?.y ?? 0, scale }; },
    },
  };
  // Evaluate the installed bridge's actual implementation with a minimal DOM
  // boundary, so a library regression cannot be hidden by a copied mock flag.
  const require = createRequire(import.meta.url), exports = {};
  const source = readFileSync(require.resolve("@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js"), "utf8");
  runInNewContext(source, { module: { exports }, exports, require: (id: string) => id === "leaflet" ? leaflet : {} });
  const Bridge = (exports as any).MaplibreGL;
  const bridge = new Bridge({ padding: .1 });
  const container = { style: {} as Record<string, string>, position: { x: 0, y: 0 } };
  const canvas = { transform: { x: 0, y: 0, scale: 1 }, width: 0, height: 0 };
  const map = Object.assign(new Events(), {
    width: 640, height: 400, origin: new Point(0, 0), center: { lat: 37.77, lng: -122.43 }, zoom: 12,
    hasLayer: () => true,
    getSize() { return new Point(this.width, this.height); },
    containerPointToLayerPoint() { return this.origin; },
    getCenter() { return this.center; },
    getZoom() { return this.zoom; },
    getZoomScale() { return 1; },
  });
  const gl = Object.assign(new Events(), {
    _actualCanvas: canvas, camera: null as null | { center: [number, number]; zoom: number }, resizeCalls: 0, paints: 0,
    resize() { this.resizeCalls++; canvas.width = Number.parseFloat(container.style.width); canvas.height = Number.parseFloat(container.style.height); },
    jumpTo(camera: { center: [number, number]; zoom: number }) { this.camera = { center: [...camera.center], zoom: camera.zoom }; },
    triggerRepaint() { this.paints++; },
  });
  Object.assign(bridge, { _map: map, _container: container, _glMap: gl });
  for (const name of ["move", "zoomstart", "zoomend"]) map.on(name, bridge.getEvents()[name].bind(bridge));
  bridge._resizeContainer(); bridge._update();
  const bind = () => bindBasemapLifecycle(leaflet as unknown as typeof Leaflet, map as unknown as Leaflet.Map, bridge);
  return { map, bridge, container, canvas, gl, bind, flush, frames };
}

test("an interrupted initial flight cannot leave the vector canvas frozen during later pans", () => {
  const { map, bridge, container, canvas, gl, bind, flush } = setup();
  const remove = bind(); flush();
  map.fire("zoomstart");
  map.origin = new Point(420, 130); map.center = { lat: 37.9, lng: -122.1 };
  canvas.transform = { x: -200, y: -60, scale: 1.4 };
  map.fire("move");
  assert.equal(bridge._zooming, true);
  assert.deepEqual(container.position, { x: -64, y: -40 }, "installed bridge reproduces the stale-canvas position before the fix");
  // Leaflet stop() with zoomSnap=0 emits viewreset but no zoomend.
  map.fire("viewreset"); flush();
  assert.equal(bridge._zooming, false);
  assert.deepEqual(container.position, { x: 356, y: 90 });
  assert.deepEqual(canvas.transform, { x: 0, y: 0, scale: 1 });
  assert.deepEqual(gl.camera, { center: [-122.1, 37.9], zoom: 11 });
  map.origin = new Point(500, 170); map.fire("move");
  assert.deepEqual(container.position, { x: 436, y: 130 }, "ordinary panning works again without another zoom gesture");
  remove();
});

test("async load and element resize synchronize full canvas dimensions and the latest camera", () => {
  const { map, container, canvas, gl, bind, flush, frames } = setup();
  const remove = bind();
  map.width = 1280; map.height = 800; map.zoom = 10; map.center = { lat: 38, lng: -123 };
  map.fire("resize"); map.fire("viewreset"); gl.fire("load");
  assert.equal(frames.size, 1, "startup and layout notifications share one animation frame");
  flush();
  assert.equal(container.style.width, "1536px"); assert.equal(container.style.height, "960px");
  assert.equal(canvas.width, 1536); assert.equal(canvas.height, 960);
  assert.deepEqual(container.position, { x: -128, y: -80 });
  assert.deepEqual(gl.camera, { center: [-123, 38], zoom: 9 });
  assert.equal(gl.resizeCalls, 1); assert.equal(gl.paints, 1);
  remove();
});

test("teardown cancels pending viewport work and removes late load and map callbacks", () => {
  const { map, gl, bind, flush, frames } = setup();
  const remove = bind();
  assert.equal(frames.size, 1);
  remove(); remove();
  assert.equal(frames.size, 0);
  map.fire("viewreset"); map.fire("moveend"); map.fire("resize"); gl.fire("load"); flush();
  assert.equal(gl.resizeCalls, 0); assert.equal(gl.paints, 0);
});
