"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Footprints, LocateFixed, MapPin, Route, X } from "lucide-react";
import type { Viewpoint } from "../../lib/types";
import type { Preferences } from "../../lib/preferences";
import type { MapLocation } from "../../lib/map-experience";
import { matchingHikes, type HikeBudget, type HikeRoute } from "../../lib/hikes";
import ViewPhoto from "./view-photo";

const BUDGET_KEY = "sunspot.hike-budget.v1";
export default function HikesPanel({ viewpoints, preferences, location, visible, blocked, onSelect, onLocate, onClose }: {
  viewpoints: Viewpoint[]; preferences: Preferences; location: MapLocation | null; visible: boolean; blocked: boolean;
  onSelect: (viewpoint: Viewpoint) => void; onLocate: () => void; onClose: () => void;
}) {
  const [budget, setBudget] = useState<HikeBudget>({ unit: "miles", amount: 5 }), [routes, setRoutes] = useState<HikeRoute[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(BUDGET_KEY) ?? "null"); if (saved && ["miles", "steps"].includes(saved.unit) && Number.isFinite(saved.amount) && saved.amount > 0) setBudget(saved); } catch { /* Defaults work without storage. */ } }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    fetch("/api/hikes", { signal: controller.signal }).then(r => { if (!r.ok) throw new Error("Hike routes couldn’t load."); return r.json() as Promise<{ routes: HikeRoute[] }>; })
      .then(data => { if (!controller.signal.aborted) setRoutes(data.routes); }).catch(() => { if (!controller.signal.aborted) setError("Hike routes couldn’t load. Try again."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  const update = (next: HikeBudget) => { setBudget(next); if (next.amount > 0) try { localStorage.setItem(BUDGET_KEY, JSON.stringify(next)); } catch { /* Session preferences still work. */ } };
  const matches = useMemo(() => matchingHikes(routes, viewpoints, budget, preferences, location), [routes, viewpoints, budget, preferences, location]);
  return <aside className="hikes-panel" data-motion={visible ? "enter" : "exit"} aria-label="Find a nearby hike" aria-hidden={!visible || blocked} inert={!visible || blocked}>
    <header className="hikes-heading"><span className="eyebrow orange"><Footprints size={14} />A LITTLE TIME OUTSIDE</span><button className="icon-button" onClick={onClose} aria-label="Close hikes and show map"><X size={18} /></button><h2>Find your kind of hike.</h2><p>A walking budget. A nearby view.</p></header>
    <div className="hike-budget"><label htmlFor="hike-budget">Your walking budget</label><div className="hike-unit" role="group" aria-label="Walking budget unit">{(["miles", "steps"] as const).map(unit => <button key={unit} aria-pressed={budget.unit === unit} onClick={() => update({ unit, amount: unit === budget.unit ? budget.amount : unit === "steps" ? Math.round(budget.amount * 2200) : Math.round(budget.amount / 2200 * 10) / 10 })}>{unit === "miles" ? "Miles" : "Steps"}</button>)}</div><div className="hike-budget-value"><span>Up to</span><input id="hike-budget" type="number" min={budget.unit === "miles" ? .1 : 100} max={budget.unit === "miles" ? 100 : 260000} step={budget.unit === "miles" ? .5 : 500} value={budget.amount || ""} onChange={e => update({ ...budget, amount: Number(e.target.value) })} /><span>{budget.unit}</span></div><p>Loop and round-trip routes with sourced distances. Steps are estimates at 1,900–2,600 per mile; step budgets use the upper estimate.</p></div>
    <button className="hike-location" onClick={onLocate}><LocateFixed size={15} /><span>{location ? location.label ? `Near ${location.label}` : "Near your location" : "Choose your area for nearest hikes"}</span><ArrowUpRight size={14} /></button>
    <div className="hike-results-heading"><b>{loading ? "Finding routes…" : `${matches.length} ${matches.length === 1 ? "hike" : "hikes"} within your budget`}</b><span>{location ? "Nearest first" : "Choose area to sort by distance"}</span></div>
    <div className="hike-results">{error ? <div className="hike-empty"><p role="alert">{error}</p><button onClick={() => setRetry(v => v + 1)}>Try again</button></div> : !loading && !matches.length ? <div className="hike-empty"><Route size={25} /><h3>A little more room to roam?</h3><p>Try a larger walking budget or broader scenery and distance filters. Routes without a confirmed loop or round-trip distance aren’t included.</p></div> : matches.map(match => <button key={`${match.viewpointId}:${match.route.id}`} className="hike-card" onClick={() => onSelect(match.viewpoint)}><ViewPhoto photo={match.viewpoint.photos[0]} name={match.viewpoint.name} /><div><span className="spot-scenery">{match.route.distanceType === "loop" ? "Loop" : "Round trip"} · {match.miles} mi</span><h3>{match.route.name}</h3><p>{match.viewpoint.name}</p><span className="hike-match-reason">Within your {budget.amount.toLocaleString()} {budget.unit} walking budget</span><div className="hike-card-facts"><span><Footprints size={12} />~{match.steps[0].toLocaleString()}–{match.steps[1].toLocaleString()}</span>{match.away !== null && <span><MapPin size={12} />{match.away.toFixed(1)} mi away · straight-line</span>}</div><small>{match.route.elevationGainFeet.value !== null ? `${match.route.elevationGainFeet.value.toLocaleString()} ft climbing` : "Climbing gain not confirmed"} · {match.route.startCoordinates ? "distance to trail start" : "distance to viewpoint"}</small></div><ArrowUpRight size={16} /></button>)}</div>
  </aside>;
}
