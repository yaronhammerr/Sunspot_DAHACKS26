import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Viewpoint } from "../lib/types";
import type { TrailRoute, VisitProfile } from "../lib/visit";
import { DEFAULT_PREFERENCES } from "../lib/preferences";
import { recommendationReasons } from "../lib/recommendation-reasons";
import { routeEffortSummary, summaryRoute } from "../lib/visit-summary";
import { compassWords, sunArrowHead, sunDirectionCopy } from "../lib/sun-copy";

const point = { lat: 37.77, lng: -122.43 };
const spot = (id: string, lat: number, tags: string[]): Viewpoint => ({ id, name: id, lat, lng: point.lng, tags, county: "Test", featured: null, description: "", photos: [], sourceUrl: "" });
test("recommendation reasons follow actual scenery preferences and nearby candidates", () => {
  const places = [spot("near", 37.78, ["hills"]), spot("b", 37.79, []), spot("c", 37.8, []), spot("ocean", 38.1, ["ocean"])];
  const prefs = { ...DEFAULT_PREFERENCES, tags: ["ocean"], priority: "scenery" as const };
  const reasons = recommendationReasons(places, prefs, point);
  assert.equal(reasons.ocean, "Matches your ocean preference");
  assert.equal(reasons.near, "One of your closest matches");
  assert.equal(recommendationReasons(places, DEFAULT_PREFERENCES, null, "hills").near, "hills scenery you selected");
  assert.equal(recommendationReasons([spot("coast", 37.78, ["hills", "ocean"])], { ...prefs, tags: ["hills"] }, point, "ocean").coast, "ocean scenery you selected");
  assert.deepEqual(places.map(v => v.id), ["near", "b", "c", "ocean"]);
});
test("recommendations never imply proximity outside coverage, a walking budget or a weather ranking", () => {
  const places = [spot("far", 41, ["ocean"]), { ...spot("featured", 42, []), featured: 1 }];
  const reasons = recommendationReasons(places, DEFAULT_PREFERENCES, point);
  assert.equal(reasons.far, "Another view to explore");
  assert.equal(reasons.featured, "A featured viewpoint");
  assert.ok(!Object.values(reasons).join(" ").match(/closest|walking|weather|sunset|safe/i));
});

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as { viewpoints: Viewpoint[] };
const base = catalog.viewpoints.find(v => v.visit?.routes.length)!.visit!;
const route = base.routes[0];
const sampleRoute = (type: TrailRoute["distanceType"], distance: number | null, status: TrailRoute["distanceMiles"]["status"] = "reported"): TrailRoute => ({ ...route, distanceType: type, distanceMiles: { ...route.distanceMiles, value: distance, status }, elevationGainFeet: { ...route.elevationGainFeet, value: null } });
const profile = (...routes: TrailRoute[]): VisitProfile => ({ ...base, routes });
test("visit summaries prefer complete walking itineraries and never call a network length a route", () => {
  const p = profile(sampleRoute("network", 10), sampleRoute("one-way", 1), sampleRoute("loop", 2));
  assert.equal(summaryRoute(p)?.distanceType, "loop");
  assert.equal(routeEffortSummary(p).value, "2 mi loop");
  assert.equal(routeEffortSummary(profile(sampleRoute("network", .7))).value, "Walking effort not confirmed");
  assert.equal(routeEffortSummary(profile(sampleRoute("loop", null))).value, "Walking effort not confirmed");
  assert.equal(routeEffortSummary(profile(sampleRoute("loop", 3, "conflicting"))).value, "Walking effort not confirmed");
});
test("one-way distances exclude the return, and point elevation never becomes climbing gain", () => {
  const p = profile(sampleRoute("one-way", 1.5));
  p.elevationFeet = { ...base.elevationFeet, value: 2500 };
  const summary = routeEffortSummary(p);
  assert.equal(summary.value, "1.5 mi one-way");
  assert.match(summary.detail, /return distance excluded/);
  assert.ok(!summary.detail.includes("2500") && !summary.detail.includes("climbing"));
});
test("sun directions use plain compass words and never instruct users to face a sun below the horizon", () => {
  assert.equal(compassWords(270), "west");
  assert.equal(compassWords(-90), "west");
  assert.equal(sunDirectionCopy(270, "above"), "Face west");
  assert.equal(sunDirectionCopy(270, "blocked"), "Face west");
  assert.equal(sunDirectionCopy(270, "night"), "Below the horizon");
  assert.equal(sunDirectionCopy(270, "twilight"), "Below the horizon");
});
test("the map arrow points toward the sun in every compass direction, including zero-length layouts", () => {
  for (let angle = 0; angle < 360; angle += 22.5) {
    const r = angle * Math.PI / 180, end = { x: Math.sin(r) * 130, y: -Math.cos(r) * 130 };
    const { tip, left, right } = sunArrowHead({ x: 0, y: 0 }, end);
    const dx = tip.x - (left.x + right.x) / 2, dy = tip.y - (left.y + right.y) / 2;
    assert.ok(dx * end.x + dy * end.y > 0);
  }
  assert.ok(Object.values(sunArrowHead({ x: 0, y: 0 }, { x: 0, y: 0 })).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});
