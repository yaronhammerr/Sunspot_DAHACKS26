import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import catalog from "../data/catalog.json";
import corrections from "../data/research/coordinate-corrections.json";

const evidence = JSON.parse(readFileSync(new URL("../data/research/terrain-verification.json", import.meta.url), "utf8"));
const horizons = JSON.parse(readFileSync(new URL("../public/terrain/horizons.json", import.meta.url), "utf8"));

test("East Peak uses the sourced summit pin instead of the former hillside pin", () => {
  const correction = corrections.find(v => v.id === "mount-tamalpais")!;
  const place = catalog.viewpoints.find(v => v.id === correction.id)!;
  assert.equal(place.lat, correction.replacement.lat);
  assert.equal(place.lng, correction.replacement.lng);
  assert.ok(place.lat - correction.previous.lat > .005, "the erroneous hillside pin must not return");
  assert.match(correction.sourceUrl, /^https:\/\/carto\.nationalmap\.gov\/.+gaz_id%3D222916/);
  const feature = (correction as unknown as { evidence: { attributes: { gaz_name: string; gaz_featureclass: string }; geometry: { points: number[][] } } }).evidence;
  assert.equal(feature.attributes.gaz_name, "East Peak");
  assert.equal(feature.attributes.gaz_featureclass, "Summit");
  const [lng, lat] = feature.geometry.points[0];
  assert.ok(Math.abs(lat-place.lat) < .000001 && Math.abs(lng-place.lng) < .000001);
});

test("featured terrain profiles stay attached to the independently checked observation pins", () => {
  assert.equal(evidence.rasterSha256, horizons.rasterSha256);
  for (const point of evidence.points.filter((p: { kind: string }) => p.kind === "observer")) {
    const place = catalog.viewpoints.find(v => v.id === point.viewpointId)!;
    assert.equal(place.lat, point.lat, `${place.id}: refresh terrain evidence after changing the pin`);
    assert.equal(place.lng, point.lng);
    const profile = horizons.profiles[place.id];
    assert.ok(profile, `${place.id}: missing prepared terrain`);
    assert.equal(profile.lat, place.lat); assert.equal(profile.lng, place.lng);
    assert.ok(Math.abs(profile.elevation-point.pointElevationMeters) < .3, `${place.id}: native ground height disagrees with independent EPQS check`);
    // This is a broad gross-error check against finer source data, not an
    // accuracy guarantee: narrow summits are smoothed by this coarse raster.
    assert.ok(profile.groundSource?.sourceUrl.includes('/getSamples'), `${place.id}: missing native observer provenance`);
  }
});

test("USGS spot checks retain source resolution and raw offshore evidence", () => {
  assert.equal(evidence.points.filter((p: { kind: string }) => p.kind === "observer").length, 3);
  assert.equal(evidence.points.filter((p: { kind: string }) => p.kind === "ray").length, 3);
  for (const point of evidence.points) {
    assert.match(point.sourceUrl, /^https:\/\/epqs\.nationalmap\.gov\/v1\/json\?/);
    assert.ok(Number.isFinite(Date.parse(point.checkedAt)));
    assert.equal(point.response.location.x, point.lng);
    assert.equal(point.response.location.y, point.lat);
    if (point.pointElevationMeters !== null) {
      assert.equal(point.pointElevationMeters, Number(point.response.value));
      assert.ok(point.response.resolution > 0);
    }
  }
  const ocean = evidence.points.find((p: { key: string }) => p.key === "pacific-ocean");
  assert.ok(ocean.pointElevationMeters < 0, "retain offshore bathymetry as source evidence rather than silently rewriting the response");
  assert.match(evidence.scope, /not exhaustive validation/);
  assert.ok(evidence.limitations.some((v: string) => /standing position/.test(v)));
});
