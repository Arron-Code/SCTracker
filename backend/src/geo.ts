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
