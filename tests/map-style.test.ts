import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { StyleSpecification } from "maplibre-gl";
import fixture from "./fixtures/openfreemap-highway-shields.json";
import { prepareMapStyle } from "../lib/map-style";

// Use the expression engine paired with the installed renderer, including
// its actual type checks, rather than duplicating its comparison behavior.
const rendererRequire = createRequire(import.meta.resolve("maplibre-gl"));
const { createExpression } = await import(rendererRequire.resolve("@maplibre/maplibre-gl-style-spec"));

const original = fixture as unknown as StyleSpecification;

test("provider shield filters tolerate missing lengths without changing valid shields", () => {
  const prepared = prepareMapStyle(original);
  for (let index = 0; index < prepared.layers.length; index++) {
    const layer = prepared.layers[index];
    assert.ok("filter" in layer);
    const expression = createExpression(layer.filter, `layers[${layer.id}].filter`);
    assert.equal(expression.result, "success", JSON.stringify(expression.value));
    const raw = original.layers[index];
    assert.ok("filter" in raw);
    const originalExpression = createExpression(raw.filter, `layers[${raw.id}].filter`);
    assert.equal(originalExpression.result, "success");
    const network = layer.id === "road_shield_us" ? "us-highway" : layer.id === "highway-shield-us-interstate" ? "us-interstate" : "other";
    const evaluate = (properties: Record<string, unknown>) => expression.value.evaluateWithoutErrorHandling({ zoom: 12 }, { type: 2, properties: { network, ...properties } });
    assert.throws(() => originalExpression.value.evaluateWithoutErrorHandling({ zoom: 12 }, { type: 2, properties: { network } }), /number.*null/);
    assert.equal(evaluate({}), false, `${layer.id}: absent length`);
    assert.equal(evaluate({ ref_length: null }), false, `${layer.id}: null length`);
    assert.equal(evaluate({ ref_length: "3" }), false, `${layer.id}: nonnumeric length`);
    for (const length of [1, 3, 6, 7, 12]) {
      const properties = { network, ref_length: length };
      assert.equal(evaluate(properties), originalExpression.value.evaluateWithoutErrorHandling({ zoom: 12 }, { type: 2, properties }), `${layer.id}: length ${length}`);
    }
  }
});

test("style preparation leaves provider data and unrelated layers intact", () => {
  const copy = structuredClone(original);
  const untouched = { ...copy.layers[0], id: "unrelated-shield" };
  copy.layers.push(untouched);
  const before = structuredClone(copy);
  const prepared = prepareMapStyle(copy);
  assert.deepEqual(copy, before, "input style is not mutated");
  assert.equal(prepared.layers.at(-1), untouched, "other layers retain their original expressions");
  assert.equal(prepared.sources, copy.sources);
  assert.deepEqual(prepareMapStyle(prepared), prepared, "the compatibility patch is idempotent");
});
