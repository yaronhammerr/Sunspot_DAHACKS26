import test from "node:test";
import assert from "node:assert/strict";
import { findDeviceLocation, LocationError } from "../lib/location";

function mockGeo(results: (number | { lat: number; lng: number })[]) {
  const options: PositionOptions[] = [];
  const geo: Pick<Geolocation, "getCurrentPosition"> = { getCurrentPosition(success, failure, setting) {
    options.push(setting!);
    const result = results.shift();
    if (typeof result === "number") failure!({ code: result } as GeolocationPositionError);
    else if (result) success({ coords: { latitude: result.lat, longitude: result.lng } } as GeolocationPosition);
    else assert.fail("Unexpected extra location request");
  } };
  return { geo, options };
}
const point = { lat: 37.323, lng: -122.0322 };
test("successful device location resolves coordinates with no extra request", async () => {
  const { geo, options } = mockGeo([point]);
  assert.deepEqual(await findDeviceLocation(geo, true), point);
  assert.equal(options.length, 1);
});
for (const code of [2, 3]) test(`provider error ${code} retries a fresh high-accuracy fix`, async () => {
  const { geo, options } = mockGeo([code, point]);
  let retries = 0;
  assert.deepEqual(await findDeviceLocation(geo, true, () => retries++), point);
  assert.equal(retries, 1);
  assert.equal(options[1].enableHighAccuracy, true);
  assert.equal(options[1].maximumAge, 0);
  assert.equal(options[1].timeout, 20000);
});
test("blocked permission is actionable and never retried", async () => {
  const { geo, options } = mockGeo([1]);
  await assert.rejects(findDeviceLocation(geo, true), (e: unknown) => e instanceof LocationError && e.reason === "permission" && e.message.includes("site settings"));
  assert.equal(options.length, 1);
});
test("unavailable and timeout failures remain distinct after retry", async () => {
  for (const [code, reason] of [[2, "unavailable"], [3, "timeout"]] as const) {
    const { geo } = mockGeo([code, code]);
    await assert.rejects(findDeviceLocation(geo, true), (e: unknown) => e instanceof LocationError && e.reason === reason && e.message.includes("city"));
  }
});
test("insecure and unsupported environments fail without a device request", async () => {
  const { geo, options } = mockGeo([]);
  await assert.rejects(findDeviceLocation(geo, false), { reason: "insecure" });
  await assert.rejects(findDeviceLocation(undefined, true), { reason: "unsupported" });
  assert.equal(options.length, 0);
});
test("invalid coordinates are rejected and retried instead of used for distances", async () => {
  const { geo } = mockGeo([{ lat: NaN, lng: 0 }, point]);
  assert.deepEqual(await findDeviceLocation(geo, true), point);
});
test("synchronous browser security exceptions release the request", async () => {
  const geo = { getCurrentPosition() { throw new DOMException("Blocked", "SecurityError"); } };
  await assert.rejects(findDeviceLocation(geo, true), { reason: "permission" });
});
test("silent providers time out, retry, and eventually release the UI", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const pending = findDeviceLocation({ getCurrentPosition() { calls++; } }, true);
  const assertion = assert.rejects(pending, { reason: "timeout" });
  context.mock.timers.tick(9000);
  await Promise.resolve();
  assert.equal(calls, 2);
  context.mock.timers.tick(21000);
  await assertion;
});
