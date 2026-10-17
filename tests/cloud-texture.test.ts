import test from "node:test";
import assert from "node:assert/strict";
import { cloudCoverAt, cloudField, cloudRasterSize, renderCloudTexture } from "../lib/cloud-texture";

const field = (cover: number | null) => cloudField([0, 1, 2].flatMap(y => [0, 1, 2].map(x => ({ x, y, cover }))));
const raster = (cover: number | null, left = .4) => renderCloudTexture({ width: 120, height: 80, left, top: .4, worldPerPixel: .002, field: field(cover) });
const alphas = (data: Uint8ClampedArray) => data.filter((_, i) => i % 4 === 3);

test("clear and missing forecasts remain transparent; increased cover adds soft, translucent cloud texture", () => {
  assert.ok(alphas(raster(0)).every(a => a === 0));
  assert.ok(alphas(raster(null)).every(a => a === 0));
  const medium = alphas(raster(50)), overcast = alphas(raster(100));
  assert.ok(medium.some(a => a === 0) && medium.some(a => a > 30), "clouds have clear gaps and billows");
  assert.ok(new Set(medium).size > 70, "cloud edges are feathered rather than flat rectangles");
  assert.ok(overcast.every((a, i) => a >= medium[i]));
  assert.ok(overcast.every(a => a < 255), "even full cover retains map visibility before the opacity control");
});
test("cloud contours stay attached to map coordinates while panning", () => {
  const first = raster(75), shifted = raster(75, .4 + .002 * 10);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 110; x++) {
    const a = (y * 120 + x + 10) * 4, b = (y * 120 + x) * 4;
    assert.deepEqual(first.slice(a, a + 4), shifted.slice(b, b + 4));
  }
});
test("regional samples blend continuously and fade at coverage edges without filling missing observations", () => {
  const grid = cloudField([0, 1, 2].flatMap(y => [0, 1, 2].map(x => ({ x, y, cover: x === 1 && y === 1 ? null : x * 50 }))));
  assert.equal(cloudCoverAt(grid, 1, 1), 0);
  assert.equal(cloudCoverAt(grid, -1, 1), 0);
  assert.equal(cloudCoverAt(grid, 3, 1), 0);
  assert.ok(Math.abs(cloudCoverAt(grid, 1 - 1e-6, .5) - cloudCoverAt(grid, 1 + 1e-6, .5)) < .00001);
  assert.ok(cloudCoverAt(grid, 2.4, .5) < cloudCoverAt(grid, 2.1, .5));
  assert.equal(cloudCoverAt(cloudField([]), 0, 0), 0);
});
test("cloud raster workload stays bounded on phones and high-resolution displays", () => {
  for (const [w, h] of [[393, 852], [1440, 900], [3840, 2160], [100, 5000]]) {
    const size = cloudRasterSize(w, h);
    assert.ok(size.width <= 320 && size.width * size.height < 66_000);
    assert.ok(size.width > 0 && size.height > 0);
  }
});
