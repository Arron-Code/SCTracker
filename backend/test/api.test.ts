import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { buildApp, type Providers } from "../src/app.js";
import type { Config } from "../src/config.js";
import { AppError } from "../src/errors.js";
import { MemoryRepository } from "../src/repository.js";
import { processOne } from "../src/worker.js";
import {
  eventSigningMaterial,
  sha256Hex,
  signedEventHash,
  type SignedEvent,
} from "../src/signed-events.js";

const config: Config = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3000,
  DATABASE_URL: "postgres://unused",
  LOG_LEVEL: "silent",
  DEV_AUTH_ENABLED: true,
  AUTH_PROVIDERS: ["google"],
  FRONTEND_ORIGINS: ["https://app.example.test"],
  WORKER_POLL_MS: 10,
  SENTINEL_HUB_BASE_URL: "https://example.invalid",
  S3_FORCE_PATH_STYLE: false,
  S3_OBJECT_LOCK_REQUIRED: true,
  ATTESTATION_CHALLENGE_TTL_SECONDS: 600,
};
const headers = {
  "x-tenant-id": "00000000-0000-4000-8000-000000000001",
  "x-actor-id": "00000000-0000-4000-8000-000000000002",
};

let signingKeyCounter = 0;

function signingFixture(options: {
  tenantId?: string;
  actorId?: string;
  deviceId?: string;
} = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const publicKeyBase64 = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x!, "base64url"),
    Buffer.from(jwk.y!, "base64url"),
  ]).toString("base64");
  const tenantId = options.tenantId ?? headers["x-tenant-id"];
  const actorId = options.actorId ?? headers["x-actor-id"];
  const deviceId = options.deviceId ?? "00000000-0000-4000-8000-000000000012";
  const keyId = `mobile-test-key-${signingKeyCounter += 1}`;
  const createEvent = (
    operationId: string,
    aggregateId: string,
    sequence: number,
    prevHash: string,
    payload: Record<string, unknown>,
  ): SignedEvent => {
    const unsigned = {
      schema: 1 as const,
      tenantId,
      eventId: operationId,
      eventType: "supplier.upsert",
      aggregateId,
      sequence,
      prevHash,
      reportedUtc: "2026-09-18T00:00:00.000Z",
      deviceId,
      actorId,
      payloadHash: sha256Hex(payload),
      keyId,
      eventHash: "",
      signature: "",
      payload,
    };
    const withHash = { ...unsigned, eventHash: signedEventHash(unsigned) };
    return {
      ...withHash,
      signature: sign(
        "sha256",
        Buffer.from(eventSigningMaterial(withHash)),
        { key: privateKey, dsaEncoding: "ieee-p1363" },
      ).toString("base64"),
    };
  };
  return {
    deviceId,
    deviceKey: { keyId, algorithm: "P256-SHA256" as const, publicKeyBase64 },
    createEvent,
  };
}

async function registerSigningIdentity(
  target: MemoryRepository,
  fixture: ReturnType<typeof signingFixture>,
  options: {
    tenantId?: string;
    actorId?: string;
  } = {},
): Promise<void> {
  const tenantId = options.tenantId ?? headers["x-tenant-id"];
  const actorId = options.actorId ?? headers["x-actor-id"];
  await target.upsertOrganizationUser(tenantId, { actorId, roles: [] });
  await target.registerDevice(tenantId, actorId, {
    deviceId: fixture.deviceId,
    displayName: "Field device",
    platform: "android",
    appVersion: "1.0.0",
    osVersion: "14",
    keyProtection: "strongbox",
    metadata: {},
  });
  await target.registerSigningKey(tenantId, actorId, fixture.deviceId, fixture.deviceKey);
}

