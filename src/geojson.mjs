const GEOMETRY_TYPES = new Set(["Point", "Polygon", "MultiPolygon"]);

function isPosition(value) {
  return Array.isArray(value)
    && value.length >= 2
    && value.slice(0, 2).every(Number.isFinite)
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90;
}

function positionsEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function orientation(a, b, c) {
  return Math.sign((b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]));
}

function segmentsCross(a, b, c, d) {
  return orientation(a, b, c) !== orientation(a, b, d)
    && orientation(c, d, a) !== orientation(c, d, b);
}

function validateRing(ring, path) {
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new Error(`${path} must contain at least four positions.`);
  }
  ring.forEach((position, index) => {
    if (!isPosition(position)) throw new Error(`${path}[${index}] is not a valid longitude/latitude position.`);
  });
  if (!positionsEqual(ring[0], ring[ring.length - 1])) {
    throw new Error(`${path} must be closed.`);
  }
  for (let first = 0; first < ring.length - 1; first += 1) {
    for (let second = first + 2; second < ring.length - 1; second += 1) {
      if (first === 0 && second === ring.length - 2) continue;
      if (segmentsCross(ring[first], ring[first + 1], ring[second], ring[second + 1])) {
        throw new Error(`${path} must not self-intersect.`);
      }
    }
  }
}

export function validateGeometry(geometry, path = "geometry") {
  if (!geometry || !GEOMETRY_TYPES.has(geometry.type)) {
    throw new Error(`${path}.type must be Point, Polygon, or MultiPolygon.`);
  }

  if (geometry.type === "Point") {
    if (!isPosition(geometry.coordinates)) {
      throw new Error(`${path}.coordinates is not a valid longitude/latitude position.`);
    }
  } else if (geometry.type === "Polygon") {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new Error(`${path}.coordinates must contain at least one linear ring.`);
    }
    geometry.coordinates.forEach((ring, index) => validateRing(ring, `${path}.coordinates[${index}]`));
  } else {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new Error(`${path}.coordinates must contain at least one polygon.`);
    }
    geometry.coordinates.forEach((polygon, polygonIndex) => {
      if (!Array.isArray(polygon) || polygon.length === 0) {
        throw new Error(`${path}.coordinates[${polygonIndex}] must contain at least one linear ring.`);
      }
      polygon.forEach((ring, ringIndex) =>
        validateRing(ring, `${path}.coordinates[${polygonIndex}][${ringIndex}]`),
      );
    });
  }
  return geometry;
}

export function parseGeoJson(input) {
  let parsed;
  try {
    parsed = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    throw new Error("GeoJSON is not valid JSON.");
  }

  const features = parsed?.type === "FeatureCollection"
    ? parsed.features
    : parsed?.type === "Feature"
      ? [parsed]
      : GEOMETRY_TYPES.has(parsed?.type)
        ? [{ type: "Feature", properties: {}, geometry: parsed }]
        : null;

  if (!Array.isArray(features) || features.length === 0) {
    throw new Error("GeoJSON must be a geometry, Feature, or non-empty FeatureCollection.");
  }

  return features.map((feature, index) => {
    if (feature?.type !== "Feature") {
      throw new Error(`features[${index}] must be a GeoJSON Feature.`);
    }
    return {
      type: "Feature",
      properties: feature.properties
        && typeof feature.properties === "object"
        && !Array.isArray(feature.properties)
        ? feature.properties
        : {},
      geometry: validateGeometry(feature.geometry, `features[${index}].geometry`),
    };
  });
}
