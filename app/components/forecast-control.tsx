"use client";
import { useRef, useState } from "react";
import { ChevronDown, Cloud, Sun } from "lucide-react";
import type { Forecast } from "../../lib/forecast-types";
import { formatDate, formatTime, fromPacific, HOUR, nextPacificDate, pacificDate, solarDay, type Point } from "../../lib/solar";
import { forecastRangeEnd, WEATHER_STALE_MS } from "../../lib/weather";
import DateTimeFields from "./date-time-fields";
import { usePresence } from "./use-motion";
import InlineTip from "./inline-tip";
export type WeatherLayers = { cloud: boolean; opacity: number };
export type ForecastControlProps = { revision: number; now: number; selected: number; live: boolean; onSelect: (time: number) => void; onNow: () => void; reference: Point; referenceName: string; forecast: Forecast | null; loading: boolean; error?: string; layers: WeatherLayers; onLayers: (value: WeatherLayers) => void };
export default function ForecastControl(p: ForecastControlProps) {
  const [open, setOpen] = useState(false), [inputError, setInputError] = useState("");
  const presence = usePresence(open, 240), toggle = useRef<HTMLButtonElement>(null);
  const start = Math.ceil(p.now / 900_000) * 900_000;
  const fresh = p.forecast && p.now - p.forecast.fetchedAt <= WEATHER_STALE_MS ? p.forecast : null;
  const forecastEnd = fresh ? Math.min(...fresh.cells.map(c => c.hours.at(-1)?.time ?? 0)) : null;
  const end = forecastRangeEnd(fresh, p.now);
  const today = solarDay(p.reference, p.now).sunset;
  const tomorrow = solarDay(p.reference, fromPacific(`${nextPacificDate(pacificDate(p.now))}T12:00`)!).sunset;
  const choose = (time: number) => { if (time < p.now || time > end) { setInputError("Choose a time from now through the next 48 hours."); return; } setInputError(""); p.onSelect(time); };
  const shortcut = (time: number | null) => time !== null && time >= p.now && time <= end;
  const maxStep = Math.max(0, Math.floor((end - start) / 900_000));
  return <section className={`forecast-control ${presence.present ? "is-open" : ""}`} aria-label="Sun and weather planner">
    <button ref={toggle} className="forecast-toggle" aria-expanded={open} aria-controls="forecast-controls" onClick={() => setOpen(!open)}><Sun size={18} /><span>{p.live ? "Now" : formatTime(p.selected)} <small>· Pacific Time</small></span><ChevronDown size={16} /></button>
    {presence.present && <div className="forecast-reveal" data-motion={presence.state}><div className="forecast-reveal-inner"><div id="forecast-controls" className="forecast-controls" data-motion={presence.state} inert={!open} aria-hidden={!open} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); toggle.current?.focus({ preventScroll: true }); } }}>
      <div className="forecast-title"><h2>Plan for the light</h2><button className={p.live ? "is-active" : ""} onClick={() => { setInputError(""); p.onNow(); }}>Now</button></div>
      <InlineTip id="sun-direction">The orange arrow points toward the sun. The purple dashed line marks sunset direction. Choose a time to see them change.</InlineTip>
      <p className="forecast-date">{formatDate(p.selected)} · {formatTime(p.selected)} PT</p>
      <DateTimeFields revision={p.revision} selected={p.selected} now={p.now} end={end} onSelect={choose} />
      <label className="forecast-slider"><span>Next 48 hours <small>15-minute steps</small></span><input aria-label="Selected time, next 48 hours in 15-minute steps" type="range" min="0" max={maxStep} step="1" value={Math.max(0, Math.min(maxStep, Math.round((p.selected - start) / 900_000)))} aria-valuetext={`${formatDate(p.selected)}, ${formatTime(p.selected)} Pacific Time`} onChange={e => choose(start + Number(e.target.value) * 900_000)} /></label>
      <div className="sunset-shortcuts"><button disabled={!shortcut(today)} onClick={() => today !== null && choose(today)}>Today’s sunset</button><button disabled={!shortcut(tomorrow)} onClick={() => tomorrow !== null && choose(tomorrow)}>Tomorrow’s sunset</button></div>
      <p className="forecast-note">Sunset reference: {p.referenceName}. {today !== null && today < p.now ? "Today’s sunset has passed." : ""}</p>
      {inputError && <p className="forecast-warning" role="alert">{inputError}</p>}
      <fieldset className="forecast-layers"><legend>Regional map layers</legend><label><input type="checkbox" checked={p.layers.cloud} onChange={e => p.onLayers({ ...p.layers, cloud: e.target.checked })} /><Cloud size={14} />Cloud cover</label><label className="forecast-opacity">Opacity<input aria-label="Weather layer opacity" type="range" min="10" max="70" step="5" value={p.layers.opacity} onChange={e => p.onLayers({ ...p.layers, opacity: +e.target.value })} /></label></fieldset>
      <div className="forecast-legend"><span><i className="cloud-swatch" />More clouds = more regional cover</span><span><i className="terrain-swatch" />Dashed pins: estimated terrain obstruction</span></div>
      <p className="forecast-note">Cloud shapes illustrate regional cover, not exact cloud locations. Terrain screening applies to viewpoint pins.</p>
      <p className="forecast-freshness" role="status">{p.loading ? "Loading regional forecast…" : fresh ? `${fresh.stale || p.now - fresh.fetchedAt > HOUR ? "Cached · " : ""}Retrieved ${Math.max(0, Math.floor((p.now - fresh.fetchedAt) / 60_000))} min ago · hourly model estimates` : "Weather unavailable · astronomy still available"}</p>
      {forecastEnd !== null && p.selected > forecastEnd && <p className="forecast-warning">Selected time is beyond the returned weather forecast. Only astronomy and terrain are shown.</p>}
      {forecastEnd !== null && forecastEnd < p.now + 48 * HOUR && <p className="forecast-note">Available forecast ends {formatDate(forecastEnd)}, {formatTime(forecastEnd)} PT. Later times are disabled.</p>}
      {p.error && <p className="forecast-warning">{p.error}</p>}
      <p className="forecast-note">Now is a model estimate. Hourly weather is matched to the nearest forecast hour; the slider does not add forecast accuracy.</p>
      <a className="forecast-attribution" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather: Open-Meteo / NOAA · CC BY 4.0</a>
    </div></div></div>}
  </section>;
}
