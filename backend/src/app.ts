import Fastify, { type FastifyInstance } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { z } from "zod";
import { loadConfig, type Config } from "./config.js";
import type { JwtVerifier } from "./auth.js";
import { actorContext } from "./context.js";
import { AppError, installErrorHandler } from "./errors.js";
import { geofenceDistanceMeters, geofenceSchema, normalizeGeometry } from "./geo.js";
import {
  EuInformationSystemV3Provider,
  S3StorageProvider,
  SentinelHubProvider,
  type DdsProvider,
  type SatelliteProvider,
  type StorageProvider,
} from "./providers.js";
import { PgRepository, type Change, type Repository, type ResourceType } from "./repository.js";
import {
  SIGNING_ALGORITHM,
  sha256Hex,
  signedEventHash,
  verifySignedEvent,
  type SignedEvent,
} from "./signed-events.js";

export interface Providers {
  storage: StorageProvider;
  satellite: SatelliteProvider;
  dds: DdsProvider;
}

export interface AppOptions {
  config: Config;
  repository: Repository;
  providers: Providers;
  authVerifier?: JwtVerifier;
}

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(200);
const sha256 = z.string().regex(/^[A-Za-z0-9+/]{43}=$/, "Expected base64 SHA-256 digest");
const supplierInput = z.object({
  name,
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  email: z.string().email().optional(),
  externalReference: z.string().max(100).optional(),
});
const plotInput = z.object({
  supplierId: uuid,
  name,
  geometry: z.unknown(),
  areaHectares: z.number().positive().optional(),
  geofence: geofenceSchema.optional(),
});
const shipmentInput = z.object({
  reference: name,
  destinationCountryCode: z.string().regex(/^[A-Z]{2}$/),
  quantityKg: z.number().positive(),
  lineage: z
    .array(
      z.object({
        sourceType: z.enum(["lot", "batch"]),
        sourceId: uuid,
        quantityKg: z.number().positive(),
      }),
    )
    .min(1),
});
const uploadInput = z.object({
  fileName: name,
  mimeType: z.string().min(1).max(200),
  size: z.number().int().positive().max(250 * 1024 * 1024),
  sha256,
});
const analysisInput = z.object({
  plotId: uuid,
  kind: z.enum(["deforestation", "land-cover"]),
  fromDate: z.string().date(),
  toDate: z.string().date(),
});
const evidenceInput = z.object({
  shipmentId: uuid,
  documentIds: z.array(uuid).min(1),
  analysisIds: z.array(uuid).default([]),
});
const ddsDraft = z.object({
  evidencePackId: uuid,
  operatorReference: name,
  commodityCode: z.string().regex(/^0901/),
  countryOfProduction: z.string().regex(/^[A-Z]{2}$/),
  quantityKg: z.number().positive(),
  dueDiligenceStatement: z.string().min(20),
});
const legacySyncOperation = z.object({
  resourceType: z.enum(["suppliers", "plots", "shipments"]),
  resourceId: uuid.optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()),
});
const mobileSyncOperation = z.object({
  id: uuid,
  entityType: z.enum(["supplier", "plot"]),
  entityId: uuid,
  action: z.literal("upsert"),
  payload: z.record(z.string(), z.unknown()),
  expectedUpdatedAt: z.string().datetime().optional(),
  event: z.object({
    schema: z.literal(1),
    tenantId: uuid,
    eventId: uuid,
    eventType: z.string().min(1).max(200),
    aggregateId: uuid,
    sequence: z.number().int().positive(),
    prevHash: z.string().regex(/^[0-9a-f]{64}$/),
    reportedUtc: z.string().datetime(),
    deviceId: uuid,
    actorId: uuid,
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
    keyId: z.string().min(1).max(200),
    eventHash: z.string().regex(/^[0-9a-f]{64}$/),
    signature: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
  }).optional(),
});
const syncOperation = z.union([legacySyncOperation, mobileSyncOperation]);
const deviceSigningKey = z.object({
  keyId: z.string().min(1).max(200),
  algorithm: z.literal(SIGNING_ALGORITHM),
  publicKeyBase64: z.string().refine((value) => {
    const bytes = Buffer.from(value, "base64");
    return bytes.length === 65 && bytes[0] === 4 && bytes.toString("base64") === value;
  }, "Expected an uncompressed 65-byte SEC1 P-256 public key"),
});

function data<T>(value: T, meta?: Record<string, unknown>): { data: T; meta?: Record<string, unknown> } {
  return meta ? { data: value, meta } : { data: value };
}

