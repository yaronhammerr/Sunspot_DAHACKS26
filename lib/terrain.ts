import type { TerrainProfile } from "./forecast-types";
import { solarDay, sunPhase, sunPosition, type Point } from "./solar";
export function horizonAt(profile: TerrainProfile | null | undefined, bearing: number): number | null {
  if (!profile || !profile.angles.length || !Number.isFinite(bearing)) return null;
  const n = profile.angles.length, index = ((bearing % 360 + 360) % 360) / 360 * n, a = Math.floor(index), b = (a + 1) % n;
  const left = profile.angles[a], right = profile.angles[b];
  // Never interpolate across missing coverage. Adjacent ray maximum is a
  // conservative envelope to avoid erasing a narrow ridge between bearings.
  return typeof left !== "number" || !Number.isFinite(left) || typeof right !== "number" || !Number.isFinite(right) ? null : Math.max(left, right);
}
export function terrainState(point: Point, time: number, profile?: TerrainProfile | null) {
  const p = sunPosition(point, time), phase = sunPhase(point, time), horizon = horizonAt(profile, p.bearing);
  if (phase !== "above") return { state: phase === "twilight" ? "twilight" : "night", horizon, ...p } as const;
  // Apparent solar center includes astronomical refraction exactly once.
  // Add the solar semidiameter (~0.266°); terrain rays include curvature but
  // no terrestrial refraction. Flat/negative rays use standard sunset timing.
  const blocked = horizon === null ? null : horizon > 0 && p.elevation + .266 <= horizon;
  return { state: blocked === null ? "unknown" : blocked ? "blocked" : "above", horizon, ...p } as const;
}
export function terrainEvening(point: Point, selected: number, profile?: TerrainProfile | null) {
  const d = solarDay(point, selected);
  if (!profile || !profile.angles.length || d.sunset === null) return { disappearance: null, crossings: [] as { time: number; blocked: boolean }[], complete: false, obscuredSinceNoon: false };
  const crossings: { time: number; blocked: boolean }[] = [];
  let previous: boolean | null = null, initial: boolean | null = null, priorTime = d.noon, complete = true;
  const blockedAt = (t: number) => { const p = sunPosition(point, t), h = horizonAt(profile, p.bearing); return h === null ? null : h > 0 && p.elevation + .266 <= h; };
  // Start at solar noon rather than only golden hour: tall nearby hills can
  // obscure the sun early. Scan at most two minutes apart, reducing the step
  // where necessary to traverse at most half a profile bearing bin; this also
  // detects missing rays between otherwise valid samples. Refine to five seconds.
  const nextSample = (t: number) => {
    const bearing = sunPosition(point, t).bearing;
    let next = Math.min(t + 120_000, d.sunset!);
    while (next - t > 5000 && Math.abs(((sunPosition(point, next).bearing - bearing + 540) % 360) - 180) > 180 / profile.angles.length) next = (t + next) / 2;
    return next;
  };
  for (let t = d.noon; t <= d.sunset; t = nextSample(t)) {
    const blocked = blockedAt(t);
    if (t === d.noon) initial = blocked;
    if (blocked === null) complete = false;
    if (blocked !== null && previous !== null && blocked !== previous) {
      let lo = priorTime, hi = t, covered = true;
      while (hi - lo > 5000) {
        const mid = (lo + hi) / 2, middle = blockedAt(mid);
        if (middle === null) { complete = false; covered = false; break; }
        if (middle === previous) lo = mid; else hi = mid;
      }
      if (covered) crossings.push({ time: Math.round((lo + hi) / 2), blocked });
    }
    previous = blocked; priorTime = t;
    if (t === d.sunset) break;
  }
  const last = crossings[crossings.length - 1];
  // Starting the scan already blocked does not establish when disappearance
  // happened. Never invent a crossing at the scan's solar-noon boundary.
  const disappearance = complete && previous === true && last?.blocked ? last.time : null;
  const obscuredSinceNoon = complete && initial === true && previous === true && crossings.length === 0;
  return { disappearance, crossings, complete, obscuredSinceNoon };
}
