"use client";
import { useEffect, useState } from "react";

/** Keep an outgoing layer mounted just long enough to finish its exit animation. */
export function usePresence(visible: boolean, duration = 200) {
  const [retained, setRetained] = useState(visible);
  useEffect(() => {
    if (visible) { setRetained(true); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setRetained(false); return; }
    const timeout = window.setTimeout(() => setRetained(false), duration);
    return () => window.clearTimeout(timeout);
  }, [visible, duration]);
  return { present: visible || retained, state: visible ? "enter" : "exit" } as const;
}

/** Briefly fade the old place out, then reveal the most recently requested place. */
export function useAnimatedViewpoint<T extends { id: string }>(value: T) {
  const [displayed, setDisplayed] = useState(value);
  const [phase, setPhase] = useState<"enter" | "exit">("enter");
  useEffect(() => {
    if (displayed.id === value.id) { setPhase("enter"); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setDisplayed(value); setPhase("enter"); return; }
    setPhase("exit");
    const timeout = window.setTimeout(() => { setDisplayed(value); setPhase("enter"); }, 100);
    return () => window.clearTimeout(timeout);
  }, [value, displayed.id]);
  // An updated record for the same place should be visible immediately. Keeping
  // the original object here made refreshed names/photos silently stay stale.
  return { displayed: displayed.id === value.id ? value : displayed, phase };
}
