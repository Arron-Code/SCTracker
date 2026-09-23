import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
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
  ProviderBackedAttestationProvider,
  S3StorageProvider,
  SentinelHubProvider,
  type AttestationProvider,
  type DdsProvider,
  type SatelliteProvider,
  type StorageProvider,
} from "./providers.js";
import { PgRepository, type Change, type Repository, type ResourceType } from "./repository.js";
import {
  attestationProviders,
  blockingTrustStates,
  devicePlatforms,
  isOrganizationAdmin,
  keyProtectionLevels,
  trustScopeTypes,
  trustStates,
} from "./identity.js";
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
  attestation: AttestationProvider;
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
const actorRoles = z.array(z.string().trim().min(1)).default([]);
const organizationUserInput = z.object({
  subjectId: z.string().trim().min(1).max(200).optional(),
  displayName: name.optional(),
  email: z.string().email().optional(),
  roles: actorRoles.optional(),
  status: z.enum(["active", "suspended"]).optional(),
});
const deviceRegistrationInput = z.object({
  deviceId: uuid,
  displayName: name,
  platform: z.enum(devicePlatforms),
  appVersion: z.string().trim().min(1).max(100),
  osVersion: z.string().trim().min(1).max(100),
  keyProtection: z.enum(keyProtectionLevels),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
const deviceRegistrationRequest = deviceRegistrationInput.extend({
  deviceKey: deviceSigningKey.optional(),
});
const attestationChallengeInput = z.object({
  keyId: z.string().min(1).max(200).optional(),
  provider: z.enum(attestationProviders),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
const attestationChallengeRequest = attestationChallengeInput.extend({
  deviceId: uuid,
});
const attestationSubmissionInput = z.object({
  challengeId: uuid,
  keyId: z.string().min(1).max(200).optional(),
  provider: z.enum(attestationProviders),
  proof: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
const attestationSubmissionRequest = attestationSubmissionInput.extend({
  deviceId: uuid,
});
const deviceStatusInput = z.object({
  status: z.enum(["pending", "active", "suspended", "revoked"]),
  reason: z.string().trim().min(1).max(500).optional(),
});
const keyRevocationInput = z.object({
  reason: z.string().trim().min(1).max(500),
});
const trustStateInput = z.object({
  scopeType: z.enum(trustScopeTypes),
  scopeId: z.string().trim().min(1).max(200),
  state: z.enum(trustStates),
  reason: z.string().trim().min(1).max(500),
  details: z.record(z.string(), z.unknown()).default({}),
});
const scopedTrustPatchInput = z.object({
  state: z.enum(trustStates),
  reason: z.string().trim().min(1).max(500),
  details: z.record(z.string(), z.unknown()).default({}),
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

function requireOrganizationAdminActor(request: FastifyRequest): void {
  if (!isOrganizationAdmin(request.actor.roles)) {
    throw new AppError("FORBIDDEN", "Organization admin role is required", 403);
  }
}

function administrationEntryUrl(config: Config): string {
  const target = new URL(config.SC_TRACKER_FRONTEND_URL ?? config.FRONTEND_ORIGINS[0] ?? "http://localhost:4173");
  target.hash = "administration";
  return target.toString();
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
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
  app.get("/admin", { schema: { tags: ["system"], security: [] } }, async (_request, reply) =>
    reply.redirect(administrationEntryUrl(options.config)),
  );
  app.get("/admin/", { schema: { tags: ["system"], security: [] } }, async (_request, reply) =>
    reply.redirect(administrationEntryUrl(options.config)),
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

  async function syncActorIdentity(request: FastifyRequest): Promise<void> {
    await options.repository.upsertOrganizationUser(request.actor.tenantId, {
      actorId: request.actor.actorId,
      ...(request.actor.subjectId ? { subjectId: request.actor.subjectId } : {}),
      ...(request.actor.displayName ? { displayName: request.actor.displayName } : {}),
      ...(request.actor.email ? { email: request.actor.email } : {}),
      roles: request.actor.roles,
      lastAuthenticatedAt: new Date().toISOString(),
    });
  }

  async function enforceActorAccess(request: FastifyRequest): Promise<void> {
    await syncActorIdentity(request);
    const user = await options.repository.getOrganizationUser(
      request.actor.tenantId,
      request.actor.actorId,
    );
    if (user?.status === "suspended") {
      throw new AppError("USER_SUSPENDED", "The organization user is suspended", 403);
    }
    for (const [scopeType, scopeId] of [
      ["organization", request.actor.tenantId],
      ["user", request.actor.actorId],
    ] as const) {
      const trust = await options.repository.getTrustState(
        request.actor.tenantId,
        scopeType,
        scopeId,
      );
      if (trust && blockingTrustStates.has(trust.state)) {
        throw new AppError(
          scopeType === "organization" ? "ORGANIZATION_BLOCKED" : "USER_BLOCKED",
          `${scopeType} trust state blocks access`,
          403,
          { state: trust.state },
        );
      }
    }
    if (
      request.actor.deviceId &&
      request.url !== "/api/v1/devices/register"
    ) {
      const device = await options.repository.getDevice(
        request.actor.tenantId,
        request.actor.deviceId,
      );
      if (!device || device.actorId !== request.actor.actorId) {
        throw new AppError("DEVICE_NOT_REGISTERED", "The authenticated device is not registered", 403);
      }
      if (device.status === "suspended" || device.status === "revoked") {
        throw new AppError(
          device.status === "suspended" ? "DEVICE_SUSPENDED" : "DEVICE_REVOKED",
          `The authenticated device is ${device.status}`,
          403,
        );
      }
      const trust = await options.repository.getTrustState(
        request.actor.tenantId,
        "device",
        request.actor.deviceId,
      );
      if (trust && blockingTrustStates.has(trust.state)) {
        throw new AppError("DEVICE_BLOCKED", "Device trust state blocks access", 403, {
          state: trust.state,
        });
      }
    }
  }

  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/api/v1/")) await enforceActorAccess(request);
  });

  async function registerDeviceBundle(
    request: FastifyRequest,
    payload: z.infer<typeof deviceRegistrationRequest>,
  ): Promise<{ device: Awaited<ReturnType<Repository["registerDevice"]>>; key?: Awaited<ReturnType<Repository["registerSigningKey"]>> }> {
    await syncActorIdentity(request);
    const device = await options.repository.registerDevice(
      request.actor.tenantId,
      request.actor.actorId,
      {
        deviceId: payload.deviceId,
        displayName: payload.displayName,
        platform: payload.platform,
        appVersion: payload.appVersion,
        osVersion: payload.osVersion,
        keyProtection: payload.keyProtection,
        metadata: payload.metadata,
      },
    );
    if (!payload.deviceKey) return { device };
    const key = await options.repository.registerSigningKey(
      request.actor.tenantId,
      request.actor.actorId,
      payload.deviceId,
      payload.deviceKey,
    );
    return { device, key };
  }

  async function createAttestationChallengeResponse(
    request: FastifyRequest,
    deviceId: string,
    payload: z.infer<typeof attestationChallengeInput>,
  ) {
    const challenge = await options.repository.createAttestationChallenge(
      request.actor.tenantId,
      request.actor.actorId,
      {
        deviceId,
        ...(payload.keyId ? { keyId: payload.keyId } : {}),
        provider: payload.provider,
        challenge: randomBytes(32).toString("base64url"),
        metadata: payload.metadata,
        expiresAt: new Date(
          Date.now() + options.config.ATTESTATION_CHALLENGE_TTL_SECONDS * 1000,
        ).toISOString(),
      },
    );
    const verificationConfigured = payload.provider === "play_integrity"
      ? Boolean(options.config.PLAY_INTEGRITY_VERIFY_URL && options.config.PLAY_INTEGRITY_VERIFY_TOKEN)
      : Boolean(options.config.APP_ATTEST_VERIFY_URL && options.config.APP_ATTEST_VERIFY_TOKEN);
    return { ...challenge, verificationConfigured };
  }

  async function createAttestationRecordResponse(
    request: FastifyRequest,
    deviceId: string,
    payload: z.infer<typeof attestationSubmissionInput>,
  ) {
    const challenge = (await options.repository.listAttestationChallenges(
      request.actor.tenantId,
      deviceId,
    )).find((entry) => entry.challengeId === payload.challengeId) ?? null;
    if (
      !challenge ||
      challenge.actorId !== request.actor.actorId ||
      challenge.provider !== payload.provider ||
      challenge.status !== "pending" ||
      (challenge.keyId !== null && challenge.keyId !== (payload.keyId ?? null))
    ) {
      throw new AppError("INVALID_ATTESTATION_CHALLENGE", "Attestation challenge is invalid or already used", 409);
    }
    if (Date.parse(challenge.expiresAt) <= Date.now()) {
      throw new AppError("ATTESTATION_CHALLENGE_EXPIRED", "Attestation challenge has expired", 409);
    }
    const verification = await options.providers.attestation.verify({
      tenantId: request.actor.tenantId,
      actorId: request.actor.actorId,
      deviceId,
      keyId: payload.keyId ?? null,
      challengeId: payload.challengeId,
      challenge: challenge.challenge,
      provider: payload.provider,
      proof: payload.proof,
      metadata: payload.metadata,
    });
    return options.repository.recordAttestation(
      request.actor.tenantId,
      request.actor.actorId,
      {
        deviceId,
        ...(payload.keyId ? { keyId: payload.keyId } : {}),
        challengeId: payload.challengeId,
        provider: payload.provider,
        status: verification.status,
        verified: verification.verified,
        reason: verification.reason,
        providerReference: verification.providerReference,
        evidence: verification.evidence,
        payloadDigest: sha256Hex(payload.proof),
      },
    );
  }

  async function setScopedTrustState(
    request: FastifyRequest,
    scopeType: "user" | "device",
    scopeId: string,
    payload: z.infer<typeof scopedTrustPatchInput>,
  ) {
    requireOrganizationAdminActor(request);
    if (scopeType === "user" && blockingTrustStates.has(payload.state)) {
      const user = await options.repository.getOrganizationUser(request.actor.tenantId, scopeId);
      if (user?.status === "active" && isOrganizationAdmin(user.roles)) {
        if (!await hasOtherUsableOrganizationAdmin(request.actor.tenantId, scopeId)) {
          throw new AppError(
            "LAST_ADMIN_REQUIRED",
            "The last active organization administrator cannot be blocked",
            409,
          );
        }
      }
    }
    const trust = await options.repository.setTrustState(
      request.actor.tenantId,
      request.actor.actorId,
      {
        scopeType,
        scopeId,
        state: payload.state,
        reason: payload.reason,
        details: payload.details,
      },
    );
    await options.repository.appendAudit(
      request.actor.tenantId,
      request.actor.actorId,
      `identity.${scopeType}.trust.updated`,
      { scopeType, scopeId, ...payload },
    );
    return trust;
  }

  async function listUsersWithTrust(tenantId: string) {
    const users = await options.repository.listOrganizationUsers(tenantId);
    return Promise.all(users.map(async (user) => ({
      ...user,
      trustState: (await options.repository.getTrustState(tenantId, "user", user.actorId))?.state ?? null,
    })));
  }

  async function hasOtherUsableOrganizationAdmin(tenantId: string, excludedActorId: string) {
    const users = await options.repository.listOrganizationUsers(tenantId);
    const candidates = users.filter(
      (candidate) =>
        candidate.actorId !== excludedActorId
        && candidate.status === "active"
        && isOrganizationAdmin(candidate.roles),
    );
    const trustStatesForCandidates = await Promise.all(
      candidates.map((candidate) => options.repository.getTrustState(tenantId, "user", candidate.actorId)),
    );
    return trustStatesForCandidates.some((trust) => !trust || !blockingTrustStates.has(trust.state));
  }

  async function saveOrganizationUser(request: FastifyRequest) {
    requireOrganizationAdminActor(request);
    const { actorId } = z.object({ actorId: uuid }).parse(request.params);
    const payload = organizationUserInput.parse(request.body);
    const existing = await options.repository.getOrganizationUser(request.actor.tenantId, actorId);
    const roles = payload.roles ?? existing?.roles ?? [];
    const status = payload.status ?? existing?.status ?? "active";
    if (
      existing?.status === "active"
      && isOrganizationAdmin(existing.roles)
      && (status !== "active" || !isOrganizationAdmin(roles))
    ) {
      if (!await hasOtherUsableOrganizationAdmin(request.actor.tenantId, actorId)) {
        throw new AppError(
          "LAST_ADMIN_REQUIRED",
          "The last active organization administrator cannot be suspended or demoted",
          409,
        );
      }
    }
    const user = await options.repository.upsertOrganizationUser(request.actor.tenantId, {
      actorId,
      ...(payload.subjectId ? { subjectId: payload.subjectId } : {}),
      ...(payload.displayName ? { displayName: payload.displayName } : {}),
      ...(payload.email ? { email: payload.email } : {}),
      roles,
      status,
    });
    await options.repository.appendAudit(request.actor.tenantId, request.actor.actorId, "identity.user.upserted", {
      actorId,
      roles: user.roles,
      status: user.status,
    });
    return data(user);
  }

  async function updateAdminDeviceStatus(request: FastifyRequest) {
    requireOrganizationAdminActor(request);
    const { deviceId } = z.object({ deviceId: uuid }).parse(request.params);
    const payload = deviceStatusInput.parse(request.body);
    const device = await options.repository.updateDeviceStatus(
      request.actor.tenantId,
      deviceId,
      request.actor.actorId,
      {
        status: payload.status,
        ...(payload.reason ? { reason: payload.reason } : {}),
      },
    );
    await options.repository.appendAudit(request.actor.tenantId, request.actor.actorId, "identity.device.status_changed", {
      deviceId,
      status: payload.status,
      reason: payload.reason ?? null,
    });
    return data(device);
  }

  async function listDevicesWithTrust(tenantId: string, actorId?: string) {
    const devices = await options.repository.listDevices(tenantId, actorId);
    return Promise.all(devices.map(async (device) => {
      const attestations = await options.repository.listAttestations(tenantId, device.deviceId);
      return {
        ...device,
        trustState: (await options.repository.getTrustState(tenantId, "device", device.deviceId))?.state ?? null,
        attestationStatus: attestations.at(-1)?.status ?? null,
      };
    }));
  }

  async function listKeysWithTrust(tenantId: string, deviceId?: string) {
    const keys = await options.repository.listSigningKeys(tenantId, deviceId);
    return Promise.all(keys.map(async (key) => ({
      ...key,
      trustState: (await options.repository.getTrustState(tenantId, "key", key.keyId))?.state ?? null,
    })));
  }

  app.get("/api/v1/identity/me", { schema: { tags: ["identity"] } }, async (request) => {
    await syncActorIdentity(request);
    const snapshot = await options.repository.getIdentitySnapshot(
      request.actor.tenantId,
      request.actor.actorId,
    );
    return data({
      actor: {
        tenantId: request.actor.tenantId,
        actorId: request.actor.actorId,
        deviceId: request.actor.deviceId,
        roles: request.actor.roles,
      },
      ...snapshot,
    });
  });

  app.post("/api/v1/devices/register", { schema: { tags: ["identity"] } }, async (request, reply) => {
    const payload = deviceRegistrationRequest.parse(request.body);
    const registered = await registerDeviceBundle(request, payload);
    return reply.status(201).send(data(registered));
  });
  app.post("/api/v1/identity/devices", { schema: { tags: ["identity"] } }, async (request, reply) => {
    const payload = deviceRegistrationInput.parse(request.body);
    const registered = await registerDeviceBundle(request, payload);
    return reply.status(201).send(data(registered.device));
  });
  app.post("/api/v1/identity/devices/:deviceId/keys", { schema: { tags: ["identity"] } }, async (request, reply) => {
    const { deviceId } = z.object({ deviceId: uuid }).parse(request.params);
    const payload = deviceSigningKey.parse(request.body);
    const key = await options.repository.registerSigningKey(
      request.actor.tenantId,
      request.actor.actorId,
      deviceId,
      payload,
    );
    return reply.status(201).send(data(key));
  });

  app.post("/api/v1/devices/attestation/challenges", { schema: { tags: ["identity"] } }, async (request, reply) => {
    const payload = attestationChallengeRequest.parse(request.body);
    const challenge = await createAttestationChallengeResponse(request, payload.deviceId, payload);
    return reply.status(201).send(data(challenge));
  });
  app.post(
    "/api/v1/identity/devices/:deviceId/attestation/challenges",
    { schema: { tags: ["identity"] } },
    async (request, reply) => {
      const { deviceId } = z.object({ deviceId: uuid }).parse(request.params);
      const payload = attestationChallengeInput.parse(request.body);
      const challenge = await createAttestationChallengeResponse(request, deviceId, payload);
      return reply.status(201).send(data(challenge));
    },
  );

  app.post("/api/v1/devices/attestations", { schema: { tags: ["identity"] } }, async (request, reply) => {
    const payload = attestationSubmissionRequest.parse(request.body);
    const attestation = await createAttestationRecordResponse(request, payload.deviceId, payload);
    return reply.status(201).send(data(attestation));
  });
  app.post("/api/v1/identity/devices/:deviceId/attestations", { schema: { tags: ["identity"] } }, async (request, reply) => {
    const { deviceId } = z.object({ deviceId: uuid }).parse(request.params);
    const payload = attestationSubmissionInput.parse(request.body);
    const attestation = await createAttestationRecordResponse(request, deviceId, payload);
    return reply.status(201).send(data(attestation));
  });

  app.get("/api/v1/admin/users", { schema: { tags: ["identity"] } }, async (request) => {
    await syncActorIdentity(request);
    requireOrganizationAdminActor(request);
    return data(await listUsersWithTrust(request.actor.tenantId));
  });
  app.get("/api/v1/admin/identity/users", { schema: { tags: ["identity"] } }, async (request) => {
    await syncActorIdentity(request);
    requireOrganizationAdminActor(request);
    return data(await listUsersWithTrust(request.actor.tenantId));
  });
  app.put("/api/v1/admin/identity/users/:actorId", { schema: { tags: ["identity"] } }, saveOrganizationUser);
  app.put("/api/v1/admin/users/:actorId", { schema: { tags: ["identity"] } }, saveOrganizationUser);
  app.patch("/api/v1/admin/users/:actorId/trust", { schema: { tags: ["identity"] } }, async (request) => {
    const { actorId } = z.object({ actorId: uuid }).parse(request.params);
    const payload = scopedTrustPatchInput.parse(request.body);
    return data(await setScopedTrustState(request, "user", actorId, payload));
  });

  app.get("/api/v1/admin/devices", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const { actorId } = z.object({ actorId: uuid.optional() }).parse(request.query);
    return data(await listDevicesWithTrust(request.actor.tenantId, actorId));
  });
  app.get("/api/v1/admin/identity/devices", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const { actorId } = z.object({ actorId: uuid.optional() }).parse(request.query);
    return data(await listDevicesWithTrust(request.actor.tenantId, actorId));
  });
  app.get("/api/v1/admin/identity/devices/:deviceId/attestations", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const { deviceId } = z.object({ deviceId: uuid }).parse(request.params);
    return data({
      challenges: await options.repository.listAttestationChallenges(request.actor.tenantId, deviceId),
      records: await options.repository.listAttestations(request.actor.tenantId, deviceId),
    });
  });
  app.get("/api/v1/admin/devices/:deviceId/attestations", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const { deviceId } = z.object({ deviceId: uuid }).parse(request.params);
    return data({
      challenges: await options.repository.listAttestationChallenges(request.actor.tenantId, deviceId),
      records: await options.repository.listAttestations(request.actor.tenantId, deviceId),
    });
  });
  app.post("/api/v1/admin/identity/devices/:deviceId/status", { schema: { tags: ["identity"] } }, updateAdminDeviceStatus);
  app.post("/api/v1/admin/devices/:deviceId/status", { schema: { tags: ["identity"] } }, updateAdminDeviceStatus);
  app.patch("/api/v1/admin/devices/:deviceId/trust", { schema: { tags: ["identity"] } }, async (request) => {
    const { deviceId } = z.object({ deviceId: uuid }).parse(request.params);
    const payload = scopedTrustPatchInput.parse(request.body);
    return data(await setScopedTrustState(request, "device", deviceId, payload));
  });

  app.get("/api/v1/admin/identity/keys", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const { deviceId } = z.object({ deviceId: uuid.optional() }).parse(request.query);
    return data(await listKeysWithTrust(request.actor.tenantId, deviceId));
  });
  app.get("/api/v1/admin/keys", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const { deviceId } = z.object({ deviceId: uuid.optional() }).parse(request.query);
    return data(await listKeysWithTrust(request.actor.tenantId, deviceId));
  });
  app.post("/api/v1/admin/keys/:keyId/revoke", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const { keyId } = z.object({ keyId: z.string().min(1).max(200) }).parse(request.params);
    const payload = keyRevocationInput.parse(request.body);
    const key = await options.repository.revokeSigningKey(
      request.actor.tenantId,
      keyId,
      request.actor.actorId,
      payload.reason,
    );
    await options.repository.appendAudit(request.actor.tenantId, request.actor.actorId, "identity.key.revoked", {
      keyId,
      deviceId: key.deviceId,
      reason: payload.reason,
    });
    return data(key);
  });
  app.post("/api/v1/admin/identity/keys/:keyId/revoke", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const { keyId } = z.object({ keyId: z.string().min(1).max(200) }).parse(request.params);
    const payload = keyRevocationInput.parse(request.body);
    const key = await options.repository.revokeSigningKey(
      request.actor.tenantId,
      keyId,
      request.actor.actorId,
      payload.reason,
    );
    await options.repository.appendAudit(request.actor.tenantId, request.actor.actorId, "identity.key.revoked", {
      keyId,
      deviceId: key.deviceId,
      reason: payload.reason,
    });
    return data(key);
  });
  app.get("/api/v1/admin/identity/trust", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const query = z.object({
      scopeType: z.enum(trustScopeTypes),
      scopeId: z.string().trim().min(1).max(200),
    }).parse(request.query);
    return data(requireFound(
      await options.repository.getTrustState(request.actor.tenantId, query.scopeType, query.scopeId),
      "Trust state",
    ));
  });
  app.get("/api/v1/admin/identity/trust/history", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const query = z.object({
      scopeType: z.enum(trustScopeTypes).optional(),
      scopeId: z.string().trim().min(1).max(200).optional(),
    }).parse(request.query);
    return data(await options.repository.listTrustHistory(request.actor.tenantId, {
      ...(query.scopeType ? { scopeType: query.scopeType } : {}),
      ...(query.scopeId ? { scopeId: query.scopeId } : {}),
    }));
  });
  app.post("/api/v1/admin/identity/trust", { schema: { tags: ["identity"] } }, async (request) => {
    requireOrganizationAdminActor(request);
    const payload = trustStateInput.parse(request.body);
    const trust = await options.repository.setTrustState(
      request.actor.tenantId,
      request.actor.actorId,
      payload,
    );
    await options.repository.appendAudit(request.actor.tenantId, request.actor.actorId, "identity.trust.updated", payload);
    return data(trust);
  });

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
        attestation: new ProviderBackedAttestationProvider(config),
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
