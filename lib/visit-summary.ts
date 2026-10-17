import type { TrailRoute, VisitProfile } from "./visit";

/** Prefer a complete itinerary. A network length is not a walking route. */
export function summaryRoute(profile: VisitProfile): TrailRoute | null {
  const reported = profile.routes.filter(route => route.distanceMiles.status === "reported" && route.distanceMiles.value !== null && Number.isFinite(route.distanceMiles.value) && route.distanceMiles.value > 0);
  return reported.find(route => ["loop", "round-trip"].includes(route.distanceType)) ?? reported.find(route => route.distanceType === "one-way") ?? null;
}

export function routeEffortSummary(profile: VisitProfile) {
  const route = summaryRoute(profile);
  if (!route) return { value: "Walking effort not confirmed", detail: "Check the listed routes before choosing a walk." };
  const type = route.distanceType === "round-trip" ? "round trip" : route.distanceType;
  const gain = route.elevationGainFeet;
  return {
    value: `${route.distanceMiles.value} mi ${type}`,
    detail: `${route.name}${gain.value !== null && Number.isFinite(gain.value) && gain.value >= 0 && ["reported", "estimated"].includes(gain.status) ? ` · ${gain.status === "estimated" ? "~" : ""}${gain.value.toLocaleString()} ft climbing` : ""}${route.distanceType === "one-way" ? " · return distance excluded" : ""}`,
  };
}
