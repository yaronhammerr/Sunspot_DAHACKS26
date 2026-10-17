import test from "node:test";
import assert from "node:assert/strict";
import data from "../data/catalog.json";
import curated from "../data/curated-viewpoints.json";
import type { Viewpoint } from "../lib/types";
import type { VisitProfile } from "../lib/visit";
import { isFactStale } from "../lib/visit";
import { assemble, mappedViewpoint, samePlace } from "../scripts/assemble-catalog.mjs";
const catalog = data.viewpoints as Viewpoint[];
test("every known visitor fact has traceable evidence and unknowns remain null", () => {
  for (const place of catalog) {
    const profile = place.visit!;
    assert.ok(profile, place.id);
    const sourceIds = new Set(profile.sources.map(s => s.id));
    const walk = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(walk); return; }
      const obj = value as Record<string, unknown>;
      if ("status" in obj && "value" in obj) {
        if (obj.status === "unknown") { assert.equal(obj.value, null, place.id); assert.equal(obj.checkedAt, null); }
        else {
          assert.notEqual(obj.value, null, place.id);
          assert.ok(Array.isArray(obj.sourceIds) && obj.sourceIds.length > 0, place.id);
          assert.ok((obj.sourceIds as string[]).every(id => sourceIds.has(id)), place.id);
          assert.ok(Number.isFinite(Date.parse(String(obj.checkedAt))), place.id);
        }
      }
      Object.values(obj).forEach(walk);
    };
    walk(profile);
    assert.ok(profile.alertsUrl.startsWith("https://"));
    for (const route of profile.routes) {
      const steps = route.estimatedSteps;
      if (steps.value) {
        assert.equal(steps.status, "estimated");
        assert.ok(["loop", "round-trip", "one-way"].includes(route.distanceType));
        assert.ok(route.distanceMiles.value! > 0);
        assert.ok(steps.value[0] > 0 && steps.value[1] >= steps.value[0]);
      }
    }
  }
});
test("missing mapped hours are never made into 24/7 access or a route", () => {
  const row = { id: "osm-node-1", name: "Test", lat: 37.5, lng: -122.3, county: "San Mateo", region: "bay-area", osmType: "node", tags: {}, sourceUrl: "https://www.openstreetmap.org/node/1" };
  const result = mappedViewpoint(row, { retrievedAt: "2026-10-16T00:00:00Z" });
  assert.equal((result.visit as unknown as VisitProfile).hours.value, null);
  assert.equal(result.visit.rules.dogs.value, null);
  assert.equal(result.visit.routes.length, 0);
  assert.equal(result.visit.reviewStatus, "community-mapped");
});
test("duplicate matching preserves nearby distinct overlooks and rejects private records", () => {
  const base = { id: "official", name: "Battery Spencer", lat: 37.8277, lng: -122.4815, county: "Marin", visit: {} };
  const match = { ...base, id: "osm-node-1", name: "Battery Spencer Overlook", tags: {}, sourceUrl: "https://www.openstreetmap.org/node/1" };
  assert.equal(samePlace(base, match), true);
  assert.equal(samePlace(base, { ...match, name: "Hawk Hill" }), false);
  assert.equal(samePlace(base, { ...match, name: "Battery Wagner" }), false);
  assert.equal(samePlace({ ...base, name: "Unnamed mapped overlook — Marin (1)" }, { ...match, name: "Unnamed mapped overlook — Marin (2)" }), false);
  const result = assemble([base], { viewpoints: [match, { ...match, id: "private", tags: { access: "private" } }] });
  assert.equal(result.viewpoints.length, 1);
  assert.equal(result.merges.length, 1);
  assert.equal(result.viewpoints[0].id, "official");
  const enriched = { ...base, id: "osm-node-2", name: "Researched coastal name" };
  const original = { ...match, id: "osm-node-2", name: "Unnamed mapped overlook — Marin (2)" };
  assert.equal(assemble([enriched], { viewpoints: [original] }).viewpoints.length, 1, "reviewed mapped IDs cannot be duplicated by their original unnamed row");
});
test("old or unverified facts are marked for rechecking", () => {
  const now = Date.parse("2026-10-16T00:00:00Z");
  assert.equal(isFactStale({ checkedAt: "2026-10-15T00:00:00Z" }, now), false);
  assert.equal(isFactStale({ checkedAt: "2025-10-15T00:00:00Z" }, now), true);
  assert.equal(isFactStale({ checkedAt: null }, now), true);
});
test("route gain is distinct from summit elevation and conflicting numbers remain visible", () => {
  const tam = (curated as Viewpoint[]).find(v => v.id === "mount-umunhum")!;
  assert.equal(tam.visit!.elevationFeet.value, 3486);
  assert.equal(tam.visit!.routes[0].elevationGainFeet.value, null);
  const bay = (curated as Viewpoint[]).find(v => v.id === "emerald-bay-overlook")!;
  assert.equal(bay.visit!.routes[0].elevationGainFeet.status, "conflicting");
  assert.match(bay.visit!.routes[0].elevationGainFeet.note!, /500/);
});
