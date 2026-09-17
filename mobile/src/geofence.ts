import type { Geofence, Position } from "./domain";

const EARTH_RADIUS_METERS = 6_371_000;

export function radiusFromHectares(areaHectares: number): number {
  if (!Number.isFinite(areaHectares) || areaHectares <= 0) {
    throw new Error("Area must be a positive number.");
  }
  return Math.sqrt((areaHectares * 10_000) / Math.PI);
}

export function centerOfPositions(positions: Position[]): Position {
  if (positions.length === 0) {
    throw new Error("At least one position is required.");
  }
  const unique =
    positions.length > 1 &&
    positions[0][0] === positions.at(-1)?.[0] &&
    positions[0][1] === positions.at(-1)?.[1]
      ? positions.slice(0, -1)
      : positions;
  const [longitude, latitude] = unique.reduce(
    ([longitudeSum, latitudeSum], [nextLongitude, nextLatitude]) => [
      longitudeSum + nextLongitude,
      latitudeSum + nextLatitude,
    ],
    [0, 0],
  );
  return [longitude / unique.length, latitude / unique.length];
}

export function distanceMeters(from: Position, to: Position): number {
  const latitude1 = (from[1] * Math.PI) / 180;
  const latitude2 = (to[1] * Math.PI) / 180;
  const latitudeDelta = ((to[1] - from[1]) * Math.PI) / 180;
  const longitudeDelta = ((to[0] - from[0]) * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function positionAtDistance(
  center: Position,
  distance: number,
  bearingDegrees = 90,
): Position {
  const angularDistance = distance / EARTH_RADIUS_METERS;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitude = (center[1] * Math.PI) / 180;
  const longitude = (center[0] * Math.PI) / 180;
  const targetLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const targetLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(targetLatitude),
    );
  return [(targetLongitude * 180) / Math.PI, (targetLatitude * 180) / Math.PI];
}

export function circleToPolygon(center: Position, radiusMeters: number, segments = 32) {
  const positions: Position[] = [];
  for (let index = 0; index < segments; index += 1) {
    positions.push(positionAtDistance(center, radiusMeters, (index * 360) / segments));
  }
  positions.push(positions[0]);
  return { type: "Polygon" as const, coordinates: [positions] };
}

export function containsPosition(geofence: Geofence, position: Position): boolean {
  return distanceMeters(geofence.center, position) <= geofence.radiusMeters;
}
