import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFERENCES, personalizedViews, readPreferences } from "../lib/preferences";
import type { Viewpoint } from "../lib/types";
const make = (id: string, lat: number, tags: string[]): Viewpoint => ({ id, name: id, lat, lng: -122, tags, county: "Test", description: "", featured: null, sourceUrl: "", photos: [] });
const origin = { lat: 37, lng: -122 };
const close = make("Close hills", 37.01, ["hills"]);
const coast = make("Far ocean", 37.3, ["ocean"]);
const distant = make("Distant ocean", 38, ["ocean"]);

test("nearby sorting keeps the closest views first even with scenery preferences", () => {
  const result = personalizedViews([distant, coast, close], { tags: ["ocean"], radius: null, priority: "nearby" }, origin);
  assert.deepEqual(result.map(v => v.id), [close.id, coast.id, distant.id]);
});
test("scenery priority ranks matches then distance and keeps other discoveries", () => {
  const result = personalizedViews([distant, close, coast], { tags: ["ocean"], radius: null, priority: "scenery" }, origin);
  assert.deepEqual(result.map(v => v.id), [coast.id, distant.id, close.id]);
});
test("radius excludes distant views and stays inactive without location", () => {
  const prefs = { ...DEFAULT_PREFERENCES, radius: 10 };
  assert.deepEqual(personalizedViews([coast, close], prefs, origin).map(v => v.id), [close.id]);
  assert.equal(personalizedViews([coast, close], prefs, null).length, 2);
  assert.equal(personalizedViews([distant], prefs, origin).length, 0);
});
test("skipping all preferences gives all views without mutating the catalog", () => {
  const input = [distant, close, coast];
  assert.equal(personalizedViews(input, DEFAULT_PREFERENCES, null).length, 3);
  assert.deepEqual(input.map(v => v.id), [distant.id, close.id, coast.id]);
});
test("saved preferences validate input and recover from corrupt storage", () => {
  assert.deepEqual(readPreferences(JSON.stringify(DEFAULT_PREFERENCES)), DEFAULT_PREFERENCES);
  for (const value of [null, "null", "broken", "{}", '{"tags":["unknown"],"radius":10,"priority":"nearby"}', '{"tags":[],"radius":-1,"priority":"nearby"}']) assert.equal(readPreferences(value), null);
});
