import { z } from "zod";
import { AppError } from "./errors.js";

const position = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const ring = z.array(position).min(4);
const point = z.object({ type: z.literal("Point"), coordinates: position });
const polygon = z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1) });
const multiPolygon = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(ring).min(1)).min(1),
});
export const geometrySchema = z.discriminatedUnion("type", [point, polygon, multiPolygon]);
export type Geometry = z.infer<typeof geometrySchema>;
export const geofenceSchema = z.object({
  center: position,
  radiusMeters: z.number().min(1).max(1_000_000),
  source: z.enum(["gps", "supplier", "manual"]),
  country: z.string().trim().min(1).max(100).optional(),
  region: z.string().trim().min(1).max(200).optional(),
  enabled: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type Geofence = z.infer<typeof geofenceSchema>;

const EARTH_RADIUS_METERS = 6_371_000;

export function geofenceDistanceMeters(geofence: Geofence, coordinates: [number, number]): number {
  const latitude1 = (geofence.center[1] * Math.PI) / 180;
  const latitude2 = (coordinates[1] * Math.PI) / 180;
  const latitudeDelta = ((coordinates[1] - geofence.center[1]) * Math.PI) / 180;
  const longitudeDelta = ((coordinates[0] - geofence.center[0]) * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function closeRing(input: [number, number][]): [number, number][] {
  const first = input[0];
  const last = input[input.length - 1];
  if (!first || !last) return input;
  return first[0] === last[0] && first[1] === last[1] ? input : [...input, first];
}

export function normalizeGeometry(input: unknown): Geometry {
  const geometry = geometrySchema.parse(input);
  if (geometry.type === "Point") return geometry;
  if (geometry.type === "Polygon") {
    const coordinates = geometry.coordinates.map(closeRing);
    if (coordinates.some((value) => value.length < 4)) {
      throw new AppError("INVALID_GEOMETRY", "Polygon rings require at least four positions");
    }
    return { type: "Polygon", coordinates };
  }
  const coordinates = geometry.coordinates.map((polygonValue) => polygonValue.map(closeRing));
  if (coordinates.some((polygonValue) => polygonValue.some((value) => value.length < 4))) {
    throw new AppError("INVALID_GEOMETRY", "Polygon rings require at least four positions");
  }
  return { type: "MultiPolygon", coordinates };
}
