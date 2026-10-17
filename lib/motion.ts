export type MotionPreference = "system" | "full" | "reduced";
export const MOTION_KEY = "sunspot.motion.v1";
export function motionPreference(): MotionPreference {
  if (typeof document === "undefined") return "system";
  const value = document.documentElement.dataset.motionPreference;
  return value === "full" || value === "reduced" ? value : "system";
}
export function prefersReducedMotion() {
  return motionPreference() === "reduced" || (motionPreference() === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
export function setMotionPreference(value: MotionPreference) {
  document.documentElement.dataset.motionPreference = value;
  try { localStorage.setItem(MOTION_KEY, value); } catch { /* The choice still applies for this session. */ }
  window.dispatchEvent(new Event("sunspot-motion-change"));
}
export function initializeMotionPreference() {
  try {
    const stored = localStorage.getItem(MOTION_KEY);
    document.documentElement.dataset.motionPreference = stored === "full" || stored === "reduced" ? stored : "system";
  } catch { document.documentElement.dataset.motionPreference = "system"; }
}
