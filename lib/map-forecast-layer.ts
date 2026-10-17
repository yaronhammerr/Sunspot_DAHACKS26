import type * as Leaflet from "leaflet";
import type { Forecast, TerrainData } from "./forecast-types";
import type { Viewpoint } from "./types";
import { compass, solarDay, sunPosition } from "./solar";
import { WEATHER_STALE_MS, weatherAt } from "./weather";
import { terrainState } from "./terrain";
import { prefersReducedMotion } from "./motion";
import { mapSunLayout } from "./sun-preview";
import { sunArrowHead } from "./sun-copy";
import { cloudField, cloudRasterSize, renderCloudTexture, type CloudField } from "./cloud-texture";

export type MapForecastState = { forecast: Forecast | null; terrain: TerrainData | null; time: number; now: number; selected: Viewpoint | null; layers: { cloud: boolean; opacity: number } };
export function addForecastLayer(L: typeof Leaflet, map: Leaflet.Map) {
  const canvas = L.DomUtil.create("canvas", "weather-map-canvas leaflet-zoom-hide") as HTMLCanvasElement;
  canvas.style.pointerEvents = "none"; canvas.setAttribute("aria-hidden", "true");
  const pane = map.createPane("forecastPane"); pane.style.zIndex = "350"; pane.style.pointerEvents = "none";
  pane.appendChild(canvas);
  const badge = L.DomUtil.create("div", "sun-direction-anchor", pane);
  badge.hidden = true; badge.setAttribute("role", "note");
  const pill = L.DomUtil.create("div", "sun-direction-pill", badge);
  const content = L.DomUtil.create("div", "sun-direction-content", pill);
  const symbol = L.DomUtil.create("span", "sun-direction-symbol", content); symbol.setAttribute("aria-hidden", "true");
  symbol.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
  const tag = L.DomUtil.create("span", "sun-direction-tag", content);
  const bearing = L.DomUtil.create("strong", "sun-direction-bearing", content);
  L.DomUtil.create("i", "sun-direction-divider", content).setAttribute("aria-hidden", "true");
  const altitude = L.DomUtil.create("span", "sun-direction-altitude", content);
  let badgeKey = "", textKey = "", badgeAnimation: Animation | undefined;
  const updateBadge = (state: MapForecastState, size: Leaflet.Point) => {
    const v = state.selected;
    if (!v) { badge.hidden = true; badgeKey = ""; return; }
    const origin = map.latLngToContainerPoint([v.lat, v.lng]);
    if (origin.x < -100 || origin.x > size.x + 100 || origin.y < -100 || origin.y > size.y + 100) { badge.hidden = true; badgeKey = ""; return; }
    const sun = sunPosition(v, state.time), terrain = terrainState(v, state.time, state.terrain?.profiles[v.id]);
    const status = terrain.state === "blocked" ? "Terrain blocked" : terrain.state === "twilight" ? "Below horizon, twilight" : terrain.state === "night" ? "Below horizon, night" : "Sun direction";
    const textVersion = `${v.id}:${state.time}:${terrain.state}`;
    if (textKey !== textVersion) {
    tag.textContent = terrain.state === "blocked" ? "BLOCKED" : terrain.state === "twilight" ? "TWILIGHT" : terrain.state === "night" ? "NIGHT" : "LOOK";
    bearing.textContent = `${compass(sun.bearing)} · ${Math.round(sun.bearing)}°`;
    altitude.textContent = `${sun.elevation.toFixed(1)}° alt`;
    badge.dataset.sunState = terrain.state;
    const description = `${v.name}: ${status}. ${compass(sun.bearing)}, ${Math.round(sun.bearing)} degrees from true north. Sun elevation ${sun.elevation.toFixed(1)} degrees. The arrow points from the viewpoint toward the sun.`;
    badge.setAttribute("aria-label", description); badge.title = description;
    textKey = textVersion;
    }
    badge.hidden = false;
    const anchor = mapSunLayout(origin, sun.bearing, size.x, size.y, pill.offsetWidth || 205, pill.offsetHeight || 32).badge;
    L.DomUtil.setPosition(badge, map.containerPointToLayerPoint([anchor.x, anchor.y]));
    badge.hidden = false;
    const key = `${v.id}:${Math.floor(state.time / 60_000)}:${terrain.state}`;
    if (key !== badgeKey) {
      badgeAnimation?.cancel();
      if (!prefersReducedMotion()) badgeAnimation = content.animate([{ opacity: .15, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" });
      badgeKey = key;
    }
  };
  let state: MapForecastState | null = null, previous: MapForecastState | null = null, frame = 0, changedAt = 0;
  const cloudFields: { forecast: Forecast; time: number; field: CloudField }[] = [];
  const cloudImages: { field: CloudField; camera: string; image: HTMLCanvasElement }[] = [];
  const paintWeather = (ctx: CanvasRenderingContext2D, state: MapForecastState, size: Leaflet.Point) => {
    const { forecast, time, now } = state;
    const opacity = Math.max(0, Math.min(1, state.layers.opacity / 100));
    if (!forecast || !state.layers.cloud || !opacity || size.x <= 0 || size.y <= 0) return;
    if (now - forecast.fetchedAt > WEATHER_STALE_MS) return;
    let field = cloudFields.find(f => f.forecast === forecast && f.time === time)?.field;
    if (!field) {
      field = cloudField(forecast.cells.map(cell => {
        const p = map.project([cell.lat, cell.lng], 0);
        return { x: p.x, y: p.y, cover: weatherAt(forecast, cell, time, now)?.cloud ?? null };
      }));
      cloudFields.unshift({ forecast, time, field });
      cloudFields.length = Math.min(cloudFields.length, 2);
    }
    const topLeft = map.project(map.containerPointToLatLng([0, 0]), 0);
    const camera = `${topLeft.x.toFixed(6)}:${topLeft.y.toFixed(6)}:${map.getZoom()}:${size.x}:${size.y}`;
    let image = cloudImages.find(c => c.field === field && c.camera === camera)?.image;
    if (!image) {
      const raster = cloudRasterSize(size.x, size.y);
      image = document.createElement("canvas"); image.width = raster.width; image.height = raster.height;
      const offscreen = image.getContext("2d");
      if (!offscreen) return;
      const data = offscreen.createImageData(raster.width, raster.height);
      data.data.set(renderCloudTexture({ ...raster, field, left: topLeft.x, top: topLeft.y, worldPerPixel: size.x / raster.width / map.getZoomScale(map.getZoom(), 0) }));
      offscreen.putImageData(data, 0, 0);
      cloudImages.unshift({ field, camera, image }); cloudImages.length = Math.min(cloudImages.length, 2);
    }
    ctx.save(); ctx.globalAlpha *= opacity; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, 0, 0, size.x, size.y); ctx.restore();
  };
  const paintSun = (ctx: CanvasRenderingContext2D, state: MapForecastState, size: Leaflet.Point) => {
    const v = state.selected;
    if (!v) return;
    const p = sunPosition(v, state.time), terrain = terrainState(v, state.time, state.terrain?.profiles[v.id]), origin = map.latLngToContainerPoint([v.lat, v.lng]);
    if (origin.x < -100 || origin.x > size.x + 100 || origin.y < -100 || origin.y > size.y + 100) return;
    const length = Math.min(130, size.x * .24), end = mapSunLayout(origin, p.bearing, size.x, size.y).end;
    const sunsetBearing = solarDay(v, state.time).sunsetBearing;
    if (sunsetBearing !== null && Math.abs(sunsetBearing - p.bearing) > 5) {
      const sr = sunsetBearing * Math.PI / 180, sx = origin.x + Math.sin(sr) * length, sy = origin.y - Math.cos(sr) * length;
      ctx.strokeStyle = "#8b6097"; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = "500 10px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#fffaf3dd"; ctx.strokeText("Sunset", sx, sy + 16); ctx.fillStyle = "#765080"; ctx.fillText("Sunset", sx, sy + 16);
    }
    ctx.strokeStyle = terrain.state === "blocked" ? "#775744" : "#cb6b21"; ctx.lineWidth = 3; ctx.setLineDash(terrain.state === "above" || terrain.state === "unknown" ? [] : [5, 5]);
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(end.x, end.y); ctx.stroke(); ctx.setLineDash([]);
    const arrow = sunArrowHead(origin, end);
    ctx.beginPath(); ctx.moveTo(arrow.left.x, arrow.left.y); ctx.lineTo(arrow.tip.x, arrow.tip.y); ctx.lineTo(arrow.right.x, arrow.right.y); ctx.stroke();
    const daylight = terrain.state === "above" || terrain.state === "unknown";
    ctx.save();
    ctx.strokeStyle = "#fffaf2dd"; ctx.lineWidth = 5; ctx.lineCap = "round";
    const rays = () => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        ctx.moveTo(end.x + Math.cos(angle) * 11, end.y + Math.sin(angle) * 11);
        ctx.lineTo(end.x + Math.cos(angle) * 15, end.y + Math.sin(angle) * 15);
      }
      ctx.stroke();
    };
    rays();
    ctx.strokeStyle = daylight ? "#bd762f" : "#93829a"; ctx.lineWidth = 1.8;
    rays();
    ctx.fillStyle = daylight ? "#f5ca82" : "#d2c6d7";
    ctx.beginPath(); ctx.arc(end.x, end.y, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.font = "600 10px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#fffaf3cc"; ctx.strokeText("↑ N", origin.x - 25, origin.y - 24); ctx.fillStyle = "#513c28"; ctx.fillText("↑ N", origin.x - 25, origin.y - 24);
  };
  const draw = () => {
    frame = 0; if (!state) return;
    const size = map.getSize(), ratio = Math.min(window.devicePixelRatio || 1, 2), ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = size.x * ratio; canvas.height = size.y * ratio; canvas.style.width = `${size.x}px`; canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0])); ctx.scale(ratio, ratio);
    const elapsed = previous && !prefersReducedMotion() ? Math.min(1, (performance.now() - changedAt) / 300) : 1;
    const blend = 1 - Math.pow(1 - elapsed, 3);
    // Blend complete weather models; the current sun fades in at its true
    // bearing. No outgoing sun remains behind the newly positioned preview.
    if (previous && blend < 1) {
      ctx.globalAlpha = 1 - blend; paintWeather(ctx, previous, size);
    }
    ctx.globalAlpha = blend; paintWeather(ctx, state, size); paintSun(ctx, state, size);
    ctx.globalAlpha = 1; updateBadge(state, size);
    if (elapsed < 1) frame = requestAnimationFrame(draw); else previous = null;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  map.on("move zoom resize", schedule);
  return {
    update(next: MapForecastState) {
      const changed = state && (state.selected?.id !== next.selected?.id || state.time !== next.time || state.forecast !== next.forecast || state.layers.cloud !== next.layers.cloud || state.layers.opacity !== next.layers.opacity);
      if (changed && !prefersReducedMotion()) { previous = state; changedAt = performance.now(); }
      state = next; schedule();
    },
    remove() { map.off("move zoom resize", schedule); cancelAnimationFrame(frame); badgeAnimation?.cancel(); pane.remove(); },
  };
}
