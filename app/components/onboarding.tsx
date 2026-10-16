"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Binoculars, Check, Compass, LocateFixed, Mountain, Trees, Waves } from "lucide-react";
import LocationPicker from "./location-picker";
import type { SearchLocation } from "../../lib/location";
import { DEFAULT_PREFERENCES, type Preferences } from "../../lib/preferences";

export const sceneryOptions = [
  { id: "ocean", label: "Ocean & coast", note: "Salt air, wide horizons", icon: Waves },
  { id: "skyline", label: "City skylines", note: "A different angle on the city", icon: Binoculars },
  { id: "bridges", label: "Iconic bridges", note: "The Bay’s best silhouettes", icon: Compass },
  { id: "hills", label: "Hills & peaks", note: "A little higher, a little quieter", icon: Mountain },
  { id: "greenery", label: "Nature & greenery", note: "Room to breathe", icon: Trees },
];
export default function Onboarding({ initial, editing, locationStatus, locating, hasLocation, locationFailed, onChooseLocation, onLocate, onComplete, onCancel }: {
  initial: Preferences; editing: boolean; locationStatus: string; locating: boolean; hasLocation: boolean; locationFailed: boolean; onChooseLocation: (location: SearchLocation) => void;
  onLocate: () => Promise<boolean>; onComplete: (preferences: Preferences) => void; onCancel: () => void;
}) {
  const [step, setStep] = useState(editing ? 1 : 0);
  const [draft, setDraft] = useState<Preferences>(initial);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, [step]);
  const advance = (next: Preferences) => { setDraft(next); if (step === 3) onComplete(next); else setStep(s => s + 1); };
  const skip = () => advance(step === 1 ? { ...draft, tags: [] } : step === 2 ? { ...draft, radius: null } : { ...draft, priority: DEFAULT_PREFERENCES.priority });
  return <main className="onboarding">
    <div className="onboarding-brand"><img src="/brand/sunspot-wordmark.png" alt="Sunspot" width="170" height="57" />{editing && <button className="text-button" onClick={onCancel}>Cancel</button>}</div>
    <div className="onboarding-progress" aria-label={step === 0 ? "Location setup" : `Question ${step} of 3`}>{[0, 1, 2, 3].map(i => <span key={i} className={i <= step ? "filled" : ""} />)}</div>
    <section className="onboarding-content">
      <div className="onboarding-art">{step === 0 ? <LocateFixed size={44} strokeWidth={1.3} /> : step === 1 ? <Mountain size={44} strokeWidth={1.3} /> : step === 2 ? <Compass size={44} strokeWidth={1.3} /> : <Binoculars size={44} strokeWidth={1.3} />}</div>
      <p className="eyebrow orange">{step === 0 ? "Your next view starts here" : `Make it yours · ${step} of 3`}</p>
      <h1 ref={title} tabIndex={-1}>{step === 0 ? "Great views, closer to you." : step === 1 ? "What’s your kind of view?" : step === 2 ? "How far would you wander?" : "What comes first?"}</h1>
      <p className="onboarding-description">{step === 0 ? "Let Sunspot use your location to find nearby viewpoints. Your coordinates stay in this session." : step === 1 ? "Pick a few favorites. We’ll bring those views to the top when you prioritize scenery." : step === 2 ? "Choose a distance from your location, as the crow flies. You can always change it." : "A quick escape, or the scenery you love? You choose how we sort your discoveries."}</p>
      {step === 0 ? <><div className="location-explainer"><MapIllustration /><span>Made for the San Francisco Bay Area.<br />More little escapes, less searching.</span></div>{locationStatus && <p className="onboarding-status" role="status">{locationStatus}</p>}<button className="onboarding-primary" disabled={locating} onClick={async () => { if (hasLocation || await onLocate()) setStep(1); }}>{locating ? "Finding you…" : hasLocation ? "Continue" : "Use my location"}<ArrowRight size={19} /></button><LocationPicker expanded={locationFailed} onSelect={chosen => { onChooseLocation(chosen); setStep(1); }} /><button className="onboarding-skip" onClick={() => setStep(1)}>Continue without location</button><p className="onboarding-fine">Location is optional. You’re in control.</p></> : <>
        <div className="answer-options">
          {step === 1 && sceneryOptions.map(s => <button key={s.id} aria-pressed={draft.tags.includes(s.id)} className={`answer-option ${draft.tags.includes(s.id) ? "chosen" : ""}`} onClick={() => setDraft(p => ({ ...p, tags: p.tags.includes(s.id) ? p.tags.filter(t => t !== s.id) : [...p.tags, s.id] }))}><s.icon size={23} /><span><strong>{s.label}</strong><small>{s.note}</small></span><span className="answer-check">{draft.tags.includes(s.id) && <Check size={15} />}</span></button>)}
          {step === 2 && [{ radius: 10, label: "Keep it local", note: "Within 10 miles" }, { radius: 25, label: "A little adventure", note: "Within 25 miles" }, { radius: 50, label: "Make a day of it", note: "Within 50 miles" }, { radius: null, label: "Anywhere in the Bay", note: "No distance limit" }].map(s => <button key={String(s.radius)} aria-pressed={draft.radius === s.radius} className={`answer-option ${draft.radius === s.radius ? "chosen" : ""}`} onClick={() => setDraft(p => ({ ...p, radius: s.radius }))}><Compass size={23} /><span><strong>{s.label}</strong><small>{s.note}</small></span><span className="answer-check">{draft.radius === s.radius && <Check size={15} />}</span></button>)}
          {step === 3 && [{ id: "nearby" as const, label: "The closest escape", note: "Nearest viewpoints first", icon: LocateFixed }, { id: "scenery" as const, label: "My kind of scenery", note: "Best scenery matches first, then distance", icon: Mountain }].map(s => <button key={s.id} aria-pressed={draft.priority === s.id} className={`answer-option ${draft.priority === s.id ? "chosen" : ""}`} onClick={() => setDraft(p => ({ ...p, priority: s.id }))}><s.icon size={23} /><span><strong>{s.label}</strong><small>{s.note}</small></span><span className="answer-check">{draft.priority === s.id && <Check size={15} />}</span></button>)}
        </div>
        {step === 2 && !hasLocation && <p className="onboarding-status">We’ll apply your distance once you enable location. For now, explore the whole Bay.</p>}
        <button className="onboarding-primary" onClick={() => advance(draft)}>{step === 3 ? "Find my views" : "Continue"}<ArrowRight size={19} /></button>
        <button className="onboarding-skip" onClick={skip}>Skip this question</button>
        <div className="onboarding-bottom"><button className="text-button" onClick={() => setStep(s => s - 1)}><ArrowLeft size={14} /> Back</button><button className="text-button" onClick={() => onComplete(editing ? initial : DEFAULT_PREFERENCES)}>{editing ? "Keep my preferences" : "Skip all preferences"}</button></div>
      </>}
    </section>
  </main>;
}
function MapIllustration() { return <div className="location-orbit"><span /><LocateFixed size={28} /><i /><i /></div>; }
