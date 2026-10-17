"use client";
import { useMemo, useRef, type ReactNode } from "react";
import { useContentTransition } from "./use-motion";
import { Sun } from "lucide-react";
import type { Viewpoint } from "../../lib/types";
import type { Forecast, TerrainData } from "../../lib/forecast-types";
import { compass, formatDate, formatTime, solarDay } from "../../lib/solar";
import { compassWords, sunDirectionCopy } from "../../lib/sun-copy";
import { terrainEvening } from "../../lib/terrain";
import { sunlightState, sunsetOutlook } from "../../lib/sunset-outlook";
import { weatherAt, WEATHER_STALE_MS } from "../../lib/weather";

export default function SunsetSummary({ place, selected, now, forecast, terrain, controls }: {
  place: Viewpoint; selected: number; now: number; forecast: Forecast | null; terrain: TerrainData | null; controls?: ReactNode;
}) {
  const surface = useRef<HTMLElement>(null);
  useContentTransition(surface, place.id + ":" + selected + ":" + (forecast?.fetchedAt ?? "") + ":" + !!terrain);
  const day = useMemo(() => solarDay(place, selected), [place, selected]);
  const profile = terrain?.profiles[place.id] ?? null;
  const evening = useMemo(() => terrainEvening(place, selected, profile), [place.lat, place.lng, day.date, profile]);
  const outlook = sunsetOutlook(place, selected, forecast, now), current = sunlightState(place, selected, forecast, profile, now), weather = weatherAt(forecast, place, selected, now);
  const valid = forecast && now - forecast.fetchedAt <= WEATHER_STALE_MS;
  const below = current.terrain.state === "night" || current.terrain.state === "twilight";
  const terrainNote = !profile || !evening.complete ? "Terrain estimate unavailable or incomplete for this spot."
    : evening.obscuredSinceNoon ? "The terrain model estimates that the sun is already hidden at solar noon."
    : evening.disappearance !== null ? "Terrain may hide the sun before sunset, around " + formatTime(evening.disappearance) + "."
    : "The terrain model does not estimate an earlier disappearance.";
  return <section ref={surface} className="sunset-summary light-summary" aria-label="Sunset and selected-time conditions">
    <div className="light-summary-heading"><Sun size={20} /><div><h3>Plan for the light</h3><p>{formatDate(selected)} · {formatTime(selected)} · Pacific Time</p></div></div>
    <p className="light-current-state">{current.label}</p>
    <dl className="light-key-facts">
      <div><dt>{below ? "Sun position" : "Where to look"}</dt><dd>{sunDirectionCopy(current.terrain.bearing, current.terrain.state)}</dd></div>
      <div><dt>Astronomical sunset</dt><dd>{formatTime(day.sunset)}</dd></div>
      <div><dt>Evening golden hour</dt><dd>{day.goldenStart === null || day.goldenEnd === null ? "Unavailable" : formatTime(day.goldenStart) + " – " + formatTime(day.goldenEnd)}</dd></div>
    </dl>
    <p className="light-terrain-note">{terrainNote}{evening.crossings.length > 1 ? " It may disappear and reappear through terrain gaps." : ""}</p>
    <div className="sunset-outlook" data-outlook={outlook.label}><strong>{outlook.label === "Weather unavailable" ? "Sunset weather unavailable" : outlook.label + " near sunset"}</strong><p>{outlook.explanation}</p><small>Regional weather and terrain are estimates. A visible sun is not guaranteed.</small></div>
    <p className="forecast-freshness">{valid ? (forecast.stale || now - forecast.fetchedAt > 3_600_000 ? "Cached forecast · " : "Hourly forecast · ") + "retrieved " + Math.max(0, Math.floor((now - forecast.fetchedAt) / 60_000)) + " min ago" : "Weather unavailable · sun times are still calculated"}</p>
    {controls && <details className="light-time-settings"><summary>Change date & time</summary><div className="light-disclosure-content">{controls}</div></details>}
    <details className="light-details"><summary>Forecast details & how estimates work</summary><div className="light-disclosure-content">
      <div className="selected-conditions"><h4>At your selected time · {formatTime(selected)}</h4><div><span>Sun bearing {compass(current.terrain.bearing)} · {Math.round(current.terrain.bearing)}° true</span><span>Sun elevation {current.terrain.elevation.toFixed(1)}°</span></div>{weather && <dl><div><dt>Clouds / low / mid / high</dt><dd>{[weather.cloud, weather.low, weather.mid, weather.high].map(v => v === null ? "—" : Math.round(v) + "%").join(" / ")}</dd></div><div><dt>Visibility</dt><dd>{weather.visibility === null ? "Unavailable" : (weather.visibility / 1000).toFixed(1) + " km"}</dd></div><div><dt>Preceding-hour precipitation</dt><dd>{weather.precipitation === null ? "Unavailable" : weather.precipitation + " mm"}</dd></div><div><dt>Instant direct radiation</dt><dd>{weather.direct === null ? "Unavailable" : Math.round(weather.direct) + " W/m²"}</dd></div><div><dt>Nearest model hour</dt><dd>{formatTime(weather.time)} PT</dd></div></dl>}</div>
      <div className="sunset-facts"><p><span>Face for sunset</span><b>{day.sunsetBearing === null ? "Unavailable" : compassWords(day.sunsetBearing) + " · " + Math.round(day.sunsetBearing) + "° true"}</b></p><p><span>Civil twilight</span><b>{formatTime(day.sunset)} – {formatTime(day.dusk)}</b></p><p><span>Estimated terrain disappearance</span><b>{!profile || !evening.complete ? "Unavailable" : evening.obscuredSinceNoon ? "Already obscured at solar noon" : evening.disappearance !== null ? "~" + formatTime(evening.disappearance) : "No earlier crossing estimated"}</b></p></div>
      <p className="forecast-note">The orange arrow points from the viewpoint toward the sun. The purple dashed line marks sunset direction. Bearings use true north, not your phone’s orientation.</p>
      <p className="forecast-note">Regional estimate {outlook.horizonSampled ? "at this spot and 30 km toward sunset" : "at this spot; horizon weather unavailable"}. This does not predict sunset color. Hourly weather is matched to the nearest model hour; changing the time does not add forecast accuracy.</p>
      <p className="forecast-note">{valid ? forecast.source : "Weather unavailable; solar times are calculated independently."}</p>
      <p className="forecast-note">{profile && terrain ? "USGS 3DEP · ~" + terrain.resolutionMeters + " m sampling · " + profile.coverage + " horizon · ground " + Math.round(profile.elevation) + " m · observer +" + terrain.observerHeightMeters + " m. Generated " + terrain.generatedAt.slice(0, 10) + "." : "Terrain estimate unavailable for this viewpoint."} Terrain excludes trees, buildings and railings. Coarse terrain can miss narrow ridges; your standing position and atmospheric conditions can shift disappearance by many minutes.</p>
      <p className="forecast-attribution"><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo / NOAA · CC BY 4.0</a> · <a href="https://www.usgs.gov/3d-elevation-program" target="_blank" rel="noreferrer">USGS 3DEP</a></p>
    </div></details>
  </section>;
}
