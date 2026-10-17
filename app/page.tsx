"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check, CircleHelp, Compass, LocateFixed, Map as MapIcon, Mountain, Footprints, Search, SlidersHorizontal, Trees, Waves, X } from "lucide-react";
import type { Catalog, Viewpoint } from "../lib/types";
import { distanceMiles, filterScenery, sceneryLabel, SCENERY } from "../lib/discovery";
import { localRecommendations } from "../lib/map-experience";
import { recommendationReasons } from "../lib/recommendation-reasons";
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, personalizedViews, readPreferences, type Preferences } from "../lib/preferences";
import ViewpointMap from "./components/viewpoint-map";
import ViewpointDetail from "./components/viewpoint-detail";
import RecommendedSpots from "./components/recommended-spots";
import { usePresence } from "./components/use-motion";
import Onboarding from "./components/onboarding";
import InstallApp from "./components/install-app";
import LocationPicker from "./components/location-picker";
import { createDeviceLocationSession, LocationError, type SearchLocation } from "../lib/location";
import ForecastControl, { type WeatherLayers } from "./components/forecast-control";
import { useForecast, useTerrain } from "./components/use-forecast";
import { forecastRangeEnd } from "../lib/weather";
import QuickTour, { TOUR_KEY } from "./components/quick-tour";
import MotionSetting from "./components/motion-setting";
import HikesPanel from "./components/hikes-panel";
import { initializeMotionPreference } from "../lib/motion";

