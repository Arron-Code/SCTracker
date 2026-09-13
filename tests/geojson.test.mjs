import test from "node:test";
import assert from "node:assert/strict";

import { parseGeoJson, validateGeometry } from "../src/geojson.mjs";

test("accepts Point, Polygon, and MultiPolygon geometries", () => {
  const point = { type: "Point", coordinates: [36.82, 7.67] };
  const polygon = {
    type: "Polygon",
    coordinates: [[[36, 7], [37, 7], [37, 8], [36, 7]]],
  };
  const multiPolygon = {
    type: "MultiPolygon",
    coordinates: [[[[36, 7], [37, 7], [37, 8], [36, 7]]]],
  };

  assert.equal(validateGeometry(point), point);
  assert.equal(validateGeometry(polygon), polygon);
  assert.equal(validateGeometry(multiPolygon), multiPolygon);
});

test("normalizes geometry and FeatureCollection imports to features", () => {
  assert.deepEqual(parseGeoJson('{"type":"Point","coordinates":[36.82,7.67]}'), [
    {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [36.82, 7.67] },
    },
  ]);

  const features = parseGeoJson({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { name: "Jimma 1" },
      geometry: { type: "Point", coordinates: [36.82, 7.67] },
    }],
  });
  assert.equal(features[0].properties.name, "Jimma 1");
});

test("rejects unsupported, out-of-range, and unclosed geometries", () => {
  assert.throws(
    () => validateGeometry({ type: "LineString", coordinates: [] }),
    /Point, Polygon, or MultiPolygon/,
  );
  assert.throws(
    () => validateGeometry({ type: "Point", coordinates: [200, 7] }),
    /longitude\/latitude/,
  );
  assert.throws(
    () => validateGeometry({
      type: "Polygon",
      coordinates: [[[36, 7], [37, 7], [37, 8], [36, 8]]],
    }),
    /must be closed/,
  );
  assert.throws(
    () => validateGeometry({
      type: "Polygon",
      coordinates: [[[36, 7], [37, 8], [36, 8], [37, 7], [36, 7]]],
    }),
    /must not self-intersect/,
  );
  assert.throws(() => parseGeoJson("{"), /not valid JSON/);
});
