import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_MAP_PREVIEW, mapPreviewPlacement, mapPreviewReducer, mapPreviewZoom, restoreMapPreviewCamera } from "../lib/map-preview";

const originalView = { lat: 37.77, lng: -122.43, zoom: 12.5 };

test("hovering is temporary; clicking retains the preview after leaving the pin", () => {
  let state = mapPreviewReducer(EMPTY_MAP_PREVIEW, { type: "hover", id: "a" });
  state = mapPreviewReducer(state, { type: "pin", id: "a", view: originalView });
  state = mapPreviewReducer(state, { type: "leave", id: "a" });
  assert.equal(state.pinnedId, "a");
  state = mapPreviewReducer(state, { type: "hover", id: "b" });
  assert.equal(state.hoveredId, "b");
  assert.equal(state.pinnedId, "a");
  state = mapPreviewReducer(state, { type: "leave", id: "b" });
  assert.equal(state.hoveredId, null);
  assert.equal(state.pinnedId, "a");
  assert.deepEqual(mapPreviewReducer(state, { type: "close" }), EMPTY_MAP_PREVIEW);
});
test("late pointer exits and catalog updates preserve the current valid preview", () => {
  let state = mapPreviewReducer({ hoveredId: "b", pinnedId: "a", returnView: originalView }, { type: "leave", id: "a" });
  assert.equal(state.hoveredId, "b");
  state = mapPreviewReducer(state, { type: "reconcile", ids: ["a", "b"] });
  assert.deepEqual(state, { hoveredId: "b", pinnedId: "a", returnView: originalView });
  state = mapPreviewReducer(state, { type: "reconcile", ids: ["b"] });
  assert.deepEqual(state, { hoveredId: "b", pinnedId: null, returnView: null });
  assert.deepEqual(mapPreviewReducer(state, { type: "reconcile", ids: [] }), EMPTY_MAP_PREVIEW);
});
test("clicking a selected dot again deselects it and releases the saved camera", () => {
  let state = mapPreviewReducer(EMPTY_MAP_PREVIEW, { type: "pin", id: "a", view: originalView });
  assert.deepEqual(state.returnView, originalView);
  const restore = state.returnView;
  state = mapPreviewReducer(state, { type: "pin", id: "a", view: { lat: 38, lng: -122, zoom: 13.25 } });
  assert.deepEqual(state, EMPTY_MAP_PREVIEW);
  assert.deepEqual(restore, originalView);
});
test("switching pins retains the camera from before the first selection, and closing clears it", () => {
  let state = mapPreviewReducer(EMPTY_MAP_PREVIEW, { type: "pin", id: "a", view: originalView });
  state = mapPreviewReducer(state, { type: "pin", id: "b", view: { lat: 38, lng: -122, zoom: 13.25 } });
  assert.equal(state.pinnedId, "b");
  assert.deepEqual(state.returnView, originalView);
  state = mapPreviewReducer(state, { type: "close" });
  assert.deepEqual(state, EMPTY_MAP_PREVIEW);
  const nextView = { lat: 39, lng: -123, zoom: 11 };
  assert.deepEqual(mapPreviewReducer(state, { type: "pin", id: "c", view: nextView }).returnView, nextView);
});
test("deselection stops the current flight and restores exact center and zoom, respecting reduced motion", () => {
  for (const reduced of [false, true]) for (const zoom of [originalView.zoom, 13.25]) {
    const calls: unknown[][] = [];
    const map = {
      stop: () => calls.push(["stop"]), getZoom: () => zoom,
      panTo: (...args: unknown[]) => calls.push(["panTo", ...args]),
      flyTo: (...args: unknown[]) => calls.push(["flyTo", ...args]),
    } as unknown as Parameters<typeof restoreMapPreviewCamera>[0];
    restoreMapPreviewCamera(map, originalView, reduced);
    assert.deepEqual(calls[0], ["stop"]);
    const move = calls[1];
    assert.deepEqual(move[1], [originalView.lat, originalView.lng]);
    if (zoom === originalView.zoom) assert.equal(move[0], "panTo");
    else { assert.equal(move[0], "flyTo"); assert.equal(move[2], originalView.zoom); }
    const options = move.at(-1) as { animate: boolean; duration: number };
    assert.equal(options.animate, !reduced);
    assert.ok(options.duration <= .5);
  }
});
test("pin selection makes a small zoom without backing away at high zoom levels", () => {
  assert.equal(mapPreviewZoom(12.5), 13.25);
  assert.equal(mapPreviewZoom(15.75), 16);
  assert.equal(mapPreviewZoom(18), 18);
  assert.equal(mapPreviewZoom(12.5, 13), 13);
});
test("preview cards stay inside narrow screens and flip below pins near the top", () => {
  for (const [width, height] of [[1440, 900], [393, 852], [320, 480]]) {
    const cardWidth = Math.min(310, width - 24);
    for (const x of [2, width / 2, width - 2]) {
      const p = mapPreviewPlacement(x, 300, width, height, cardWidth, 130);
      assert.ok(p.x - cardWidth / 2 >= 0 && p.x + cardWidth / 2 <= width);
      assert.equal(p.x + p.tip, x);
      assert.equal(p.below, false);
      assert.equal(p.visible, true);
    }
    assert.equal(mapPreviewPlacement(100, 20, width, height, cardWidth, 130).below, true);
    assert.equal(mapPreviewPlacement(-10, 300, width, height, cardWidth, 130).visible, false);
  }
});
