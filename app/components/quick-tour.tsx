"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Compass, MapPin, SlidersHorizontal, Sun, X } from "lucide-react";

export const TOUR_KEY = "sunspot.quick-tour.v1";
export default function QuickTour({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0), dialog = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null);
  const dismiss = useRef(onClose); dismiss.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (!visible) return;
    close.current?.focus({ preventScroll: true });
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); dismiss.current(); }
      if (e.key !== "Tab") return;
      const items = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
      const first = items[0], last = items[items.length - 1];
      if (!items.length) return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!dialog.current?.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [visible]);
  return <div className="tour-backdrop" data-motion={visible ? "enter" : "exit"} inert={!visible} aria-hidden={!visible}>
    <div ref={dialog} className="quick-tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-top"><span>A QUICK LOOK AROUND</span><button ref={close} onClick={onClose} aria-label="Skip tutorial"><X size={19} /></button></div>
      <div className="tour-progress" aria-label={`Step ${step + 1} of 3`}>{[0, 1, 2].map(i => <i key={i} data-active={i <= step} />)}</div>
      <div className="tour-step" key={step} aria-live="polite">
        {step === 0 ? <>
          <div className="tour-illustration tour-explore" aria-hidden="true"><MapPin size={26} /><span /><MapPin size={36} /><span /><MapPin size={26} /></div>
          <h2 id="tour-title">Your next good view.</h2>
          <p>Choose your area, search a place, or use filters to find your kind of view.</p>
          <div className="tour-tip"><Compass size={18} /><span><b>Discover</b> has nearby cards. Hover a map dot for a preview; tap it to keep the card and move closer. <b>Take a look</b> opens the full overview.</span></div>
          <div className="tour-tip"><SlidersHorizontal size={18} /><span><b>Map</b> gives you more room. <b>Hikes</b> matches your walking budget. <b>Preferences</b> changes your filters. Drag to pan; pinch or use + / − to zoom.</span></div>
        </> : step === 1 ? <>
          <div className="tour-illustration tour-sun-diagram"><svg viewBox="0 0 310 125" role="img" aria-label="The orange line points from the viewpoint toward the sun. The arrow points toward the sun to show where to look. The purple dashed line is the sunset direction."><text x="32" y="27" className="diagram-north">↑ N</text><path d="M55 91L246 28" className="diagram-sun-line" /><path d="M136 54L153 58L141 71" className="diagram-light-arrow" /><path d="M55 91L251 96" className="diagram-sunset-line" /><circle cx="55" cy="91" r="8" className="diagram-spot" /><circle cx="247" cy="28" r="8" className="diagram-sun" /><path d="M247 12v-4m0 40v-4m-16-16h-4m40 0h-4m-27-11-3-3m28 28-3-3m-22 0-3 3m28-28-3 3" className="diagram-sun-rays" /><text x="158" y="14">Sun direction</text><text x="171" y="117">Sunset direction</text></svg></div>
          <h2 id="tour-title">Follow the light.</h2>
          <div className="tour-tip"><Sun size={18} /><span>The <b>orange line and sun</b> show where to face. The arrow points toward the sun: that is where to look.</span></div>
          <p>The <b>purple dashed line</b> marks sunset direction. Bearings use true north. Dashed viewpoint pins mean estimated terrain obstruction; labels tell you when the sun is below the horizon.</p>
        </> : <>
          <div className="tour-illustration tour-moment" aria-hidden="true"><CalendarDays size={28} /><span>Today</span><span>6:00 PM</span><Sun size={24} /></div>
          <h2 id="tour-title">Pick your moment.</h2>
          <div className="tour-tip"><CalendarDays size={18} /><span>Open the clock to choose a <b>date and time</b> in Pacific Time, up to 48 hours ahead. Tap <b>Now</b> to return.</span></div>
          <p><b>Soft gray clouds</b> show regional forecast cover. Their shapes are illustrative, not exact cloud locations.</p>
          <p>Tap a dot for a preview, then Take a look for photos, visit details and directions in Google or Apple Maps. Scroll to explore. Reopen this tour with <b>?</b> anytime.</p>
        </>}
      </div>
      <div className="tour-actions"><button className="tour-secondary" onClick={() => step ? setStep(step - 1) : onClose()}>{step ? <><ArrowLeft size={15} />Back</> : "Skip for now"}</button><button className="tour-next" onClick={() => step < 2 ? setStep(step + 1) : onClose()}>{step < 2 ? "Next" : "Start exploring"}<ArrowRight size={16} /></button></div>
    </div>
  </div>;
}
