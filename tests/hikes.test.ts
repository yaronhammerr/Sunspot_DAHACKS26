import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../data/catalog.json";
import type { Viewpoint } from "../lib/types";
import { matchingHikes, type HikeRoute } from "../lib/hikes";
import { DEFAULT_PREFERENCES } from "../lib/preferences";
import { handleApi } from "../lib/server";

const places = catalog.viewpoints as Viewpoint[];
const routes: HikeRoute[] = places.flatMap(v => (v.visit?.routes ?? []).map(route => ({ viewpointId: v.id, route })));
test("hiking budgets use complete sourced itineraries and conservative step estimates", () => {
  const matches = matchingHikes(routes, places, { unit: "miles", amount: 5 }, DEFAULT_PREFERENCES, { lat: 37.77, lng: -122.43 });
  assert.ok(matches.length > 5);
  for (const match of matches) {
    assert.ok(["loop", "round-trip"].includes(match.route.distanceType));
    assert.ok(match.miles > 0 && match.miles <= 5);
    assert.equal(match.route.distanceMiles.status, "reported");
  }
  assert.ok(matches.every((m, i) => i === 0 || m.away! >= matches[i - 1].away!));
  const stepMatches = matchingHikes(routes, places, { unit: "steps", amount: 5000 }, DEFAULT_PREFERENCES, null);
  assert.ok(stepMatches.length > 0);
  assert.ok(stepMatches.every(m => m.steps[1] <= 5000));
  assert.equal(matchingHikes(routes, places, { unit: "miles", amount: NaN }, DEFAULT_PREFERENCES, null).length, 0);
});
test("hike matching respects scenery, availability in current results, and radius", () => {
  const pref = { ...DEFAULT_PREFERENCES, tags: ["bay"], radius: 25 };
  const current = places.filter(v => v.tags.includes("bay")), location = { lat: 37.3650312, lng: -122.2460311 };
  const matches = matchingHikes(routes, current, { unit: "miles", amount: 50 }, pref, location);
  // Coyote Hills has a reported, complete Bayview Trail itinerary; it does not
  // depend on inland summit records being mislabeled as ocean viewpoints.
  assert.ok(matches.some(m => m.viewpointId === "coyote-hills" && m.route.name === "Bayview Trail"));
  assert.ok(matches.every(m => m.viewpoint.tags.includes("bay") && m.away! <= 25 && current.some(v => v.id === m.viewpointId)));
  const unrestricted = matchingHikes(routes, current, { unit: "miles", amount: 50 }, { ...pref, radius: null }, location);
  assert.ok(unrestricted.some(m => m.away! > 25));
  const removed = matchingHikes(routes, current.filter(v => v.id !== "coyote-hills"), { unit: "miles", amount: 50 }, pref, location);
  assert.ok(!removed.some(m => m.viewpointId === "coyote-hills"));
  const inland = places.filter(v => ["windy-hill", "mission-peak", "hunters-point"].includes(v.id));
  assert.equal(inland.length, 3);
  assert.ok(inland.every(v => !v.tags.includes("ocean")));
  assert.deepEqual(matchingHikes(routes, inland, { unit: "miles", amount: 50 }, { ...DEFAULT_PREFERENCES, tags: ["ocean"] }, null), []);
});
test("hiking endpoint excludes unknown, network and one-way distances", async () => {
  const response = handleApi(new Request("http://localhost/api/hikes"));
  assert.equal(response.status, 200);
  const data = await response.json() as { routes: HikeRoute[] };
  assert.ok(data.routes.length > 10);
  assert.ok(data.routes.every(r => ["loop", "round-trip"].includes(r.route.distanceType) && r.route.distanceMiles.status === "reported"));
});
