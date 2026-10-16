"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Binoculars, Compass, Grid2X2, LocateFixed, Map as MapIcon, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import type { Catalog, Viewpoint } from "../lib/types";
import { distanceMiles } from "../lib/discovery";
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, personalizedViews, readPreferences, type Preferences } from "../lib/preferences";
import ViewpointMap from "./components/viewpoint-map";
import ViewpointDetail from "./components/viewpoint-detail";
import ViewPhoto from "./components/view-photo";
import Onboarding from "./components/onboarding";
import InstallApp from "./components/install-app";
import LocationPicker from "./components/location-picker";
import { findDeviceLocation, LocationError, type SearchLocation } from "../lib/location";

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [county, setCounty] = useState("");
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [setup, setSetup] = useState<"loading" | "first" | "edit" | "done">("loading");
  const [storageStatus, setStorageStatus] = useState("");
  const [view, setView] = useState<"grid" | "map">("grid");
  const [selected, setSelected] = useState<Viewpoint | null>(null);
  const [location, setLocation] = useState<SearchLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const locatingRef = useRef(false);
  const locationRequest = useRef(0);
  const [locationFailed, setLocationFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const resultsTitle = useRef<HTMLHeadingElement>(null);
  const nearMe = useCallback(async (): Promise<boolean> => {
    if (locatingRef.current) return false;
    const request = ++locationRequest.current;
    locatingRef.current = true; setLocating(true); setLocationFailed(false); setLocationStatus("Finding your location…");
    try {
      const found = await findDeviceLocation(navigator.geolocation, window.isSecureContext, () => {
        if (request === locationRequest.current) setLocationStatus("Trying a fresh, more accurate location. This can take up to 20 seconds…");
      });
      if (request !== locationRequest.current) return false;
      setLocation(found); setLocationStatus("Device location enabled. Distances are measured in a straight line.");
      return true;
    } catch (error) {
      if (request === locationRequest.current) {
        setLocationFailed(true);
        setLocationStatus(error instanceof LocationError ? error.message : "Location is unavailable. Choose a city below to keep exploring nearby.");
      }
      return false;
    } finally {
      if (request === locationRequest.current) { locatingRef.current = false; setLocating(false); }
    }
  }, []);
  const chooseLocation = (chosen: SearchLocation) => {
    // Ignore late device callbacks after the user chooses an area.
    ++locationRequest.current; locatingRef.current = false; setLocating(false); setLocationFailed(false);
    setLocation(chosen); setLocationStatus(`Exploring near ${chosen.label}. Distances are approximate, measured from the city center.`);
  };
  useEffect(() => {
    let saved: Preferences | null = null;
    try { saved = readPreferences(localStorage.getItem(PREFERENCES_KEY)); }
    catch { setStorageStatus("Preferences will last for this session. Device storage is unavailable."); }
    if (saved) { setPreferences(saved); setSetup("done");
      // Refresh a location only when permission was already granted. Never re-prompt on launch.
      navigator.permissions?.query({ name: "geolocation" }).then(p => { if (p.state === "granted" && locationRequest.current === 0) void nearMe(); }).catch(() => {});
    } else setSetup("first");
  }, [nearMe]);
  useEffect(() => {
    const controller = new AbortController(); setError("");
    fetch("/api/viewpoints", { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error("We couldn’t load the viewpoints. Please try again."); return r.json() as Promise<Catalog>; }).then(setCatalog).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [retry]);
  const savePreferences = (p: Preferences) => {
    setPreferences(p); setSetup("done");
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(p)); setStorageStatus(""); }
    catch { setStorageStatus("Your choices are active for this session, but couldn’t be saved on this device."); }
    setTimeout(() => resultsTitle.current?.focus(), 0);
  };
  const all = useMemo(() => catalog?.viewpoints ?? [], [catalog]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return personalizedViews(all.filter(v => (!q || `${v.name} ${v.county}`.toLowerCase().includes(q)) && (!county || v.county === county)), preferences, location);
  }, [all, query, county, preferences, location]);
  const lead = filtered[0];
  const reset = () => { setQuery(""); setCounty(""); savePreferences(DEFAULT_PREFERENCES); };
  const changeView = (next: "grid" | "map") => { setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  if (setup === "loading") return <div className="app-splash" role="status"><img src="/brand/sunspot-wordmark.png" alt="Sunspot" width="190" height="64" /><p>Finding your outside…</p></div>;
  if (setup === "first" || setup === "edit") return <><InstallApp compact /><Onboarding initial={preferences} editing={setup === "edit"} locationStatus={locationStatus} locating={locating} hasLocation={!!location} locationFailed={locationFailed} onChooseLocation={chooseLocation} onLocate={nearMe} onComplete={savePreferences} onCancel={() => setSetup("done")} /></>;
  return <div className="sunspot-app discovery-app">
    <header className="app-header"><a className="brand" href="/" aria-label="Sunspot home"><img src="/brand/sunspot-wordmark.png" alt="Sunspot" width="150" height="50" /></a><button className="location-pill" onClick={() => void nearMe()} disabled={locating}><LocateFixed size={16} />{locating ? "Locating…" : location?.label ? `Near ${location.label}` : location ? "Location on" : "Enable location"}</button></header>
    <main>
      <section className="app-greeting"><div className="eyebrow orange"><span className="tiny-line" /> YOUR NEXT LITTLE ESCAPE</div><h1 ref={resultsTitle} tabIndex={-1}>{location?.label ? `A good view near ${location.label}.` : location ? "A good view, nearby." : "Find your kind of outside."}</h1><p>{preferences.tags.length ? `A little more ${preferences.tags.join(", ")}. A little more you.` : "Fresh air. A new perspective. A moment for you."}</p><button className="preferences-link" onClick={() => setSetup("edit")}><SlidersHorizontal size={15} /> Your preferences <ArrowRight size={14} /></button></section>
      <InstallApp />
      {!location && <div className="nearby-banner"><LocateFixed size={23} /><div><strong>What’s around you?</strong><p>{preferences.radius !== null ? `Enable location to find views within ${preferences.radius} miles.` : "Enable location for distances and nearby discoveries."}</p></div><button disabled={locating} onClick={() => void nearMe()}>{locating ? "Locating…" : "Find me"}<ArrowRight size={16} /></button></div>}
      {locationStatus && <p className="location-status" role="status">{locationStatus}{location && <button onClick={() => { ++locationRequest.current; locatingRef.current = false; setLocating(false); setLocation(null); setLocationFailed(false); setLocationStatus("Location cleared for this session."); }}>Clear location</button>}</p>}
      {(!location || locationFailed) && <LocationPicker expanded={locationFailed} onSelect={chooseLocation} />}
      {storageStatus && <p className="location-status" role="status">{storageStatus}</p>}
      {lead && !query && !county && view === "grid" && <button className="daily-pick" onClick={() => setSelected(lead)}><ViewPhoto photo={lead.photos[0]} name={lead.name} className="daily-pick-photo" eager /><div className="daily-pick-shade" /><div className="daily-pick-content"><span className="pick-label"><Compass size={13} /> YOUR FIRST STOP</span><h2>{lead.name}</h2><span><MapPin size={13} />{lead.county.replace(/ County$/, "")}{location && ` · ${distanceMiles(location, lead).toFixed(1)} mi away`}</span></div><span className="pick-open"><ArrowUpRight size={22} /></span></button>}
      <section id="explore" className="explore-section app-results" aria-labelledby="explore-title"><div className="section-intro"><div><h2 id="explore-title">{view === "map" ? "Your views, mapped." : "Picked for your perspective."}</h2><p>{location && preferences.radius !== null ? `Within ${preferences.radius} miles · straight-line distance` : "Discover viewpoints across the Bay Area"}</p></div><div className="view-toggle" aria-label="View display"><button onClick={() => changeView("grid")} aria-pressed={view === "grid"}><Grid2X2 size={16} />Feed</button><button onClick={() => changeView("map")} aria-pressed={view === "map"}><MapIcon size={16} />Map</button></div></div>
        <div className="filter-panel"><div className="search-row"><label className="search-field"><Search size={19} /><input type="search" placeholder="Search a viewpoint or county" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search viewpoints by name or county" /></label><div className="county-field"><select aria-label="Filter by county" value={county} onChange={e => setCounty(e.target.value)}><option value="">All counties</option>{catalog?.counties.map(c => <option key={c} value={c}>{c.replace(/ County$/, "")}</option>)}</select></div></div></div>
        <div className="active-preferences">{preferences.tags.map(t => <span key={t}>{t}</span>)}{preferences.radius !== null && <span>{preferences.radius} mi{!location ? " · location needed" : " radius"}</span>}<button onClick={() => setSetup("edit")}><SlidersHorizontal size={13} /> Adjust</button>{(query || county) && <button onClick={() => { setQuery(""); setCounty(""); }}>Clear search <X size={12} /></button>}</div>
        <div className="results-heading"><span>{catalog ? <><strong>{filtered.length}</strong> viewpoints to discover</> : "Finding your next favorite view…"}</span><span className="sort-caption">{preferences.priority === "scenery" && preferences.tags.length ? "Scenery matches first" : location ? "Closest first" : preferences.tags.length ? "Scenery matches first" : "Bay Area favorites"}</span></div>
        {error ? <div className="empty-state" role="alert"><Compass size={34} /><h3>A small detour.</h3><p>{error}</p><button className="primary-button" onClick={() => setRetry(v => v + 1)}>Try again <ArrowRight size={16} /></button></div> : !catalog ? <div className="viewpoint-grid loading-grid">{[0, 1, 2, 3].map(i => <div className="skeleton-card" key={i}><div /><span /><span /></div>)}</div> : filtered.length === 0 ? <div className="empty-state"><Binoculars size={36} /><h3>A little farther afield?</h3><p>No viewpoints match this search{location && preferences.radius !== null ? ` within ${preferences.radius} miles` : ""}. Our current collection covers the Bay Area.</p><button className="primary-button" onClick={() => setSetup("edit")}>Adjust preferences</button><button className="text-button" onClick={reset}>Explore all Bay Area views</button></div> : view === "map" ? <div className="map-layout"><div className="map-results"><div className="map-results-caption"><MapPin size={15} /> Tap a place to take a closer look</div>{filtered.map(v => <button key={v.id} className="map-result" onClick={() => setSelected(v)}><ViewPhoto photo={v.photos[0]} name={v.name} className="map-result-photo" /><span><strong>{v.name}</strong><small>{v.county.replace(/ County$/, "")}{location && ` · ${distanceMiles(location, v).toFixed(1)} mi`}</small></span><ArrowUpRight size={17} /></button>)}</div><ViewpointMap viewpoints={filtered} onSelect={setSelected} location={location} /></div> : <div className="viewpoint-grid">{filtered.map((v, index) => <article className="viewpoint-card" key={v.id}><button className="card-open" onClick={() => setSelected(v)} aria-label={`Explore ${v.name}`}><div className="card-image-wrap"><ViewPhoto photo={v.photos[0]} name={v.name} className="card-photo" eager={index < 2} /><span className="card-county"><MapPin size={11} />{location ? `${distanceMiles(location, v).toFixed(1)} mi away` : v.county.replace(/ County$/, "")}</span><span className="card-arrow"><ArrowUpRight size={19} /></span></div><div className="card-content"><div className="card-kicker">{v.tags.slice(0, 2).join(" · ") || "A new perspective"}</div><h3>{v.name}</h3><p>{v.description}</p>{v.tags.some(t => preferences.tags.includes(t)) && <span className="match-label">Your kind of view</span>}</div></button></article>)}</div>}
      </section>
      <details className="coverage-details"><summary>About the collection</summary><p>{all.length} viewpoints across {catalog?.counties.length ?? 9} Bay Area counties. Check local access, hours, and conditions before visiting. Photos and sources are credited in each viewpoint’s details.</p><p>Distances are straight-line estimates, not driving distances. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Map © OpenStreetMap contributors</a></p></details>
    </main>
    <nav className="app-tabbar" aria-label="Main navigation"><button aria-current={view === "grid" ? "page" : undefined} onClick={() => changeView("grid")}><Compass size={22} /><span>Discover</span></button><button aria-current={view === "map" ? "page" : undefined} onClick={() => changeView("map")}><MapIcon size={22} /><span>Map</span></button><button onClick={() => setSetup("edit")}><SlidersHorizontal size={22} /><span>Preferences</span></button></nav>
    {selected && <ViewpointDetail viewpoint={selected} onClose={() => setSelected(null)} />}
  </div>;
}
