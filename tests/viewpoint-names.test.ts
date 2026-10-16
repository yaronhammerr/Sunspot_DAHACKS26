import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../data/catalog.json";
import names from "../data/viewpoint-names.json";
import { applyViewpointNames } from "../scripts/viewpoint-names.mjs";

test("published names have readable labels and traceable evidence", () => {
  for (const place of catalog.viewpoints) {
    assert.doesNotMatch(place.name, /unnamed|osm-node-|osm-way-/i, place.id);
    const label = names.viewpoints[place.id as keyof typeof names.viewpoints];
    if (!label) continue;
    assert.equal(place.name, label.name);
    assert.ok(label.sourceUrls.every(url => url.startsWith("https://")));
  }
});

test("naming keeps IDs and coordinates and yields to newly established source names", () => {
  const place = { id: "test", name: "Unnamed mapped overlook", lat: 37, lng: -122 };
  const manifest = { reviewedAt: "2026-10-16", viewpoints: { test: { name: "Ridge Trail View", kind: "nearby-feature", originalName: place.name, sourceUrls: ["https://www.openstreetmap.org/way/1"], note: "Descriptive name from the nearby trail." } } };
  const renamed = applyViewpointNames([place], manifest)[0];
  assert.equal(renamed.name, "Ridge Trail View");
  assert.equal(renamed.id, place.id);
  assert.equal(renamed.lat, place.lat);
  assert.equal(renamed.lng, place.lng);
  assert.equal(renamed.nameContext.kind, "nearby-feature");
  assert.equal(place.name, "Unnamed mapped overlook");
  assert.equal(applyViewpointNames([{ ...place, name: "New Official Name" }], manifest)[0].name, "New Official Name");
  assert.throws(() => applyViewpointNames([place], { ...manifest, viewpoints: { test: { ...manifest.viewpoints.test, sourceUrls: [] } } }));
});
