import type { StyleSpecification } from "maplibre-gl";

const HIGHWAY_SHIELDS = new Set(["highway-shield-non-us", "highway-shield-us-interstate", "road_shield_us"]);

// The provider's road-label data can omit ref_length. A direct numeric
// comparison then throws during filter evaluation in MapLibre 6. Keep genuine
// numeric lengths unchanged; use a value outside the shield range otherwise.
function safeShieldFilter(expression: unknown): unknown {
  if (!Array.isArray(expression)) return expression;
  if (expression[0] === "<=" && expression.length === 3 && typeof expression[2] === "number"
    && Array.isArray(expression[1]) && expression[1].length === 2
    && expression[1][0] === "get" && expression[1][1] === "ref_length") {
    return ["<=", ["number", expression[1], expression[2] + 1], expression[2]];
  }
  return expression.map(safeShieldFilter);
}

export function prepareMapStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map(layer => {
      if (!HIGHWAY_SHIELDS.has(layer.id) || !("filter" in layer)) return layer;
      return { ...layer, filter: safeShieldFilter(layer.filter) as typeof layer.filter };
    }),
  };
}
