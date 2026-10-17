import test from "node:test";
import assert from "node:assert/strict";
import { localRecommendations, mapFramePoints, mapFocusOffset, mapViewportPadding, viewpointPanOptions, visibleRecommendation } from "../lib/map-experience";
import type { Viewpoint } from "../lib/types";
const origin = { lat: 37.77, lng: -122.43 };
const spot = (id: string, lat: number): Viewpoint => ({ id, name: id, lat, lng: origin.lng, county: "Test", description: "", tags: [], photos: [], featured: null, sourceUrl: "" });

test("local recommendations preserve preference order without filling the opening map with distant picks", () => {
  const far = spot("far", 40), a = spot("a", 37.8), b = spot("b", 37.82), c = spot("c", 37.84);
  const input = [far, b, a, c];
  assert.deepEqual(localRecommendations(input, origin).map(v => v.id), [b.id, a.id, c.id]);
  assert.equal(input[0], far);
});
test("sparse areas still recommend the three nearest candidates, while respecting already-applied filters", () => {
  const spots = [spot("a", 38.5), spot("b", 39), spot("c", 39.5), spot("far", 41.9)];
  assert.deepEqual(localRecommendations(spots, origin).map(v => v.id), ["a", "b", "c"]);
  assert.deepEqual(localRecommendations(spots.slice(0, 1), origin).map(v => v.id), ["a"]);
  assert.deepEqual(localRecommendations([], origin), []);
});
test("opening frame contains the user's location and a few nearby spots, rather than the regional catalog", () => {
  const views = [spot("a", 37.8), spot("b", 37.82), spot("c", 37.84), spot("far", 41.9)];
  assert.deepEqual(mapFramePoints(views, origin), [origin, ...views.slice(0, 3).map(({ lat, lng }) => ({ lat, lng }))]);
  assert.equal(mapFramePoints(views, null).length, 3);
});
test("outside coverage opens on the user, while an explicit distant search frames the destination", () => {
  const outside = { lat: 40.7, lng: -74 };
  const views = [spot("a", 37.8)];
  assert.deepEqual(mapFramePoints(views, outside), [outside]);
  assert.deepEqual(mapFramePoints(views, outside, true), [{ lat: 37.8, lng: origin.lng }]);
  assert.deepEqual(mapFramePoints([], origin), [origin]);
  assert.deepEqual(mapFramePoints([], null), []);
});
test("category framing excludes the user's location and distant pins instead of an empty midpoint", () => {
  const coast = spot("coast", 37.1), nearby = spot("nearby", 37.2), distant = spot("distant", 40);
  assert.deepEqual(mapFramePoints([coast, nearby, distant], origin, true), [coast, nearby].map(({ lat, lng }) => ({ lat, lng })));
  assert.deepEqual(mapFramePoints([distant], origin, true), [{ lat: distant.lat, lng: distant.lng }]);
  assert.deepEqual(mapFramePoints([], origin, true), [], "empty filters must not move the user to an unrelated place");
});
test("carousel camera targets an actual visible recommendation and ignores stale category IDs", () => {
  const a = spot("a", 37.8), b = spot("b", 40), c = spot("c", 41);
  assert.equal(visibleRecommendation([a, b, c], ["b", "c"]), b);
  assert.equal(visibleRecommendation([b, c], ["old-category", "a"]), null);
  assert.equal(visibleRecommendation([a, b, c], ["c", "b"]), b);
});
test("focused pins sit between floating controls and cards, even on short screens", () => {
  assert.deepEqual(mapFocusOffset(1000, 800, { paddingTopLeft: [28, 180], paddingBottomRight: [72, 350] }), [-22, -85]);
  assert.deepEqual(mapFocusOffset(320, 240, { paddingTopLeft: [28, 180], paddingBottomRight: [72, 350] }), [-22, 0]);
  assert.deepEqual(mapFocusOffset(40, 40, { paddingTopLeft: [28, 180], paddingBottomRight: [72, 350] }), [0, 0]);
});
test("switching viewpoints uses a short pan and honors reduced motion", () => {
  const smooth = viewpointPanOptions(false), instant = viewpointPanOptions(true);
  assert.equal(smooth.animate, true);
  assert.ok(smooth.duration > 0 && smooth.duration <= .5);
  assert.equal(instant.animate, false);
  assert.equal(instant.duration, 0);
});
test("opening bounds retain usable map space when overlays exceed a short viewport", () => {
  const padding = mapViewportPadding(320, 240, { paddingTopLeft: [28, 220], paddingBottomRight: [72, 380] });
  assert.deepEqual(padding, { paddingTopLeft: [28, 80], paddingBottomRight: [72, 80] });
  assert.equal(240 - padding.paddingTopLeft[1] - padding.paddingBottomRight[1], 80);
  assert.deepEqual(mapViewportPadding(40, 40, { paddingTopLeft: [28, 220], paddingBottomRight: [72, 380] }), { paddingTopLeft: [0, 0], paddingBottomRight: [0, 0] });
});
