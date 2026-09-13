import assert from "node:assert/strict";
import test from "node:test";
import { closePolygon, createUuid, parsePolygon } from "./domain";

test("closePolygon produces a closed GeoJSON polygon", () => {
  const polygon = closePolygon([
    [7, 50],
    [8, 50],
    [8, 51],
  ]);

  assert.equal(polygon.type, "Polygon");
  assert.deepEqual(polygon.coordinates[0][0], polygon.coordinates[0][3]);
});

test("parsePolygon rejects malformed geometry", () => {
  assert.throws(() => parsePolygon('{"type":"Point","coordinates":[7,50]}'));
  assert.throws(() =>
    parsePolygon('{"type":"Polygon","coordinates":[[[7,50],[8,50]]]}'),
  );
});

test("UUID identifiers have RFC 4122 version and variant bits", () => {
  assert.match(
    createUuid(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