function requireFound<T>(value: T | null, label: string): T {
  if (!value) throw new AppError("NOT_FOUND", `${label} not found`, 404);
  return value;
}

function mobileResource(resource: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(resource).filter(([key]) => key !== "tenantId"));
}

function mobileChange(change: Change) {
  const payload = mobileResource(change.payload);
  if (change.resourceType === "suppliers") {
    const country = payload.country ?? payload.countryCode ?? "";
    return {
      entityType: "supplier" as const,
      entity: {
        ...payload,
        name: String(payload.name ?? ""),
        country: String(country),
        region: String(payload.region ?? ""),
        producerCount: Number(payload.producerCount ?? 0),
        plotCount: Number(payload.plotCount ?? 0),
        syncStatus: "synced",
      },
    };
  }
  if (change.resourceType !== "plots") return null;
  const polygon = payload.polygon ?? payload.geometry;
  if (
    !polygon ||
    typeof polygon !== "object" ||
    !("type" in polygon) ||
    polygon.type !== "Polygon"
  ) {
    return null;
  }
  const nameValue = String(payload.name ?? "");
  return {
    entityType: "plot" as const,
    entity: {
      ...payload,
      producer: String(payload.producer ?? nameValue),
      farmName: String(payload.farmName ?? nameValue),
      areaHa: String(payload.areaHa ?? payload.areaHectares ?? "0"),
      polygon,
      syncStatus: "synced",
    },
  };
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.config.NODE_ENV === "test" ? false : { level: options.config.LOG_LEVEL },
    requestIdHeader: "x-request-id",
  });
  const allowedOrigins = new Set(options.config.FRONTEND_ORIGINS);
  await app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  });
  await app.register(swagger, {
    openapi: {
      info: { title: "SCTracker API", version: "1.0.0" },
      servers: [{ url: "/" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Neon Managed Better Auth JWT",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(actorContext, {
    config: options.config,
    ...(options.authVerifier ? { verifier: options.authVerifier } : {}),
  });
  installErrorHandler(app);

  app.get("/", { schema: { tags: ["system"], security: [] } }, async (_request, reply) =>
    reply.redirect("/docs/"),
  );
  app.get("/health", { schema: { tags: ["system"], security: [] } }, async () =>
    data({ status: "ok", version: process.env.npm_package_version ?? "0.1.0" }),
  );
  app.get("/auth/config", { schema: { tags: ["auth"], security: [] } }, async () =>
    data({
      baseUrl: options.config.NEON_AUTH_BASE_URL ?? null,
      emailPassword: Boolean(options.config.NEON_AUTH_BASE_URL),
      passwordReset: Boolean(options.config.NEON_AUTH_BASE_URL),
      providers: options.config.NEON_AUTH_BASE_URL ? options.config.AUTH_PROVIDERS : [],
    }),
  );

  app.get("/api/v1/suppliers", { schema: { tags: ["suppliers"] } }, async (request) =>
    data(await options.repository.list("suppliers", request.actor.tenantId)),
  );
  app.post("/api/v1/suppliers", { schema: { tags: ["suppliers"] } }, async (request, reply) => {
    const payload = supplierInput.parse(request.body);
    const created = await options.repository.create("suppliers", request.actor.tenantId, {
      ...payload,
      status: "active",
    });
    await options.repository.appendAudit(request.actor.tenantId, request.actor.actorId, "supplier.created", {
      supplierId: created.id,
    });
    return reply.status(201).send(data(created));
  });
  app.get("/api/v1/suppliers/:id", { schema: { tags: ["suppliers"] } }, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return data(requireFound(await options.repository.get("suppliers", request.actor.tenantId, id), "Supplier"));
  });
  app.patch("/api/v1/suppliers/:id", { schema: { tags: ["suppliers"] } }, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const patch = supplierInput.partial().parse(request.body);
    return data(await options.repository.update("suppliers", request.actor.tenantId, id, patch));
  });
  app.delete("/api/v1/suppliers/:id", { schema: { tags: ["suppliers"] } }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    await options.repository.update("suppliers", request.actor.tenantId, id, { status: "deleted" });
    return reply.status(204).send();
  });
  app.post("/api/v1/suppliers/:id/invite", { schema: { tags: ["suppliers"] } }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ email: z.string().email() }).parse(request.body);
    requireFound(await options.repository.get("suppliers", request.actor.tenantId, id), "Supplier");
    const invitation = await options.repository.create("supplier_invitations", request.actor.tenantId, {
      status: "invited",
      supplierId: id,
      email: body.email,
      kind: "invitation",
    });
    return reply.status(202).send(data(invitation));
  });

  app.get("/api/v1/plots", { schema: { tags: ["plots"] } }, async (request) =>
    data(await options.repository.list("plots", request.actor.tenantId)),
  );
  app.post("/api/v1/plots", { schema: { tags: ["plots"] } }, async (request, reply) => {
    const payload = plotInput.parse(request.body);
    requireFound(
      await options.repository.get("suppliers", request.actor.tenantId, payload.supplierId),
      "Supplier",
    );
    const geometry = normalizeGeometry(payload.geometry);
    const created = await options.repository.create("plots", request.actor.tenantId, {
      ...payload,
      geometry,
      status: "active",
    });
    return reply.status(201).send(data(created));
  });
  app.get("/api/v1/plots/:id", { schema: { tags: ["plots"] } }, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return data(requireFound(await options.repository.get("plots", request.actor.tenantId, id), "Plot"));
  });
  app.post("/api/v1/plots/:id/geofence/check", { schema: { tags: ["geofencing"] } }, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const { coordinates } = z.object({
      coordinates: z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ]),
    }).parse(request.body);
    const plot = requireFound(
      await options.repository.get("plots", request.actor.tenantId, id),
      "Plot",
    );
    const geofence = geofenceSchema.parse(plot.geofence);
    const distanceMeters = geofenceDistanceMeters(geofence, coordinates);
    return data({
      plotId: id,
      inside: geofence.enabled && distanceMeters <= geofence.radiusMeters,
      distanceMeters,
      radiusMeters: geofence.radiusMeters,
    });
  });
  app.patch("/api/v1/plots/:id", { schema: { tags: ["plots"] } }, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const patch = plotInput.partial().parse(request.body);
    const normalized = patch.geometry === undefined ? patch : { ...patch, geometry: normalizeGeometry(patch.geometry) };
    return data(await options.repository.update("plots", request.actor.tenantId, id, normalized));
  });
  app.delete("/api/v1/plots/:id", { schema: { tags: ["plots"] } }, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    await options.repository.update("plots", request.actor.tenantId, id, { status: "deleted" });
    return reply.status(204).send();
  });

  app.get("/api/v1/shipments", { schema: { tags: ["shipments"] } }, async (request) =>
    data(await options.repository.list("shipments", request.actor.tenantId)),
  );
  app.post("/api/v1/shipments", { schema: { tags: ["shipments"] } }, async (request, reply) => {
    const payload = shipmentInput.parse(request.body);
    const allocated = payload.lineage.reduce((sum, item) => sum + item.quantityKg, 0);
    if (Math.abs(allocated - payload.quantityKg) > 0.000001) {
      throw new AppError("MASS_BALANCE_ERROR", "Shipment quantity must equal lineage allocations", 409, {
        quantityKg: payload.quantityKg,
        allocatedKg: allocated,
      });
    }
    const created = await options.repository.create("shipments", request.actor.tenantId, {
      ...payload,
      status: "draft",
    });
    await options.repository.appendAudit(request.actor.tenantId, request.actor.actorId, "shipment.created", {
      shipmentId: created.id,
      lineage: payload.lineage,
    });
    return reply.status(201).send(data(created));
  });

  app.post("/api/v1/documents/uploads", { schema: { tags: ["documents"] } }, async (request, reply) => {
    const payload = uploadInput.parse(request.body);
    const document = await options.repository.create("documents", request.actor.tenantId, {
      ...payload,
      status: "pending_upload",
      objectKey: `${request.actor.tenantId}/${crypto.randomUUID()}/${payload.fileName}`,
    });
    const upload = await options.providers.storage.initiateUpload({
      key: String(document.objectKey),
      sha256: payload.sha256,
      size: payload.size,
      mimeType: payload.mimeType,
    });
    return reply.status(201).send(data({ document, upload }));
  });
  app.post("/api/v1/documents/:id/complete", { schema: { tags: ["documents"] } }, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const document = requireFound(
      await options.repository.get("documents", request.actor.tenantId, id),
      "Document",
    );
    if (document.status !== "pending_upload") {
      throw new AppError("IMMUTABLE_EVIDENCE", "Completed evidence cannot be modified", 409);
    }
    const verified = await options.providers.storage.verifyUpload({
      key: String(document.objectKey),
      sha256: String(document.sha256),
      size: Number(document.size),
      mimeType: String(document.mimeType),
    });
    const completed = await options.repository.update("documents", request.actor.tenantId, id, {
      status: "complete",
      completedAt: new Date().toISOString(),
      ...verified,
    });
    await options.repository.appendAudit(request.actor.tenantId, request.actor.actorId, "document.completed", {
      documentId: id,
      sha256: document.sha256,
    });
    return data(completed);
  });

  app.post("/api/v1/analyses", { schema: { tags: ["analyses"] } }, async (request, reply) => {
    const payload = analysisInput.parse(request.body);
    requireFound(await options.repository.get("plots", request.actor.tenantId, payload.plotId), "Plot");
    const created = await options.repository.create("analyses", request.actor.tenantId, {
      status: "queued",
      request: payload,
      attempts: 0,
      nextAttemptAt: 0,
    });
    return reply.status(202).send(data(created));
  });
  app.get("/api/v1/analyses/:id", { schema: { tags: ["analyses"] } }, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return data(requireFound(await options.repository.get("analyses", request.actor.tenantId, id), "Analysis"));
  });

  app.post("/api/v1/evidence-packs", { schema: { tags: ["evidence"] } }, async (request, reply) => {
    const payload = evidenceInput.parse(request.body);
    requireFound(await options.repository.get("shipments", request.actor.tenantId, payload.shipmentId), "Shipment");
    const created = await options.repository.create("evidence_packs", request.actor.tenantId, {
      ...payload,
      status: "queued",
      attempts: 0,
      nextAttemptAt: 0,
    });
    return reply.status(202).send(data(created));
  });
  app.get("/api/v1/evidence-packs/:id", { schema: { tags: ["evidence"] } }, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const pack = requireFound(
      await options.repository.get("evidence_packs", request.actor.tenantId, id),
      "Evidence pack",
    );
    if (pack.status !== "complete") return data(pack);
    const result =
      pack.result && typeof pack.result === "object" ? pack.result as Record<string, unknown> : {};
    const downloadUrl = await options.providers.storage.getDownloadUrl(
      `${pack.tenantId}/evidence-packs/${pack.id}/manifest.json`,
      typeof result.objectVersionId === "string" ? result.objectVersionId : undefined,
    );
    return data({ ...pack, downloadUrl });
  });

  app.post("/api/v1/dds/submissions", { schema: { tags: ["dds"] } }, async (request, reply) => {
    const draft = ddsDraft.parse(request.body);
    const pack = requireFound(
      await options.repository.get("evidence_packs", request.actor.tenantId, draft.evidencePackId),
      "Evidence pack",
    );
    if (pack.status !== "complete") {
      throw new AppError("DDS_DRAFT_INVALID", "Evidence pack must be complete before DDS submission", 409);
    }
    const created = await options.repository.create("dds_submissions", request.actor.tenantId, {
      status: "queued",
      draft,
      attempts: 0,
      nextAttemptAt: 0,
    });
    return reply.status(202).send(data(created));
  });
  app.get("/api/v1/dds/submissions/:id", { schema: { tags: ["dds"] } }, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    return data(requireFound(await options.repository.get("dds_submissions", request.actor.tenantId, id), "DDS submission"));
  });

  app.post("/api/v1/sync/push", { schema: { tags: ["sync"] } }, async (request) => {
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
      throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required", 400);
    }
    const replay = await options.repository.findIdempotency(request.actor.tenantId, idempotencyKey);
    if (replay) return data(replay, { replayed: true });
    const body = z.object({
      deviceId: uuid.optional(),
      deviceKey: deviceSigningKey.optional(),
      operations: z.array(syncOperation).min(1).max(100),
    }).parse(request.body);
    const hasMobileOperations = body.operations.some((operation) => "entityType" in operation);
    const hasProtectedLegacyOperations = body.operations.some((operation) =>
      "resourceType" in operation &&
      (operation.resourceType === "suppliers" || operation.resourceType === "plots")
    );
    if (hasProtectedLegacyOperations) {
      throw new AppError(
        "SIGNED_EVENT_REQUIRED",
        "Supplier and plot sync operations must use the signed mobile format",
        400,
      );
    }
    if (hasMobileOperations && (!body.deviceId || !body.deviceKey)) {
      throw new AppError(
        "SIGNED_EVENT_REQUIRED",
        "Mobile sync operations require deviceId, deviceKey, and a signed event",
        400,
      );
    }
    let signedChainHead: string | undefined;
    if (body.deviceKey) {
      if (!body.deviceId) {
        throw new AppError("INVALID_SIGNED_EVENT", "deviceId is required with deviceKey", 400);
      }
      const events: SignedEvent[] = [];
      for (const operation of body.operations) {
        if (!("entityType" in operation) || !operation.event) {
          throw new AppError("INVALID_SIGNED_EVENT", "Every signed operation must contain an event", 400);
        }
        const event = operation.event;
        const payloadHash = sha256Hex(operation.payload);
        if (
          event.tenantId !== request.actor.tenantId ||
          event.eventId !== operation.id ||
          event.eventType !== `${operation.entityType}.${operation.action}` ||
          event.aggregateId !== operation.entityId ||
          event.deviceId !== body.deviceId ||
          event.actorId !== request.actor.actorId ||
          event.keyId !== body.deviceKey.keyId ||
          event.payloadHash !== payloadHash ||
          sha256Hex(event.payload) !== payloadHash ||
          event.eventHash !== signedEventHash(event) ||
          !verifySignedEvent(event, body.deviceKey)
        ) {
          throw new AppError("INVALID_SIGNED_EVENT", "Signed event validation failed", 400);
        }
        events.push(event);
      }
      await options.repository.appendSignedEvents(
        request.actor.tenantId,
        { ...body.deviceKey, deviceId: body.deviceId, actorId: request.actor.actorId },
        events,
      );
      signedChainHead = events.at(-1)!.eventHash;
    }
    const applied = [];
    const conflicts = [];
    const accepted: string[] = [];
    for (let index = 0; index < body.operations.length; index += 1) {
      const operation = body.operations[index]!;
      try {
        const mobile = "entityType" in operation;
        if (mobile && operation.entityType === "plot" && operation.payload.geofence !== undefined) {
          geofenceSchema.parse(operation.payload.geofence);
        }
        const resourceType = mobile
          ? operation.entityType === "supplier" ? "suppliers" : "plots"
          : operation.resourceType;
        const targetId = mobile ? operation.entityId : operation.resourceId;
        const existing = mobile
          ? await options.repository.get(
              resourceType as ResourceType,
              request.actor.tenantId,
              operation.entityId,
            )
          : null;
        const resource = targetId && (!mobile || existing)
          ? await options.repository.update(
              resourceType as ResourceType,
              request.actor.tenantId,
              targetId,
              operation.payload,
              operation.expectedUpdatedAt,
            )
          : await options.repository.create(
              resourceType as ResourceType,
              request.actor.tenantId,
              mobile ? { ...operation.payload, id: targetId } : operation.payload,
            );
        applied.push({
          index,
          resource: mobileResource(resource),
          ...mobile ? { operationId: operation.id } : {},
        });
        if (mobile) accepted.push(operation.id);
      } catch (error) {
        if (error instanceof AppError && error.code === "SYNC_CONFLICT") {
          if ("entityType" in operation) {
            const details = error.details as { current?: unknown } | undefined;
            conflicts.push({
              operationId: operation.id,
              entityType: operation.entityType,
              entityId: operation.entityId,
              remote: details?.current,
            });
          } else {
            conflicts.push({
              index,
              resourceId: operation.resourceId,
              details: error.details,
            });
          }
          continue;
        }
        throw error;
      }
    }
    const response = {
      applied,
      conflicts,
      accepted,
      ...(signedChainHead ? { chainHead: signedChainHead } : {}),
    };
    await options.repository.saveIdempotency(request.actor.tenantId, idempotencyKey, response);
    return data(response);
  });
  app.get("/api/v1/sync/pull", { schema: { tags: ["sync"] } }, async (request) => {
    const { cursor } = z.object({ cursor: z.coerce.number().int().nonnegative().default(0) }).parse(request.query);
    const rawChanges = await options.repository.changes(request.actor.tenantId, cursor, 500);
    const changes = rawChanges
      .map(mobileChange)
      .filter((change) => change !== null);
    const nextCursor = rawChanges.at(-1)?.sequence ?? cursor;
    return data({
      cursor: String(nextCursor),
      changes,
    }, { hasMore: rawChanges.length === 500 });
  });

  return app;
}

let productionApp: Promise<FastifyInstance> | undefined;

function getProductionApp(): Promise<FastifyInstance> {
  productionApp ??= (async () => {
    const config = loadConfig();
    return buildApp({
      config,
      repository: PgRepository.connect(config.DATABASE_URL),
      providers: {
        storage: new S3StorageProvider(config),
        satellite: new SentinelHubProvider(config),
        dds: new EuInformationSystemV3Provider(config),
      },
    });
  })();
  return productionApp;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const app = await getProductionApp();
  await app.ready();
  app.server.emit("request", request, response);
}
