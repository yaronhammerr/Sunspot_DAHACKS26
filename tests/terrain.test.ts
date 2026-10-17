import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import catalog from "../data/catalog.json";
import type { TerrainData, TerrainProfile } from "../lib/forecast-types";
import { fromPacific, solarDay, sunPosition } from "../lib/solar";
import { horizonAt, terrainEvening, terrainState } from "../lib/terrain";
const sf = { lat: 37.7749, lng: -122.4194 }, date = fromPacific("2026-06-21T16:00")!;
const profile = (h: number): TerrainProfile => ({ elevation: 100, angles: Array(360).fill(h), coverage: "complete", validFraction: 1 });
test("flat, ridge, missing and below-horizon states remain separate", () => {
  const d = solarDay(sf, date), t = d.sunset! - 30 * 60_000;
  assert.equal(terrainState(sf, t, profile(0)).state, "above");
  assert.equal(terrainState(sf, t, profile(20)).state, "blocked");
  assert.equal(terrainState(sf, t, null).state, "unknown");
  assert.equal(terrainState(sf, d.sunset! + 60_000, profile(90)).state, "twilight");
  assert.equal(terrainEvening(sf, date, profile(0)).disappearance, null);
  const ridge = terrainEvening(sf, date, profile(10));
  assert.ok(ridge.complete && ridge.disappearance! < d.sunset! - 30 * 60_000);
  const partial = profile(0); partial.angles[270] = null;
  assert.equal(horizonAt(partial, 269.5), null);
  assert.equal(horizonAt(partial, 270), null);
  assert.equal(terrainEvening(sf, date, null).complete, false);
});
test("late afternoon ridge gaps can disappear, reappear then disappear again", () => {
  const gap = profile(12);
  // At 289° the June sun is still above 14°, so a gap there would open
  // before this 12° ridge ever obscured it. At 294–297° it is below the ridge.
  for (let bearing = 294; bearing <= 297; bearing++) gap.angles[bearing] = 0;
  assert.equal(terrainState(sf, fromPacific("2026-06-21T19:35")!, gap).state, "blocked");
  assert.equal(terrainState(sf, fromPacific("2026-06-21T19:55")!, gap).state, "above");
  assert.equal(terrainState(sf, fromPacific("2026-06-21T20:15")!, gap).state, "blocked");
  const evening = terrainEvening(sf, date, gap);
  assert.equal(evening.complete, true);
  assert.deepEqual(evening.crossings.map(c => c.blocked), [true, false, true]);
  assert.equal(evening.disappearance, evening.crossings.at(-1)!.time);
  for (const crossing of evening.crossings) {
    assert.equal(terrainState(sf, crossing.time - 10_000, gap).state, crossing.blocked ? "above" : "blocked");
    assert.equal(terrainState(sf, crossing.time + 10_000, gap).state, crossing.blocked ? "blocked" : "above");
  }
  assert.ok(evening.disappearance! < solarDay(sf, date).sunset!);
});
test("missing afternoon rays prevent a final disappearance claim even when sunset rays are valid", () => {
  const partial = profile(10);
  partial.angles[270] = null;
  const evening = terrainEvening(sf, date, partial);
  assert.equal(evening.complete, false);
  assert.equal(evening.disappearance, null);
  // Missing northern data does not invalidate a fully covered afternoon arc.
  const northernGap = profile(10);
  northernGap.angles[0] = null;
  assert.equal(terrainEvening(sf, date, northernGap).complete, true);
});
test("fine profile bins cannot hide missing coverage between the original two-minute samples", () => {
  const fine: TerrainProfile = { ...profile(0), angles: Array(3600).fill(10) };
  const d = solarDay(sf, date);
  // A missing 0.1° ray halfway between noon and the first original sample.
  fine.angles[Math.floor(sunPosition(sf, d.noon + 60_000).bearing * 10)] = null;
  const evening = terrainEvening(sf, date, fine);
  assert.equal(evening.complete, false);
  assert.equal(evening.disappearance, null);
});
test("an obstruction already present at solar noon never fabricates a noon disappearance", () => {
  const evening = terrainEvening(sf, date, profile(89));
  assert.equal(evening.complete, true);
  assert.equal(evening.obscuredSinceNoon, true);
  assert.equal(evening.disappearance, null);
  assert.deepEqual(evening.crossings, []);
  // An early obstruction followed by an afternoon gap is different: the final
  // later ridge crossing remains a valid disappearance estimate.
  const gap = profile(89);
  for (let bearing = 294; bearing <= 297; bearing++) gap.angles[bearing] = 0;
  const reappeared = terrainEvening(sf, date, gap);
  assert.deepEqual(reappeared.crossings.map(c => c.blocked), [false, true]);
  assert.equal(reappeared.obscuredSinceNoon, false);
  assert.equal(reappeared.disappearance, reappeared.crossings.at(-1)!.time);
});
test("invalid horizon values and empty profiles remain unavailable", () => {
  const invalid = profile(0);
  invalid.angles[270] = NaN;
  assert.equal(horizonAt(invalid, 270), null);
  assert.equal(horizonAt(profile(0), NaN), null);
  assert.equal(terrainEvening(sf, date, { ...profile(0), angles: [] }).complete, false);
});
test("generated terrain reports every catalog ID and never hides missing rays", () => {
  const data = JSON.parse(readFileSync("public/terrain/horizons.json", "utf8")) as TerrainData;
  assert.equal(Object.keys(data.profiles).length + Object.keys(data.unavailable).length, catalog.viewpoints.length);
  assert.ok(data.source.includes("3DEPElevation")); assert.equal(data.observerHeightMeters, 1.7);
  assert.equal(data.maxDistanceMeters, 60000);
  for (const v of catalog.viewpoints) {
    const p = data.profiles[v.id];
    assert.ok(p || data.unavailable[v.id]);
    if (!p) continue;
    assert.equal(p.angles.length, 360 / data.bearingStep);
    assert.ok(p.angles.every(a => a === null || Number.isFinite(a) && a >= -90 && a <= 90));
    assert.equal(p.coverage === "complete", p.angles.every(a => a !== null));
    if (p.coverage === "complete") assert.ok(Number.isFinite(horizonAt(p, sunPosition(v, date).bearing)));
  }
});
