import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../data/catalog.json";
import report from "../data/research/enrichment-2026-10-17.json";
import type { Viewpoint } from "../lib/types";
import { matchingHikes } from "../lib/hikes";
import { DEFAULT_PREFERENCES } from "../lib/preferences";

const places = catalog.viewpoints as Viewpoint[];
const place = (id: string) => places.find(v => v.id === id)!;
test("new coastal destinations publish only with reviewed photos and source-backed visitor facts", () => {
  for (const id of report.newViewpoints) {
    const v = place(id);
    assert.ok(v, id);
    assert.ok(v.tags.includes("ocean"), id);
    assert.ok(v.photos.length && v.photos.every(p => p.verification?.status === "verified"));
    assert.equal(v.visit!.reviewStatus, "official-source-reviewed");
    assert.ok(v.visit!.sources.some(s => s.kind === "official"));
    assert.ok(v.visit!.hours.value && v.visit!.terrain.value && v.visit!.cautions.value);
    assert.ok(v.visit!.coordinateNote.length > 30);
  }
  assert.equal(new Set(places.map(v => v.id)).size, places.length);
});
test("nearby beaches retain their distinct dog rules and conflicting hours", () => {
  assert.match(place("montara-beach").visit!.rules.dogs.value!, /six feet/);
  assert.match(place("gray-whale-cove").visit!.rules.dogs.value!, /No dogs on the beach/);
  assert.match(place("francis-beach").visit!.rules.dogs.value!, /No dogs on the beaches/);
  assert.equal(place("muir-beach-overlook").visit!.rules.dogs.value, null, "beach rules cannot be borrowed for its separate overlook");
  assert.equal(place("pacifica-beach").visit!.hours.status, "conflicting");
  assert.equal(place("pacifica-beach").visit!.hours.sourceIds.length, 2);
});
test("measured route lengths, estimated steps and unconfirmed climbing gains remain distinct", () => {
  const upper = place("point-reyes-lighthouse").visit!.routes.find(r => r.id === "upper-observation-deck-approach")!;
  assert.equal(upper.distanceType, "one-way");
  assert.equal(upper.distanceMiles.value, .45);
  const loop = place("osm-node-11061015238").visit!.routes[0];
  assert.equal(loop.distanceMiles.value, 1.7);
  assert.equal(loop.distanceType, "loop");
  assert.deepEqual(loop.estimatedSteps.value, [3230, 4420]);
  assert.equal(loop.estimatedSteps.status, "estimated");
  assert.equal(loop.elevationGainFeet.value, null, "negligible is not a measured zero-foot gain");
  const bumpass = place("bumpass-hell").visit!.routes[0];
  assert.equal(bumpass.terrain.status, "conflicting");
  assert.equal(bumpass.elevationGainFeet.value, null, "basin descent is not cumulative climbing gain");
});
test("a three-mile coastal corridor is not offered as a complete three-mile hike", () => {
  const view = place("francis-beach"), route = view.visit!.routes[0];
  assert.equal(route.distanceType, "network");
  assert.equal(route.estimatedSteps.value, null);
  assert.deepEqual(matchingHikes([{ viewpointId: view.id, route }], [view], { unit: "miles", amount: 3 }, DEFAULT_PREFERENCES, null), []);
});
