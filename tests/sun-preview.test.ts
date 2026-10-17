import test from "node:test";
import assert from "node:assert/strict";
import type { Viewpoint } from "../lib/types";
import { mapSunLayout, sunBadgeAnchor, sunPreviewViewpoint } from "../lib/sun-preview";
import { mapPreviewPlacement } from "../lib/map-preview";

const places = [{ id: "selected" }, { id: "hovered" }, { id: "card" }] as Viewpoint[];
test("map hover previews the pointed viewpoint without replacing an explicit selection", () => {
  assert.equal(sunPreviewViewpoint(places, null, "hovered", "card")?.id, "hovered");
  assert.equal(sunPreviewViewpoint(places, "selected", "hovered", "card")?.id, "selected");
  assert.equal(sunPreviewViewpoint(places, null, null, "card")?.id, "card");
});
test("hover previews ignore removed pins and disappear when no viewpoint is active", () => {
  assert.equal(sunPreviewViewpoint(places, null, "removed-by-filter", "card")?.id, "card");
  assert.equal(sunPreviewViewpoint(places, null, null, null), null);
  assert.equal(sunPreviewViewpoint([], "selected", "hovered", "card"), null);
});
test("direction pills stay within the map at every edge on desktop and phones", () => {
  for (const [width, height] of [[1440, 900], [393, 852], [320, 480]]) {
    for (const [x, y] of [[-100, -100], [width + 100, height + 100], [width / 2, height / 2]]) {
      const p = sunBadgeAnchor(x, y, width, height, 220);
      assert.ok(p.x - 110 >= 0 && p.x + 110 <= width);
      assert.ok(p.y >= 32 && p.y <= height - 12);
    }
  }
});

test("hovered and pinned previews avoid the sun and bearing label across all directions and viewport edges", () => {
  for (const [width, height] of [[1440, 900], [393, 852], [320, 480], [852, 393], [568, 320]]) {
    const cardWidth = Math.min(310, width - 24);
    for (const x of [2, width / 2, width - 2]) for (const y of [20, height / 2, height - 20]) {
      for (let bearing = 0; bearing < 360; bearing += 5) for (const naturalHeight of [130, 210, 350]) {
        const sun = mapSunLayout({ x, y }, bearing, width, height, 220, 34);
        const card = mapPreviewPlacement(x, y, width, height, cardWidth, naturalHeight, sun.avoid);
        const h = Math.min(naturalHeight, card.maxHeight);
        const left = card.x - cardWidth / 2, top = card.below ? card.y : card.y - h;
        const overlapWidth = Math.min(left + cardWidth, sun.avoid.right) - Math.max(left, sun.avoid.left);
        const overlapHeight = Math.min(top + h, sun.avoid.bottom) - Math.max(top, sun.avoid.top);
        assert.ok(overlapWidth < .02 || overlapHeight < .02, `${width}×${height}, pin ${x},${y}, bearing ${bearing}, card ${naturalHeight}`);
        assert.ok(left >= 11.99 && left + cardWidth <= width - 11.99);
        assert.ok(top >= 11.99 && top + h <= height - 11.99);
        assert.ok(x <= left - 17.99 || x >= left + cardWidth + 17.99 || y <= top - 17.99 || y >= top + h + 17.99, "the preview must also leave the map pin visible");
        assert.ok(Math.abs(card.x + card.tip - x) < 1e-9, "card tip retains the pin's horizontal position within floating-point precision");
      }
    }
  }
});

test("preview avoidance preserves the true sun bearing instead of rotating the direction graphic", () => {
  const origin = { x: 196, y: 300 };
  for (let bearing = 0; bearing < 360; bearing += 5) {
    const sun = mapSunLayout(origin, bearing, 393, 600);
    const measured = (Math.atan2(sun.end.x - origin.x, origin.y - sun.end.y) * 180 / Math.PI + 360) % 360;
    const error = Math.min(Math.abs(measured - bearing), 360 - Math.abs(measured - bearing));
    assert.ok(error < 1e-9);
    mapPreviewPlacement(origin.x, origin.y, 393, 600, 310, 210, sun.avoid);
    assert.equal(sun.end.x, origin.x + Math.sin(bearing * Math.PI / 180) * Math.min(130, 393 * .24));
  }
});

test("northern sunlight moves the card below the pin, while southern sunlight leaves it above", () => {
  const origin = { x: 600, y: 450 };
  const north = mapSunLayout(origin, 0, 1200, 900), south = mapSunLayout(origin, 180, 1200, 900);
  assert.equal(mapPreviewPlacement(origin.x, origin.y, 1200, 900, 310, 150, north.avoid).below, true);
  assert.equal(mapPreviewPlacement(origin.x, origin.y, 1200, 900, 310, 150, south.avoid).below, false);
});
