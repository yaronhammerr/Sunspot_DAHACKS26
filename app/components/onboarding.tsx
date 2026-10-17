"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Binoculars, Check, Compass, LocateFixed, Mountain, Trees, Waves, X } from "lucide-react";
import LocationPicker from "./location-picker";
import type { SearchLocation } from "../../lib/location";
import { DEFAULT_PREFERENCES, type Preferences } from "../../lib/preferences";

export const sceneryOptions = [
  { id: "ocean", label: "Ocean & coast", icon: Waves },
  { id: "bay", label: "Bay & harbor", icon: Waves },
  { id: "water", label: "Lakes & rivers", icon: Waves },
  { id: "skyline", label: "City skylines", icon: Binoculars },
  { id: "bridges", label: "Bridges", icon: Compass },
  { id: "hills", label: "Hills & peaks", icon: Mountain },
  { id: "greenery", label: "Nature & greenery", icon: Trees },
];

export default function Onboarding({ initial, editing, locationStatus, locating, hasLocation, locationAccess = false, locationFailed, onChooseLocation, onLocate, onComplete, onCancel }: {
  initial: Preferences; editing: boolean; locationStatus: string; locating: boolean; hasLocation: boolean; locationAccess?: boolean; locationFailed: boolean;
  onChooseLocation: (location: SearchLocation) => void; onLocate: () => Promise<boolean>; onComplete: (preferences: Preferences) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Preferences>(initial), [citiesOpen, setCitiesOpen] = useState(false);
  const title = useRef<HTMLHeadingElement>(null), root = useRef<HTMLElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  return <section ref={root} className="onboarding onboarding-compact" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
    if (event.key !== "Tab") return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]),select,input,[tabindex="0"]') ?? [])].filter(item => item.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="setup-heading"><div><p className="eyebrow orange">{editing ? "YOUR PREFERENCES" : "A LITTLE TIME OUTSIDE"}</p><h1 ref={title} id="setup-title" tabIndex={-1}>{editing ? "Your kind of outside." : "Find a nearby view that fits your day."}</h1><p>Three optional choices. Change them anytime.</p></div><button className="icon-button" aria-label={editing ? "Cancel preference changes" : "Skip setup and explore now"} onClick={onCancel}><X size={19} /></button></header>
    <div className="setup-scroll">
      <div className="setup-location"><LocateFixed size={18} /><div><strong>{hasLocation ? "Your area is set" : locating ? "Finding your location…" : locationAccess ? "Location access is on" : "Nearby starts with an area"}</strong><span>{hasLocation ? "Distances use your selected area." : "Optional. You can explore without it."}</span></div>{!hasLocation && <button disabled={locating} onClick={() => void onLocate()}>{locating ? "Finding…" : locationAccess ? "Retry position" : "Use my location"}</button>}</div>
      <button className="setup-city-toggle" aria-expanded={citiesOpen || locationFailed} onClick={() => setCitiesOpen(v => !v)}>{hasLocation ? "Explore another city" : "Choose a city instead"}</button>
      {(citiesOpen || locationFailed) && <LocationPicker expanded onSelect={onChooseLocation} />}
      {locationStatus && <p className="setup-feedback" role="status">{locationStatus}</p>}
      <fieldset className="setup-question" aria-labelledby="setup-scenery-question"><legend><span id="setup-scenery-question">1. What’s your kind of view?</span><button className="setup-skip" aria-label="Skip scenery question" onClick={() => setDraft(p => ({ ...p, tags: [] }))}>Skip</button></legend><div className="setup-choices scenery-choices">{sceneryOptions.map(option => <button key={option.id} aria-pressed={draft.tags.includes(option.id)} onClick={() => setDraft(p => ({ ...p, tags: p.tags.includes(option.id) ? p.tags.filter(tag => tag !== option.id) : [...p.tags, option.id] }))}><option.icon size={16} />{option.label}{draft.tags.includes(option.id) && <Check size={13} />}</button>)}</div></fieldset>
      <fieldset className="setup-question" aria-labelledby="setup-radius-question"><legend><span id="setup-radius-question">2. How far from your area?</span><button className="setup-skip" aria-label="Skip nearby radius question" onClick={() => setDraft(p => ({ ...p, radius: null }))}>Skip</button></legend><p className="setup-question-note">Nearby radius in a straight line. Set a walking budget in Hikes.</p><div className="setup-choices" role="group" aria-label="Nearby radius">{[10, 25, 50, null].map(radius => <button key={String(radius)} aria-pressed={draft.radius === radius} onClick={() => setDraft(p => ({ ...p, radius }))}>{radius === null ? "Any distance" : radius + " mi away"}</button>)}</div>{draft.radius !== null && !hasLocation && <p className="setup-question-note">This radius applies once you choose an area.</p>}</fieldset>
      <fieldset className="setup-question" aria-labelledby="setup-priority-question"><legend><span id="setup-priority-question">3. What comes first?</span><button className="setup-skip" aria-label="Skip sorting question" onClick={() => setDraft(p => ({ ...p, priority: DEFAULT_PREFERENCES.priority }))}>Skip</button></legend><div className="setup-choices" role="group" aria-label="Recommendation priority"><button aria-pressed={draft.priority === "nearby"} onClick={() => setDraft(p => ({ ...p, priority: "nearby" }))}><LocateFixed size={15} />Closest views</button><button aria-pressed={draft.priority === "scenery"} onClick={() => setDraft(p => ({ ...p, priority: "scenery" }))}><Mountain size={15} />My scenery first</button></div></fieldset>
    </div>
    <footer className="setup-footer"><button className="setup-explore" onClick={() => onComplete(draft)}>{editing ? "Save preferences" : "Explore now"}<ArrowRight size={17} /></button><button className="setup-later" onClick={onCancel}>{editing ? "Keep current preferences" : "Skip all preferences"}</button></footer>
  </section>;
}
