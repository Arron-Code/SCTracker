import assert from "node:assert/strict";
import test from "node:test";
import { closePolygon, createUuid, parsePolygon } from "./domain";
import {
  centerOfPositions,
  circleToPolygon,
  containsPosition,
  radiusFromHectares,
} from "./geofence";

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

test("geofence derives its center from captured positions and radius from plot area", () => {
  assert.deepEqual(
    centerOfPositions([[10, 50], [10.003, 50], [10, 50.003]]),
    [10.001, 50.001],
  );
  assert.ok(Math.abs(radiusFromHectares(1) - 56.419) < 0.001);
});

test("circle geometry and containment follow the configured geofence", () => {
  const geofence = {
    center: [10, 50] as [number, number],
    radiusMeters: 100,
    source: "gps" as const,
    enabled: true,
    updatedAt: "2026-09-17T12:00:00.000Z",
  };
  const polygon = circleToPolygon(geofence.center, geofence.radiusMeters);
  assert.equal(polygon.coordinates[0].length, 33);
  assert.deepEqual(polygon.coordinates[0][0], polygon.coordinates[0].at(-1));
  assert.equal(containsPosition(geofence, [10, 50.0005]), true);
  assert.equal(containsPosition(geofence, [10, 50.002]), false);
});
