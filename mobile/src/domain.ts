export type Position = [number, number];

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: Position[][];
};

export type SyncStatus = "pending" | "syncing" | "synced" | "conflict" | "failed";

export type Geofence = {
  center: Position;
  radiusMeters: number;
  source: "gps" | "supplier" | "manual";
  country?: string;
  region?: string;
  enabled: boolean;
  updatedAt: string;
};

export type Plot = {
  id: string;
  supplierId?: string;
  producer: string;
  farmName: string;
  areaHa: string;
  polygon: GeoJsonPolygon;
  geofence?: Geofence;
  capturedAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type Supplier = {
  id: string;
  name: string;
  country: string;
  region: string;
  producerCount: number;
  plotCount: number;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type DocumentRecord = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: "uploading" | "uploaded" | "failed";
  createdAt: string;
};

export type OperationStatus = "queued" | "processing" | "completed" | "failed" | "not_configured";

export type OperationalRequest = {
  id: string;
  kind: "satellite" | "evidence_pack" | "dds";
  subjectId: string;
  status: OperationStatus;
  downloadUrl?: string;
  message?: string;
  updatedAt: string;
};

export type SignedEvent = {
  schema: 1;
  eventId: string;
  eventType: string;
  aggregateId: string;
  sequence: number;
  prevHash: string;
  reportedUtc: string;
  deviceId: string;
  actorId: string;
  tenantId: string;
  payloadHash: string;
  eventHash: string;
  keyId: string;
  signature: string;
  payload: Supplier | Plot;
};

export type OutboxOperation = {
  id: string;
  idempotencyKey: string;
  entityType: "supplier" | "plot";
  entityId: string;
  action: "upsert";
  payload: Supplier | Plot;
  expectedUpdatedAt?: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  event?: SignedEvent;
};

export type SyncConflict = {
  id: string;
  entityType: OutboxOperation["entityType"];
  entityId: string;
  local: Supplier | Plot;
  remote: Supplier | Plot;
  detectedAt: string;
};

export type PersistedState = {
  version: 3;
  deviceId: string;
  cursor: string | null;
  suppliers: Supplier[];
  plots: Plot[];
  documents: DocumentRecord[];
  operations: OperationalRequest[];
  outbox: OutboxOperation[];
  events: SignedEvent[];
  conflicts: SyncConflict[];
  lastSyncAt: string | null;
};

export type LegacyPlotDraft = {
  id?: string;
  producer?: string;
  farmName?: string;
  areaHa?: string;
  latitude?: number;
  longitude?: number;
  capturedAt?: string;
};

export type PushResponse = {
  accepted: string[];
  chainHead?: string;
  applied?: Array<{
    operationId?: string;
    resource: Supplier | Plot;
  }>;
  conflicts?: Array<{
    operationId: string;
    entityType: OutboxOperation["entityType"];
    entityId: string;
    remote: Supplier | Plot;
  }>;
};

export type PullResponse = {
  cursor: string;
  changes: Array<
    | { entityType: "supplier"; entity: Supplier }
    | { entityType: "plot"; entity: Plot }
  >;
};

export function createUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function closePolygon(points: Position[]): GeoJsonPolygon {
  if (points.length < 3) {
    throw new Error("A polygon requires at least three positions.");
  }
  const first = points[0];
  const last = points[points.length - 1];
  const closed =
    first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
  return { type: "Polygon", coordinates: [closed] };
}

export function parsePolygon(value: string): GeoJsonPolygon {
  const parsed: unknown = JSON.parse(value);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("type" in parsed) ||
    parsed.type !== "Polygon" ||
    !("coordinates" in parsed) ||
    !Array.isArray(parsed.coordinates) ||
    !Array.isArray(parsed.coordinates[0])
  ) {
    throw new Error("GeoJSON must be a Polygon.");
  }
  const positions = parsed.coordinates[0];
  if (
    positions.length < 4 ||
    positions.some(
      (position: unknown) =>
        !Array.isArray(position) ||
        position.length < 2 ||
        !Number.isFinite(position[0]) ||
        !Number.isFinite(position[1]),
    )
  ) {
    throw new Error("Polygon coordinates are invalid.");
  }
  return closePolygon(positions.map((position: number[]) => [position[0], position[1]]));
}
