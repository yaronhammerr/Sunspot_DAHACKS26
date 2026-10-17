import test from "node:test";
import assert from "node:assert/strict";
import references from "./fixtures/usno-solar.json";
import positions from "./fixtures/usno-position.json";
import { compass, destination, fromPacific, HOUR, pacificDate, pacificInput, pacificOffset, solarDay, sunPhase, sunPosition } from "../lib/solar";
const sf = { lat: 37.7749, lng: -122.4194 };
test("Bay Area events agree with independently retrieved USNO reference times", () => {
  for (const r of references) {
    const day = solarDay(r, fromPacific(`${r.date}T23:45`)!);
    const data = r.response.properties.data.sundata;
    for (const [key, phen] of [["sunrise", "Rise"], ["sunset", "Set"], ["dawn", "Begin Civil Twilight"], ["dusk", "End Civil Twilight"]] as const) {
      const expected = fromPacific(`${r.date}T${data.find(d => d.phen === phen)!.time}`)!;
      assert.ok(Math.abs(day[key]! - expected) < 90_000, `${r.name} ${key} within 90 seconds of USNO rounded minutes`);
    }
    assert.equal(day.date, r.date);
    assert.ok(day.sunrise! < day.noon && day.noon < day.goldenStart! && day.goldenStart! < day.sunset! && day.sunset! < day.dusk!);
  }
});
test("true-north degree bearings and apparent altitude agree with independent USNO positions", () => {
  for (const r of positions) {
    assert.equal(r.sun.length, 1);
    const ref = r.sun[0], p = sunPosition(r, Date.parse(r.instant));
    assert.ok(Math.abs(p.bearing - ref.almanac_data.zn) < .15);
    // USNO hc is geocentric geometric altitude. Its refraction correction is
    // negative when reducing an observed altitude; invert it for apparent h.
    assert.ok(Math.abs(p.elevation - (ref.almanac_data.hc - ref.altitude_corrections.refr)) < .15);
  }
  assert.equal(compass(258), "WSW"); assert.equal(compass(360), "N");
  const west = destination(sf, 270, 1000); assert.ok(west.lng < sf.lng && Math.abs(west.lat - sf.lat) < .001);
});
test("Pacific DST gaps, folds, midnight and event dates stay explicit", () => {
  assert.equal(fromPacific("2026-03-08T02:30"), null);
  assert.equal(fromPacific("2026-02-30T12:00"), null);
  assert.equal(pacificOffset(fromPacific("2026-03-08T01:30")!), -480);
  assert.equal(pacificOffset(fromPacific("2026-03-08T03:30")!), -420);
  const fold = fromPacific("2026-11-01T01:30")!;
  assert.equal(pacificInput(fold + HOUR), "2026-11-01T01:30");
  assert.equal(pacificOffset(fold), -420); assert.equal(pacificOffset(fold + HOUR), -480);
  const evening = fromPacific("2026-06-21T23:59")!, d = solarDay(sf, evening);
  assert.ok(d.sunset! < evening); assert.equal(pacificDate(d.sunset!), "2026-06-21");
  assert.equal(sunPhase(sf, evening), "night"); assert.equal(sunPhase(sf, d.sunset! + 60_000), "twilight");
  assert.equal(solarDay(sf, fromPacific("2026-06-22T00:01")!).date, "2026-06-22");
});