describe("SCTracker API", () => {
  let repository: MemoryRepository;
  let providers: Providers;

  beforeEach(() => {
    repository = new MemoryRepository();
    providers = {
      storage: {
        async initiateUpload(request) {
          return { uploadUrl: `https://uploads.invalid/${request.key}`, headers: {} };
        },
        async verifyUpload() {
          return { etag: "etag", versionId: "version-1" };
        },
        async putImmutable() {
          return { sha256: "manifest-checksum", versionId: "version-2" };
        },
        async getDownloadUrl() {
          return "https://downloads.invalid/evidence-pack";
        },
      },
      satellite: {
        async analyze() {
          return { deforestationDetected: false, source: "fake" };
        },
      },
      dds: {
        async submit() {
          return { externalId: "EU-123", status: "accepted" };
        },
      },
      attestation: {
        async verify() {
          return {
            status: "NOT_CONFIGURED",
            verified: false,
            reason: "play_integrity verifier is not configured",
            providerReference: null,
            evidence: {},
          };
        },
      },
    };
  }, 15_000);

  it("publishes password reset and identity-provider capabilities without authentication", async () => {
    const app = await buildApp({
      config: {
        ...config,
        NEON_AUTH_BASE_URL: "https://auth.example.test/sctracker/auth",
        AUTH_PROVIDERS: ["google"],
      },
      repository,
      providers,
    });
    const response = await app.inject({ method: "GET", url: "/auth/config" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        baseUrl: "https://auth.example.test/sctracker/auth",
        emailPassword: true,
        passwordReset: true,
        providers: ["google"],
      },
    });
    await app.close();
  }, 15_000);

  it("redirects the backend root to the API documentation", async () => {
    const app = await buildApp({ config, repository, providers });
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/docs/");
    await app.close();
  });

  it("redirects backend administration entry routes to the configured frontend administration view", async () => {
    const app = await buildApp({
      config: {
        ...config,
        SC_TRACKER_FRONTEND_URL: "https://portal.example.test/app",
      },
      repository,
      providers,
    });
    const bare = await app.inject({ method: "GET", url: "/admin" });
    expect(bare.statusCode).toBe(302);
    expect(bare.headers.location).toBe("https://portal.example.test/app#administration");

    const withSlash = await app.inject({ method: "GET", url: "/admin/" });
    expect(withSlash.statusCode).toBe(302);
    expect(withSlash.headers.location).toBe("https://portal.example.test/app#administration");
    await app.close();
  });

  it("falls back to the first configured frontend origin for backend administration entry redirects", async () => {
    const app = await buildApp({ config, repository, providers });
    const response = await app.inject({ method: "GET", url: "/admin" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://app.example.test/#administration");
    await app.close();
  });

  it("allows configured frontend origins without opening CORS to arbitrary sites", async () => {
    const app = await buildApp({ config, repository, providers });
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/suppliers",
      headers: {
        origin: "https://app.example.test",
        "access-control-request-method": "GET",
      },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example.test");

    const denied = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/suppliers",
      headers: {
        origin: "https://untrusted.example.test",
        "access-control-request-method": "GET",
      },
    });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("creates tenant-isolated suppliers and normalized plots", async () => {
    const app = await buildApp({ config, repository, providers });
    const supplierResponse = await app.inject({
      method: "POST",
      url: "/api/v1/suppliers",
      headers,
      payload: { name: "Kaffa Cooperative", countryCode: "ET" },
    });
    expect(supplierResponse.statusCode).toBe(201);
    const supplier = supplierResponse.json().data;

    const plotResponse = await app.inject({
      method: "POST",
      url: "/api/v1/plots",
      headers,
      payload: {
        supplierId: supplier.id,
        name: "Farm 1",
        geometry: {
          type: "Polygon",
          coordinates: [[[36.1, 7.1], [36.2, 7.1], [36.2, 7.2], [36.1, 7.2]]],
        },
        geofence: {
          center: [36.15, 7.15],
          radiusMeters: 1000,
          source: "gps",
          enabled: true,
          updatedAt: "2026-09-17T12:00:00.000Z",
        },
      },
    });
    expect(plotResponse.statusCode).toBe(201);
    const ring = plotResponse.json().data.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring.at(-1));
    const inside = await app.inject({
      method: "POST",
      url: `/api/v1/plots/${plotResponse.json().data.id}/geofence/check`,
      headers,
      payload: { coordinates: [36.151, 7.15] },
    });
    expect(inside.statusCode).toBe(200);
    expect(inside.json().data.inside).toBe(true);
    const outside = await app.inject({
      method: "POST",
      url: `/api/v1/plots/${plotResponse.json().data.id}/geofence/check`,
      headers,
      payload: { coordinates: [36.2, 7.2] },
    });
    expect(outside.json().data.inside).toBe(false);
    await app.close();
  }, 120_000);

  it("accepts mobile outbox operations and returns mobile pull changes", async () => {
    const app = await buildApp({ config, repository, providers });
    const mobileFixture = signingFixture();
    await registerSigningIdentity(repository, mobileFixture);
    const supplierId = "00000000-0000-4000-8000-000000000010";
    const operationId = "00000000-0000-4000-8000-000000000011";
    const initialPayload = {
      id: supplierId,
      name: "Kaffa Cooperative",
      country: "Ethiopia",
      region: "Kaffa",
    };
    const initialEvent = mobileFixture.createEvent(
      operationId,
      supplierId,
      1,
      "0".repeat(64),
      initialPayload,
    );
    const pushed = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...headers, "idempotency-key": operationId },
      payload: {
        deviceId: mobileFixture.deviceId,
        deviceKey: mobileFixture.deviceKey,
        operations: [{
          id: operationId,
          entityType: "supplier",
          entityId: supplierId,
          action: "upsert",
          payload: initialPayload,
          event: initialEvent,
        }],
      },
    });

    await (async () => {
      const signedRepository = new MemoryRepository();
      const app = await buildApp({ config, repository: signedRepository, providers });
      const fixture = signingFixture();
      await registerSigningIdentity(signedRepository, fixture);
      const firstPayload = { id: "00000000-0000-4000-8000-000000000020", name: "Signed one" };
      const first = fixture.createEvent(
        "00000000-0000-4000-8000-000000000021",
        firstPayload.id,
        1,
        "0".repeat(64),
        firstPayload,
      );
      const secondPayload = { id: "00000000-0000-4000-8000-000000000022", name: "Signed two" };
      const second = fixture.createEvent(
        "00000000-0000-4000-8000-000000000023",
        secondPayload.id,
        2,
        signedEventHash(first),
        secondPayload,
      );
      await signedRepository.appendSignedEvents(
        headers["x-tenant-id"],
        { ...fixture.deviceKey, deviceId: fixture.deviceId, actorId: headers["x-actor-id"] },
        [first, second],
      );
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: { ...headers, "idempotency-key": "signed-chain-valid" },
        payload: {
          deviceId: fixture.deviceId,
          deviceKey: fixture.deviceKey,
          operations: [
            {
              id: first.eventId, entityType: "supplier", entityId: first.aggregateId,
              action: "upsert", payload: firstPayload, event: first,
            },
            {
              id: second.eventId, entityType: "supplier", entityId: second.aggregateId,
              action: "upsert", payload: secondPayload, event: second,
            },
          ],
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.accepted).toEqual([first.eventId, second.eventId]);
      expect(response.json().data.chainHead).toBe(second.eventHash);

      const conflictPayload = { name: "Conflicting signed edit" };
      const conflictEvent = fixture.createEvent(
        "00000000-0000-4000-8000-000000000024",
        first.aggregateId,
        3,
        second.eventHash,
        conflictPayload,
      );
      await expect(signedRepository.appendSignedEvents(
        headers["x-tenant-id"],
        { ...fixture.deviceKey, deviceId: fixture.deviceId, actorId: headers["x-actor-id"] },
        [{ ...second, signature: Buffer.alloc(64).toString("base64") }],
      )).rejects.toMatchObject({ code: "INVALID_EVENT_CHAIN" });
      await expect(signedRepository.appendSignedEvents(
        headers["x-tenant-id"],
        { ...fixture.deviceKey, deviceId: fixture.deviceId, actorId: headers["x-actor-id"] },
        [second, conflictEvent],
      )).rejects.toMatchObject({ code: "INVALID_EVENT_CHAIN" });
      const conflict = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: { ...headers, "idempotency-key": "signed-chain-conflict" },
        payload: {
          deviceId: fixture.deviceId,
          deviceKey: fixture.deviceKey,
          operations: [{
            id: conflictEvent.eventId, entityType: "supplier", entityId: first.aggregateId,
            action: "upsert", expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
            payload: conflictPayload, event: conflictEvent,
          }],
        },
      });
      expect(conflict.json().data.conflicts).toHaveLength(1);

      const afterConflictPayload = {
        id: "00000000-0000-4000-8000-000000000025",
        name: "After conflict",
      };
      const afterConflictEvent = fixture.createEvent(
        "00000000-0000-4000-8000-000000000026",
        afterConflictPayload.id,
        4,
        conflictEvent.eventHash,
        afterConflictPayload,
      );
      const afterConflict = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: { ...headers, "idempotency-key": "signed-after-conflict" },
        payload: {
          deviceId: fixture.deviceId,
          deviceKey: fixture.deviceKey,
          operations: [{
            id: afterConflictEvent.eventId, entityType: "supplier",
            entityId: afterConflictEvent.aggregateId, action: "upsert",
            payload: afterConflictPayload, event: afterConflictEvent,
          }],
        },
      });
      expect(afterConflict.statusCode).toBe(200);
      expect(afterConflict.json().data.accepted).toEqual([afterConflictEvent.eventId]);
      await app.close();
    });

    await (async () => {
      const signedRepository = new MemoryRepository();
      const app = await buildApp({ config, repository: signedRepository, providers });
      const fixture = signingFixture();
      await registerSigningIdentity(signedRepository, fixture);
      const aggregateId = "00000000-0000-4000-8000-000000000030";
      const originalPayload = { id: aggregateId, name: "Original" };
      const event = fixture.createEvent(
        "00000000-0000-4000-8000-000000000031",
        aggregateId,
        1,
        "0".repeat(64),
        originalPayload,
      );
      const tamperedPayload = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: { ...headers, "idempotency-key": "signed-bad-payload" },
        payload: {
          deviceId: fixture.deviceId,
          deviceKey: fixture.deviceKey,
          operations: [{
            id: event.eventId, entityType: "supplier", entityId: aggregateId,
            action: "upsert", payload: { ...originalPayload, name: "Tampered" }, event,
          }],
        },
      });
      expect(tamperedPayload.statusCode).toBe(400);
      expect(await signedRepository.get("suppliers", headers["x-tenant-id"], aggregateId)).toBeNull();

      const badSignature = { ...event, signature: Buffer.alloc(64).toString("base64") };
      const tamperedSignature = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: { ...headers, "idempotency-key": "signed-bad-signature" },
        payload: {
          deviceId: fixture.deviceId,
          deviceKey: fixture.deviceKey,
          operations: [{
            id: event.eventId, entityType: "supplier", entityId: aggregateId,
            action: "upsert", payload: originalPayload, event: badSignature,
          }],
        },
      });
      expect(tamperedSignature.statusCode).toBe(400);
      expect(await signedRepository.get("suppliers", headers["x-tenant-id"], aggregateId)).toBeNull();
      await app.close();
    })();

    await (async () => {
      const signedRepository = new MemoryRepository();
      const app = await buildApp({ config, repository: signedRepository, providers });
      const fixture = signingFixture();
      await registerSigningIdentity(signedRepository, fixture);
      const aggregateId = "00000000-0000-4000-8000-000000000040";
      const payload = { id: aggregateId, name: "Broken chain" };
      const event = fixture.createEvent(
        "00000000-0000-4000-8000-000000000041",
        aggregateId,
        1,
        "01".repeat(32),
        payload,
      );
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/sync/push",
        headers: { ...headers, "idempotency-key": "signed-wrong-prev" },
        payload: {
          deviceId: fixture.deviceId,
          deviceKey: fixture.deviceKey,
          operations: [{
            id: event.eventId, entityType: "supplier", entityId: aggregateId,
            action: "upsert", payload, event,
          }],
        },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: "INVALID_EVENT_CHAIN" } });
      expect(await signedRepository.get("suppliers", headers["x-tenant-id"], aggregateId)).toBeNull();
      await app.close();
    })();
    expect(pushed.statusCode).toBe(200);
    expect(pushed.json().data.accepted).toEqual([operationId]);
    expect(pushed.json().data.applied[0].resource).not.toHaveProperty("tenantId");

    const pulled = await app.inject({
      method: "GET",
      url: "/api/v1/sync/pull",
      headers,
    });
    expect(pulled.statusCode).toBe(200);
    expect(pulled.json().data.changes[0].entity).not.toHaveProperty("tenantId");
    expect(pulled.json().data.changes).toEqual([
      expect.objectContaining({
        entityType: "supplier",
        entity: expect.objectContaining({ id: supplierId, region: "Kaffa" }),
      }),
    ]);

    await repository.create("shipments", headers["x-tenant-id"], { reference: "SHIP-CURSOR" });
    const nonMobileOnly = await app.inject({
      method: "GET",
      url: `/api/v1/sync/pull?cursor=${pulled.json().data.cursor}`,
      headers,
    });
    expect(nonMobileOnly.json().data.changes).toEqual([]);
    expect(nonMobileOnly.json().data.cursor).not.toBe(pulled.json().data.cursor);

    const baseSupplier = await repository.get("suppliers", headers["x-tenant-id"], supplierId);
    await repository.update("suppliers", headers["x-tenant-id"], supplierId, {
      name: "Server edit",
    });
    const conflictOperationId = "00000000-0000-4000-8000-000000000013";
    const conflictPayload = { name: "Mobile edit" };
    const conflictEvent = mobileFixture.createEvent(
      conflictOperationId,
      supplierId,
      2,
      initialEvent.eventHash,
      conflictPayload,
    );
    const conflicted = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...headers, "idempotency-key": conflictOperationId },
      payload: {
        deviceId: mobileFixture.deviceId,
        deviceKey: mobileFixture.deviceKey,
        operations: [{
          id: conflictOperationId,
          entityType: "supplier",
          entityId: supplierId,
          action: "upsert",
          expectedUpdatedAt: baseSupplier?.updatedAt,
          payload: conflictPayload,
          event: conflictEvent,
        }],
      },
    });
    expect(conflicted.json().data.accepted).toEqual([]);
    expect(conflicted.json().data.conflicts).toEqual([
      expect.objectContaining({
        operationId: conflictOperationId,
        entityType: "supplier",
        entityId: supplierId,
        remote: expect.objectContaining({ name: "Server edit" }),
      }),
    ]);
    await app.close();
  });

  it("accepts an exact signed-event replay after append but before an idempotency response", async () => {
    const app = await buildApp({ config, repository, providers });
    const fixture = signingFixture();
    await registerSigningIdentity(repository, fixture);
    const aggregateId = "00000000-0000-4000-8000-000000000050";
    const operationId = "00000000-0000-4000-8000-000000000051";
    const payload = { id: aggregateId, name: "Recovered replay" };
    const event = fixture.createEvent(operationId, aggregateId, 1, "0".repeat(64), payload);

    await repository.appendSignedEvents(
      headers["x-tenant-id"],
      { ...fixture.deviceKey, deviceId: fixture.deviceId, actorId: headers["x-actor-id"] },
      [event],
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...headers, "idempotency-key": "signed-exact-replay" },
      payload: {
        deviceId: fixture.deviceId,
        deviceKey: fixture.deviceKey,
        operations: [{
          id: operationId,
          entityType: "supplier",
          entityId: aggregateId,
          action: "upsert",
          payload,
          event,
        }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      accepted: [operationId],
      chainHead: event.eventHash,
    });
    expect(await repository.get("suppliers", headers["x-tenant-id"], aggregateId))
      .toMatchObject({ name: "Recovered replay" });
    await app.close();
  });

  it("requires signed events for mobile suppliers and blocks the protected legacy bypass", async () => {
    const app = await buildApp({ config, repository, providers });
    const unsignedMobile = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...headers, "idempotency-key": "unsigned-mobile" },
      payload: {
        operations: [{
          id: "00000000-0000-4000-8000-000000000060",
          entityType: "supplier",
          entityId: "00000000-0000-4000-8000-000000000061",
          action: "upsert",
          payload: { name: "Unsigned" },
        }],
      },
    });
    expect(unsignedMobile.statusCode).toBe(400);
    expect(unsignedMobile.json()).toMatchObject({ error: { code: "SIGNED_EVENT_REQUIRED" } });

    const fixture = signingFixture();
    const missingEvent = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...headers, "idempotency-key": "missing-mobile-event" },
      payload: {
        deviceId: fixture.deviceId,
        deviceKey: fixture.deviceKey,
        operations: [{
          id: "00000000-0000-4000-8000-000000000062",
          entityType: "supplier",
          entityId: "00000000-0000-4000-8000-000000000063",
          action: "upsert",
          payload: { name: "Missing event" },
        }],
      },
    });
    expect(missingEvent.statusCode).toBe(400);
    expect(missingEvent.json()).toMatchObject({ error: { code: "INVALID_SIGNED_EVENT" } });

    const legacySupplier = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...headers, "idempotency-key": "legacy-supplier" },
      payload: {
        operations: [{
          resourceType: "suppliers",
          payload: { name: "Legacy bypass" },
        }],
      },
    });
    expect(legacySupplier.statusCode).toBe(400);
    expect(legacySupplier.json()).toMatchObject({ error: { code: "SIGNED_EVENT_REQUIRED" } });
    await app.close();
  });

  it("rejects a signed event replayed into another tenant", async () => {
    const app = await buildApp({ config, repository, providers });
    const fixture = signingFixture();
    const aggregateId = "00000000-0000-4000-8000-000000000070";
    const operationId = "00000000-0000-4000-8000-000000000071";
    const payload = { id: aggregateId, name: "Tenant A" };
    const event = fixture.createEvent(operationId, aggregateId, 1, "0".repeat(64), payload);
    const otherTenant = "00000000-0000-4000-8000-000000000009";

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: {
        ...headers,
        "x-tenant-id": otherTenant,
        "idempotency-key": "cross-tenant-replay",
      },
      payload: {
        deviceId: fixture.deviceId,
        deviceKey: fixture.deviceKey,
        operations: [{
          id: operationId,
          entityType: "supplier",
          entityId: aggregateId,
          action: "upsert",
          payload,
          event,
        }],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_SIGNED_EVENT" } });
    expect(await repository.get("suppliers", otherTenant, aggregateId)).toBeNull();
    await app.close();
  });

  it("rejects rebinding a device to another key and actor", async () => {
    const app = await buildApp({ config, repository, providers });
    const original = signingFixture();
    await registerSigningIdentity(repository, original);
    const firstPayload = {
      id: "00000000-0000-4000-8000-000000000080",
      name: "Original binding",
    };
    const first = original.createEvent(
      "00000000-0000-4000-8000-000000000081",
      firstPayload.id,
      1,
      "0".repeat(64),
      firstPayload,
    );
    const firstResponse = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...headers, "idempotency-key": "device-binding-first" },
      payload: {
        deviceId: original.deviceId,
        deviceKey: original.deviceKey,
        operations: [{
          id: first.eventId, entityType: "supplier", entityId: first.aggregateId,
          action: "upsert", payload: firstPayload, event: first,
        }],
      },
    });
    expect(firstResponse.statusCode).toBe(200);

    const otherActor = "00000000-0000-4000-8000-000000000099";
    await expect(repository.appendSignedEvents(
      headers["x-tenant-id"],
      { ...original.deviceKey, deviceId: original.deviceId, actorId: otherActor },
      [first],
    )).rejects.toMatchObject({ code: "DEVICE_KEY_MISMATCH" });

    const rebound = signingFixture({ actorId: otherActor, deviceId: original.deviceId });
    const reboundPayload = {
      id: "00000000-0000-4000-8000-000000000082",
      name: "Rebound device",
    };
    const reboundEvent = rebound.createEvent(
      "00000000-0000-4000-8000-000000000083",
      reboundPayload.id,
      2,
      first.eventHash,
      reboundPayload,
    );
    const reboundResponse = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: {
        ...headers,
        "x-actor-id": otherActor,
        "idempotency-key": "device-binding-rejected",
      },
      payload: {
        deviceId: rebound.deviceId,
        deviceKey: rebound.deviceKey,
        operations: [{
          id: reboundEvent.eventId, entityType: "supplier", entityId: reboundEvent.aggregateId,
          action: "upsert", payload: reboundPayload, event: reboundEvent,
        }],
      },
    });
    expect(reboundResponse.statusCode).toBe(409);
    expect(reboundResponse.json()).toMatchObject({ error: { code: "DEVICE_KEY_MISMATCH" } });
    expect(await repository.get("suppliers", headers["x-tenant-id"], reboundPayload.id)).toBeNull();
    await app.close();
  });

  it("rejects mass-balance mismatches with the stable error envelope", async () => {
    const app = await buildApp({ config, repository, providers });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/shipments",
      headers,
      payload: {
        reference: "SHIP-1",
        destinationCountryCode: "DE",
        quantityKg: 100,
        lineage: [{
          sourceType: "lot",
          sourceId: "00000000-0000-4000-8000-000000000003",
          quantityKg: 90,
        }],
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "MASS_BALANCE_ERROR" } });
    await app.close();
  });

  it("completes immutable uploads only after provider verification", async () => {
    const app = await buildApp({ config, repository, providers });
    const initiated = await app.inject({
      method: "POST",
      url: "/api/v1/documents/uploads",
      headers,
      payload: {
        fileName: "certificate.pdf",
        mimeType: "application/pdf",
        size: 10,
        sha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
    });
    const documentId = initiated.json().data.document.id;
    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/documents/${documentId}/complete`,
      headers,
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().data).toMatchObject({ status: "complete", versionId: "version-1" });
    const repeated = await app.inject({
      method: "POST",
      url: `/api/v1/documents/${documentId}/complete`,
      headers,
    });
    expect(repeated.statusCode).toBe(409);
    await app.close();
  });

  it("reports sync conflicts and replays idempotent pushes", async () => {
    const shipment = await repository.create("shipments", headers["x-tenant-id"], {
      reference: "Original",
    });
    const app = await buildApp({ config, repository, providers });
    const payload = {
      operations: [{
        resourceType: "shipments",
        resourceId: shipment.id,
        expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
        payload: { name: "Offline edit" },
      }],
    };
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...headers, "idempotency-key": "device-op-1" },
      payload,
    });
    expect(first.json().data.conflicts).toHaveLength(1);
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...headers, "idempotency-key": "device-op-1" },
      payload,
    });
    expect(replay.json().meta.replayed).toBe(true);
    await app.close();
  });

  it("processes provider-backed jobs and records explicit provider failures", async () => {
    const analysis = await repository.create("analyses", headers["x-tenant-id"], {
      status: "queued",
      attempts: 0,
      nextAttemptAt: 0,
      request: {},
    });
    expect(await processOne({ repository, ...providers })).toBe(true);
    expect(await repository.get("analyses", headers["x-tenant-id"], analysis.id)).toMatchObject({
      status: "complete",
      result: { deforestationDetected: false },
    });

    await repository.create("analyses", headers["x-tenant-id"], {
      status: "queued",
      attempts: 0,
      nextAttemptAt: 0,
      request: {},
    });
    providers.satellite.analyze = async () => {
      throw new AppError("NOT_CONFIGURED", "Sentinel Hub provider is not configured", 503);
    };
    await processOne({ repository, ...providers });
    const jobs = await repository.list("analyses", headers["x-tenant-id"]);
    expect(jobs.some((job) => job.status === "failed" && job.error)).toBe(true);
  });
});
