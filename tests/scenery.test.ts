import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../data/catalog.json";
import manifest from "../data/viewpoint-scenery.json";
import { filterScenery, SCENERY } from "../lib/discovery";
import { personalizedViews } from "../lib/preferences";
import { localRecommendations } from "../lib/map-experience";
import { applySceneryPolicy, sceneryFingerprint, SCENERY_TAGS } from "../scripts/scenery-policy.mjs";
import type { Viewpoint } from "../lib/types";

const places = catalog.viewpoints as Viewpoint[];
const place = (id: string) => places.find(v => v.id === id)!;

test("Ocean excludes inland summits and includes real coastal viewpoints", () => {
  const ids = new Set(filterScenery(places, "ocean").map(v => v.id));
  for (const id of ["borel-hill", "windy-hill", "mount-umunhum", "mount-tamalpais", "twin-peaks", "grandview-park", "mount-diablo", "skyline-ridge-lakes", "emerald-bay-overlook"]) assert.ok(!ids.has(id), id);
  for (const id of ["muir-beach-overlook", "mori-point", "lands-end", "point-reyes-lighthouse", "devils-slide"]) assert.ok(ids.has(id), id);
});

test("tidal bays, freshwater and rock arches cannot become ocean or bridge matches by name", () => {
  assert.ok(place("battery-spencer").tags.includes("bay"));
  assert.ok(!place("battery-spencer").tags.includes("ocean"));
  assert.ok(place("emerald-bay-overlook").tags.includes("water"));
  assert.ok(!place("emerald-bay-overlook").tags.includes("bay"));
  assert.ok(!place("skyline-ridge-lakes").tags.includes("skyline"));
  assert.ok(!place("osm-node-1355633590").tags.includes("bridges"));
  assert.ok(!place("osm-node-4083224634").tags.includes("water"));
});

test("strong hill preferences and a nearby inland location cannot override an Ocean chip", () => {
  const location = { lat: 37.33, lng: -122.03 };
  const result = localRecommendations(personalizedViews(filterScenery(places, "ocean"), { tags: ["hills"], radius: null, priority: "scenery" }, location), location);
  assert.ok(result.length > 0);
  assert.ok(result.every(v => v.tags.includes("ocean")));
  assert.deepEqual(filterScenery([place("borel-hill")], "ocean"), []);
  assert.deepEqual(filterScenery(places, "unsupported-scenery"), []);
});

test("every published scenery label has a current review and traceable evidence", () => {
  assert.deepEqual([...SCENERY], SCENERY_TAGS);
  const reviews = manifest.viewpoints as Record<string, { fingerprint: string; tags: string[]; sourceUrls: string[] }>;
  for (const view of places) {
    const review = reviews[view.id];
    assert.equal(review.fingerprint, sceneryFingerprint(view), view.id);
    assert.deepEqual(view.tags, review.tags, view.id);
    assert.ok(review.sourceUrls.includes(view.photos[0].sourceUrl), view.id);
    assert.ok(view.sceneryReview);
  }
  assert.equal(applySceneryPolicy(places, manifest).length, places.length);
});

test("missing or changed evidence blocks publication instead of guessing scenery", () => {
  const view = place("mori-point");
  assert.throws(() => applySceneryPolicy([view], { viewpoints: {} }), /needs review/);
  assert.throws(() => applySceneryPolicy([{ ...view, lat: view.lat + .01 }], manifest), /needs review/);
  assert.throws(() => applySceneryPolicy([{ ...view, photos: [{ ...view.photos[0], sourceUrl: "https://example.com/replaced-photo" }] }], manifest), /needs review/);
  const invalid = structuredClone(manifest) as typeof manifest & { viewpoints: Record<string, { evidence: object }> };
  invalid.viewpoints[view.id].evidence = {};
  assert.throws(() => applySceneryPolicy([view], invalid), /Missing ocean evidence/);
});