export default function Home() {
  useEffect(initializeMotionPreference, []);
  const [timeRevision, setTimeRevision] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [county, setCounty] = useState("");
  const [region, setRegion] = useState("");
  const [scenery, setScenery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [setup, setSetup] = useState<"loading" | "first" | "edit" | "done">("loading");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const tutorialPresence = usePresence(tutorialOpen, 160);
  const closeTutorial = () => { setTutorialOpen(false); try { localStorage.setItem(TOUR_KEY, "seen"); } catch { /* Dismissed for this session even if storage is unavailable. */ } };
  const [now, setNow] = useState(() => Date.now()), [live, setLive] = useState(true), [fixedTime, setFixedTime] = useState(() => Date.now());
  const [mapCenter, setMapCenter] = useState({ lat: 37.77, lng: -122.43 });
  const [weatherLayers, setWeatherLayers] = useState<WeatherLayers>({ cloud: true, opacity: 25 });
  const weather = useForecast(setup !== "loading"), terrain = useTerrain(setup !== "loading");
  const selectedTime = live ? now : fixedTime;
  const selectTime = (time: number) => { const current = Date.now(); if (time < current - 60_000 || time > forecastRangeEnd(weather.forecast, current)) return; setFixedTime(time); setLive(false); setTimeRevision(v => v + 1); };
  const returnToNow = () => { setNow(Date.now()); setLive(true); setTimeRevision(v => v + 1); };
  const forecastState = useMemo(() => ({ forecast: weather.forecast, terrain, time: selectedTime, now, layers: weatherLayers }), [weather.forecast, terrain, selectedTime, now, weatherLayers]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const [editorSession, setEditorSession] = useState(0);
  const [storageStatus, setStorageStatus] = useState("");
  const [view, setView] = useState<"discover" | "map" | "hikes">("discover");
  const [selected, setSelected] = useState<Viewpoint | null>(null);
  const lastSelected = useRef<Viewpoint | null>(null);
  if (selected) lastSelected.current = selected;
  const detailPresence = usePresence(!!selected);
  const filtersPresence = usePresence(filtersOpen);
  const locationPresence = usePresence(locationOpen);
  const editorPresence = usePresence(setup === "edit");
  const firstSetupPresence = usePresence(setup === "first", 180);
  const focusAfterSetup = useRef(false);
  const mapPromptPresence = usePresence(view === "map" && !filtersOpen);
  const hikesPresence = usePresence(view === "hikes" && !filtersOpen);
  const editor = useRef<HTMLDivElement>(null);
  const editorTrigger = useRef<HTMLElement | null>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const [location, setLocation] = useState<SearchLocation | null>(null);
  const [deviceLocationSession] = useState(createDeviceLocationSession);
  const hasDeviceLocation = !!location && !location.label;
  const [locationAccess, setLocationAccess] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const locatingRef = useRef(false);
  const locationRequest = useRef(0);
  const [locationFailed, setLocationFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLElement>(null);
  const filterTrigger = useRef<HTMLElement | null>(null);
  const locationTrigger = useRef<HTMLElement | null>(null);
  const closeFilters = (restoreFocus = false) => { setFiltersOpen(false); if (restoreFocus && filterTrigger.current?.isConnected) filterTrigger.current.focus({ preventScroll: true }); };
  const closeLocation = (restoreFocus = false) => {
    setLocationOpen(false);
    if (restoreFocus) (locationTrigger.current?.isConnected ? locationTrigger.current : toolbar.current?.querySelector<HTMLElement>(".map-location-pill"))?.focus({ preventScroll: true });
  };
  const toggleFilters = () => {
    if (filtersOpen) { closeFilters(true); return; }
    filterTrigger.current = document.activeElement as HTMLElement | null;
    setFiltersOpen(true); setLocationOpen(false);
  };
  const toggleLocation = () => {
    if (locationOpen) { closeLocation(true); return; }
    locationTrigger.current = document.activeElement as HTMLElement | null;
    setLocationOpen(true); setFiltersOpen(false);
  };
  const nearMe = useCallback(async (): Promise<boolean> => {
    if (locatingRef.current) return false;
    const request = ++locationRequest.current;
    locatingRef.current = true; setLocating(true); setLocationFailed(false); setLocationStatus("Finding your location…");
    try {
      const found = await deviceLocationSession.find(navigator.geolocation, window.isSecureContext, () => {
        if (request === locationRequest.current) setLocationStatus("Trying a fresh, more accurate location. This can take up to 20 seconds…");
      });
      if (request !== locationRequest.current) return false;
      setLocation(found); setLocationAccess(true); setLocationStatus("Device location enabled. Distances are measured in a straight line.");
      return true;
    } catch (error) {
      if (request === locationRequest.current) {
        if (error instanceof LocationError && error.reason === "permission") setLocationAccess(false);
        setLocationFailed(true);
        setLocationStatus(error instanceof LocationError ? error.message : "Location is unavailable. Choose a city below to keep exploring nearby.");
      }
      return false;
    } finally {
      if (request === locationRequest.current) { locatingRef.current = false; setLocating(false); }
    }
  }, [deviceLocationSession]);
  const chooseLocation = (chosen: SearchLocation) => {
    // Ignore late device callbacks after the user chooses an area.
    ++locationRequest.current; locatingRef.current = false; setLocating(false); setLocationFailed(false);
    setLocation(chosen); closeLocation(locationOpen); setLocationStatus(`Exploring near ${chosen.label}. Distances are approximate, measured from the city center.`);
  };
  useEffect(() => {
    let saved: Preferences | null = null;
    try { saved = readPreferences(localStorage.getItem(PREFERENCES_KEY)); }
    catch { setStorageStatus("Preferences will last for this session. Device storage is unavailable."); }
    if (saved) { setPreferences(saved); setSetup("done"); } else setSetup("first");
    // Existing permission applies to first-time setup too. Never prompt on launch.
    navigator.permissions?.query({ name: "geolocation" }).then(p => { setLocationAccess(p.state === "granted"); if (p.state === "granted" && locationRequest.current === 0) void nearMe(); }).catch(() => {});
  }, [nearMe]);
  useEffect(() => {
    const controller = new AbortController(); setError("");
    fetch("/api/viewpoints", { cache: "no-cache", signal: controller.signal }).then(async r => { if (!r.ok) throw new Error("We couldn’t load the viewpoints. Please try again."); return r.json() as Promise<Catalog>; }).then(data => { if (!controller.signal.aborted) setCatalog(data); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "We couldn’t load the viewpoints. Please try again."); });
    return () => controller.abort();
  }, [retry]);
  const savePreferences = (p: Preferences, focusSearch = false) => {
    setPreferences(p); setSetup("done");
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(p)); setStorageStatus(""); }
    catch { setStorageStatus("Your choices are active for this session, but couldn’t be saved on this device."); }
    if (focusSearch) focusAfterSetup.current = true;
  };
  useEffect(() => { if (!firstSetupPresence.present && focusAfterSetup.current) { focusAfterSetup.current = false; searchInput.current?.focus({ preventScroll: true }); } }, [firstSetupPresence.present]);
  const switchView = (next: "discover" | "map" | "hikes") => { setView(next); setFiltersOpen(false); setLocationOpen(false); };
  const locateFromMap = () => { locationTrigger.current = document.activeElement as HTMLElement | null; setLocationOpen(true); setFiltersOpen(false); if (!location) void nearMe(); };
  const selectViewpoint = (viewpoint: Viewpoint) => { if (!selected) detailTrigger.current = document.activeElement as HTMLElement | null; setActiveId(viewpoint.id); setSelected(viewpoint); };
  const editPreferences = () => { editorTrigger.current = filterTrigger.current ?? document.activeElement as HTMLElement | null; setEditorSession(v => v + 1); setSetup("edit"); setFiltersOpen(false); setLocationOpen(false); };
  useEffect(() => {
    if (setup !== "edit") return;
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") { setSetup("done"); return; }
      if (event.key !== "Tab") return;
      const controls = [...(editor.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]') ?? [])].filter(control => control.getClientRects().length);
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement?.tagName === "H1")) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [setup]);
  useEffect(() => {
    if (!editorPresence.present && editorTrigger.current) { if (editorTrigger.current.isConnected) editorTrigger.current.focus({ preventScroll: true }); editorTrigger.current = null; }
  }, [editorPresence.present]);
  useEffect(() => {
    if (!detailPresence.present && detailTrigger.current) { if (detailTrigger.current.isConnected) detailTrigger.current.focus({ preventScroll: true }); detailTrigger.current = null; }
  }, [detailPresence.present]);
  const all = useMemo(() => catalog?.viewpoints ?? [], [catalog]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return personalizedViews(filterScenery(all, scenery).filter(v => (!q || `${v.name} ${v.county}`.toLowerCase().includes(q)) && (!county || v.county === county) && (!region || v.region === region)), preferences, location);
  }, [all, query, county, region, scenery, preferences, location]);
  const recommendations = useMemo(() => localRecommendations(filtered, location), [filtered, location]);
  const reasons = useMemo(() => recommendationReasons(filtered, preferences, location, scenery), [filtered, preferences, location, scenery]);
  const selectedIndex = selected ? filtered.findIndex(v => v.id === selected.id) : -1;
  const activeTab = filtersOpen || setup === "edit" ? 3 : view === "hikes" ? 2 : view === "map" ? 1 : 0;
  const hasFilters = !!(query || county || region || scenery || preferences.radius !== null);
  const filterCount = Number(!!county) + Number(!!region) + Number(preferences.radius !== null) + Number(preferences.priority === "scenery");
  const reset = () => { setQuery(""); setCounty(""); setRegion(""); setScenery(""); savePreferences(DEFAULT_PREFERENCES); };
  useEffect(() => {
    const close = (e: PointerEvent) => { if (e.target instanceof Element && e.target.closest(".sunspot-select-menu")) return; if (!toolbar.current?.contains(e.target as Node) && !tabs.current?.contains(e.target as Node)) { setFiltersOpen(false); setLocationOpen(false); } };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filtersOpen) { setFiltersOpen(false); if (filterTrigger.current?.isConnected) filterTrigger.current.focus({ preventScroll: true }); }
      if (locationOpen) { setLocationOpen(false); (locationTrigger.current?.isConnected ? locationTrigger.current : toolbar.current?.querySelector<HTMLElement>(".map-location-pill"))?.focus({ preventScroll: true }); }
    };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [filtersOpen, locationOpen]);
  if (setup === "loading") return <div className="app-splash" role="status"><img src="/brand/sunspot-wordmark.png" alt="Sunspot" width="190" height="64" /><p>Finding your outside…</p></div>;
  return <div className="sunspot-app map-home">
    <main className="map-stage" aria-label="Discover viewpoints" inert={firstSetupPresence.present || editorPresence.present || detailPresence.present || tutorialPresence.present}>
      <ViewpointMap viewpoints={filtered} recommendations={recommendations} highlightedIds={view === "discover" && !filtersOpen ? highlightedIds : []} activeId={selected?.id ?? activeId} focusedId={selected?.id ?? null} onSelect={selectViewpoint} location={location} locationAccess={locationAccess} onLocate={locateFromMap} locating={locating} searching={hasFilters} expanded={view !== "discover" || filtersOpen} forecastState={forecastState} onCenter={setMapCenter} />
      {!filtersOpen && !locationOpen && view !== "hikes" && <ForecastControl revision={timeRevision} now={now} selected={selectedTime} live={live} onSelect={selectTime} onNow={returnToNow} reference={selected ?? mapCenter} referenceName={selected?.name ?? "map center"} forecast={weather.forecast} loading={weather.loading} error={weather.error} layers={weatherLayers} onLayers={setWeatherLayers} />}
      <div className="map-topbar" ref={toolbar}>
        <header className="map-brand-row"><div className="map-brand-tools"><img src="/brand/sunspot-wordmark.png" alt="Sunspot" width="132" height="44" /><button className="quick-tour-trigger" aria-label="How Sunspot works: open quick tutorial" title="Quick tutorial" onClick={() => { setFiltersOpen(false); setLocationOpen(false); setTutorialOpen(true); }}><CircleHelp size={19} /></button></div><button className="map-location-pill" aria-label={hasDeviceLocation ? "Device location enabled; location options" : undefined} aria-expanded={locationOpen} aria-controls="map-location-panel" onClick={toggleLocation}><LocateFixed size={14} /><span>{locating ? "Finding you…" : location?.label ? `Near ${location.label}` : location ? "Location on" : "Choose your area"}</span></button></header>
        <div className="map-search-row"><label className="map-search"><Search size={20} /><input ref={searchInput} type="search" placeholder="Find your next good view" value={query} onChange={e => { setQuery(e.target.value); setView("discover"); }} aria-label="Search viewpoints or counties" />{query && <button aria-label="Clear search" onClick={() => { setQuery(""); searchInput.current?.focus({ preventScroll: true }); }}><X size={16} /></button>}</label><button className={`map-filter-button ${filtersOpen || filterCount ? "is-active" : ""}`} aria-label={`Filters${filterCount ? `, ${filterCount} active` : ""}`} aria-expanded={filtersOpen} aria-controls="map-filter-panel" onClick={toggleFilters}><SlidersHorizontal size={19} /><span>Filters</span>{filterCount > 0 && <b>{filterCount}</b>}</button></div>
        <div className="map-scenery" aria-label="Filter by scenery"><button aria-pressed={!scenery} onClick={() => { setScenery(""); setActiveId(null); setView("discover"); }}><Compass size={14} />All views</button>{SCENERY.map(tag => <button key={tag} aria-pressed={scenery === tag} onClick={() => { setScenery(scenery === tag ? "" : tag); setActiveId(null); setView("discover"); }}>{["ocean", "bay", "water"].includes(tag) ? <Waves size={14} /> : tag === "greenery" ? <Trees size={14} /> : tag === "hills" ? <Mountain size={14} /> : null}{sceneryLabel(tag)}</button>)}</div>
        {locationPresence.present && <section data-motion={locationPresence.state} inert={!locationOpen} aria-hidden={!locationOpen} className="map-popover location-popover" id="map-location-panel" aria-label="Your location"><div className="popover-title"><h2>A little closer to you.</h2><button aria-label="Close location options" onClick={() => closeLocation(true)}><X size={18} /></button></div><p>{hasDeviceLocation ? "Nearby views are using your device location. You can also explore another city." : locationAccess ? "Location access is already on. Retry your position or explore a city below." : "Use your location or pick a city for nearby viewpoints."}</p>{hasDeviceLocation ? <div className="location-enabled"><LocateFixed size={17} /><span>Device location enabled</span><Check size={16} /></div> : <button className="find-location-button" disabled={locating} onClick={() => void nearMe()}><LocateFixed size={16} />{locating ? "Finding your location…" : locationAccess ? "Retry device location" : "Use my location"}<ArrowRight size={16} /></button>}{locationStatus && <p className="location-feedback" role="status">{locationStatus}</p>}<LocationPicker expanded onSelect={chooseLocation} />{location && <button className="text-button" onClick={() => { ++locationRequest.current; deviceLocationSession.clear(); locatingRef.current = false; setLocating(false); setLocation(null); setLocationFailed(false); setLocationStatus("Location cleared for this session."); }}>Clear location</button>}</section>}
        {filtersPresence.present && <section data-motion={filtersPresence.state} inert={!filtersOpen} aria-hidden={!filtersOpen} className="map-popover filter-popover" id="map-filter-panel" aria-label="Viewpoint filters"><div className="popover-title"><h2>Make it your kind of outside.</h2><button aria-label="Close filters" onClick={() => closeFilters(true)}><X size={18} /></button></div><div className="map-filter-fields"><label>Explore region<select value={region} onChange={e => { setRegion(e.target.value); setCounty(""); setView("discover"); }}><option value="">All Northern California</option><option value="bay-area">Bay Area · nine counties</option><option value="northern-california">Beyond the Bay Area</option></select></label><label>County<select value={county} onChange={e => { setCounty(e.target.value); setView("discover"); }}><option value="">All counties</option>{catalog?.counties.filter(c => !region || all.some(v => v.county === c && v.region === region)).map(c => <option key={c} value={c}>{c.replace(/ County$/, "")}</option>)}</select></label><label>Nearby radius<select value={preferences.radius ?? ""} onChange={e => { savePreferences({ ...preferences, radius: e.target.value ? Number(e.target.value) : null }); setView("discover"); }}><option value="">Any distance</option><option value="10">Within 10 mi of your area</option><option value="25">Within 25 mi of your area</option><option value="50">Within 50 mi of your area</option></select></label><label>Recommend by<select value={preferences.priority} onChange={e => savePreferences({ ...preferences, priority: e.target.value as Preferences["priority"] })}><option value="nearby">Closest to me</option><option value="scenery">My scenery preferences</option></select></label></div><p className="filter-note">Nearby radius is a straight-line distance. Set your walking distance separately in Hikes.{!location && preferences.radius !== null ? " Choose an area to apply this radius." : ""}</p>{preferences.tags.length > 0 && <p className="filter-note">Favorite scenery: {preferences.tags.map(sceneryLabel).join(", ")}</p>}<div className="filter-actions"><button className="text-button" onClick={reset}>Reset filters</button><button className="filter-done" onClick={() => closeFilters(true)}>Show {filtered.length.toLocaleString()} spots <ArrowRight size={14} /></button></div><button className="preferences-link" onClick={editPreferences}><SlidersHorizontal size={14} />Edit my preferences<ArrowRight size={14} /></button><MotionSetting /><InstallApp /><details className="map-collection"><summary>About the collection</summary><p>{all.length.toLocaleString()} viewpoints across {catalog?.counties.length ?? 9} counties. {catalog?.coverage?.officialProfiles ?? 0} profiles researched from agency sources; others are community-mapped. Every listed spot has a reviewed preview photo. Check the sourced hours, rules and conditions in each spot’s overview. Distances are straight-line estimates.</p></details></section>}
      </div>
      {!location && !locationOpen && !filtersOpen && <button className="map-location-nudge" onClick={locateFromMap} disabled={locating}><LocateFixed size={15} /><span>{locating ? "Finding your location…" : locationAccess ? "Retry device location" : "Find good views near me"}</span><ArrowRight size={14} /></button>}
      {location && recommendations[0] && distanceMiles(location, recommendations[0]) > 80 && !hasFilters && <p className="map-area-notice">Our collection currently covers Northern California. Search a place to explore there.</p>}
      <div className="sr-only" role="status">{locationStatus} {storageStatus} {catalog ? `${filtered.length} viewpoints match your search.` : "Loading viewpoints."}</div>
      <RecommendedSpots viewpoints={recommendations} reasons={reasons} location={location} hidden={view !== "discover" || filtersOpen || setup === "edit"} loading={!catalog && !error} error={error} matchingCount={filtered.length} hasFilters={hasFilters} onSelect={selectViewpoint} onHighlight={setHighlightedIds} onActive={setActiveId} onClose={() => switchView("map")} onReset={reset} onRetry={() => setRetry(v => v + 1)} />
      {mapPromptPresence.present && <button data-motion={mapPromptPresence.state} inert={view !== "map" || filtersOpen} aria-hidden={view !== "map" || filtersOpen} className="show-recommendations" onClick={() => switchView("discover")}><Compass size={17} />Show nearby picks<ArrowRight size={15} /></button>}
    </main>
    <nav ref={tabs} className="map-tabbar" aria-label="Main navigation" inert={firstSetupPresence.present || editorPresence.present || detailPresence.present || tutorialPresence.present} style={{ "--active-tab": activeTab } as CSSProperties}><button aria-current={activeTab === 0 ? "page" : undefined} onClick={() => switchView("discover")}><Compass size={21} /><span>Discover</span></button><button aria-current={activeTab === 1 ? "page" : undefined} onClick={() => switchView("map")}><MapIcon size={21} /><span>Map</span></button><button aria-current={activeTab === 2 ? "page" : undefined} onClick={() => switchView("hikes")}><Footprints size={21} /><span>Hikes</span></button><button aria-expanded={filtersOpen} aria-controls="map-filter-panel" onClick={toggleFilters}><SlidersHorizontal size={21} /><span>Preferences</span></button></nav>
    {hikesPresence.present && <HikesPanel blocked={detailPresence.present || editorPresence.present || tutorialPresence.present} visible={view === "hikes" && !filtersOpen} viewpoints={filtered} preferences={preferences} location={location} onSelect={selectViewpoint} onClose={() => switchView("map")} onLocate={() => { switchView("map"); locateFromMap(); }} />}
    {tutorialPresence.present && <QuickTour visible={tutorialOpen} onClose={closeTutorial} />}
    {firstSetupPresence.present && <div className="first-setup-overlay" data-motion={firstSetupPresence.state} inert={setup !== "first"} aria-hidden={setup !== "first"} role="dialog" aria-modal="true" aria-labelledby="setup-title"><Onboarding initial={preferences} editing={false} locationStatus={locationStatus} locating={locating} hasLocation={!!location} locationAccess={locationAccess} locationFailed={locationFailed} onChooseLocation={chooseLocation} onLocate={nearMe} onComplete={p => savePreferences(p, true)} onCancel={() => savePreferences(DEFAULT_PREFERENCES, true)} /></div>}
    {editorPresence.present && <div ref={editor} className="preferences-editor" data-motion={editorPresence.state} inert={setup !== "edit"} role="dialog" aria-modal="true" aria-label="Your viewpoint preferences" aria-hidden={setup !== "edit"}><Onboarding key={editorSession} initial={preferences} editing locationStatus={locationStatus} locating={locating} hasLocation={!!location} locationAccess={locationAccess} locationFailed={locationFailed} onChooseLocation={chooseLocation} onLocate={nearMe} onComplete={p => savePreferences(p)} onCancel={() => setSetup("done")} /></div>}
    {detailPresence.present && lastSelected.current && <ViewpointDetail viewpoint={selected ?? lastSelected.current} visible={!!selected} onClose={() => setSelected(null)} previous={selectedIndex > 0 ? filtered[selectedIndex - 1] : undefined} next={selectedIndex >= 0 ? filtered[selectedIndex + 1] : undefined} position={selectedIndex >= 0 ? `${selectedIndex + 1} / ${filtered.length}` : undefined} onNavigate={selectViewpoint} timeRevision={timeRevision} selectedTime={selectedTime} now={now} forecast={weather.forecast} terrain={terrain} onTimeSelect={selectTime} onNow={returnToNow} />}
  </div>;
}
