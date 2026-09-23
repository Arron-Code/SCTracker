import { generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, type Providers } from "../src/app.js";
import type { Config } from "../src/config.js";
import { authIdentityUuid } from "../src/auth.js";
import { MemoryRepository } from "../src/repository.js";
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

const tenantId = "00000000-0000-4000-8000-000000000101";
const actorId = "00000000-0000-4000-8000-000000000102";
const adminHeaders = {
  "x-tenant-id": tenantId,
  "x-actor-id": actorId,
  "x-actor-roles": "organization_admin",
};
const memberHeaders = {
  "x-tenant-id": tenantId,
  "x-actor-id": actorId,
};

let signingKeyCounter = 0;

function signingFixture(options: {
  tenant?: string;
  actor?: string;
  deviceId?: string;
} = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const resolvedTenant = options.tenant ?? tenantId;
  const resolvedActor = options.actor ?? actorId;
  const resolvedDeviceId = options.deviceId ?? "00000000-0000-4000-8000-000000000120";
  const publicKeyBase64 = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x!, "base64url"),
    Buffer.from(jwk.y!, "base64url"),
  ]).toString("base64");
  const keyId = `identity-key-${signingKeyCounter += 1}`;
  const createEvent = (
    eventId: string,
    aggregateId: string,
    sequence: number,
    prevHash: string,
    payload: Record<string, unknown>,
  ): SignedEvent => {
    const unsigned = {
      schema: 1 as const,
      tenantId: resolvedTenant,
      eventId,
      eventType: "supplier.upsert",
      aggregateId,
      sequence,
      prevHash,
      reportedUtc: "2026-09-18T00:00:00.000Z",
      deviceId: resolvedDeviceId,
      actorId: resolvedActor,
      payloadHash: sha256Hex(payload),
      keyId,
      eventHash: "",
      signature: "",
      payload,
    };
    const hashed = { ...unsigned, eventHash: signedEventHash(unsigned) };
    return {
      ...hashed,
      signature: sign(
        "sha256",
        Buffer.from(eventSigningMaterial(hashed)),
        { key: privateKey, dsaEncoding: "ieee-p1363" },
      ).toString("base64"),
    };
  };
  return {
    tenantId: resolvedTenant,
    actorId: resolvedActor,
    deviceId: resolvedDeviceId,
    deviceKey: { keyId, algorithm: "P256-SHA256" as const, publicKeyBase64 },
    createEvent,
  };
}

async function registerSigningIdentity(
  repository: MemoryRepository,
  fixture: ReturnType<typeof signingFixture>,
): Promise<void> {
  await repository.upsertOrganizationUser(fixture.tenantId, {
    actorId: fixture.actorId,
    roles: ["operator"],
  });
  await repository.registerDevice(fixture.tenantId, fixture.actorId, {
    deviceId: fixture.deviceId,
    displayName: "Identity device",
    platform: "android",
    appVersion: "2.0.0",
    osVersion: "14",
    keyProtection: "strongbox",
    metadata: { build: "release" },
  });
  await repository.registerSigningKey(
    fixture.tenantId,
    fixture.actorId,
    fixture.deviceId,
    fixture.deviceKey,
  );
}

describe("identity and trust backend", () => {
  let repository: MemoryRepository;
  let providers: Providers;

  beforeEach(() => {
    repository = new MemoryRepository();
    providers = {
      storage: {
        async initiateUpload() {
          throw new Error("unused");
        },
        async verifyUpload() {
          throw new Error("unused");
        },
        async putImmutable() {
          throw new Error("unused");
        },
        async getDownloadUrl() {
          throw new Error("unused");
        },
      },
      satellite: {
        async analyze() {
          throw new Error("unused");
        },
      },
      dds: {
        async submit() {
          throw new Error("unused");
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
  });

  it("requires an organization_admin role for admin identity APIs", async () => {
    const app = await buildApp({ config, repository, providers });
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: memberHeaders,
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: adminHeaders,
    });
    expect(allowed.statusCode).toBe(200);
    await app.close();
  }, 15_000);

  it("uses verified JWT roles and ignores test role headers in production", async () => {
    const productionConfig: Config = {
      ...config,
      NODE_ENV: "production",
      DEV_AUTH_ENABLED: false,
      NEON_AUTH_BASE_URL: "https://auth.example.test/sctracker/auth",
    };
    const app = await buildApp({
      config: productionConfig,
      repository,
      providers,
      authVerifier: async () => ({
        sub: "user-prod",
        exp: Math.floor(Date.now() / 1000) + 300,
        activeOrganizationId: "org-prod",
      }),
    });
    const ignoredHeader = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: {
        authorization: "Bearer valid",
        "x-actor-roles": "organization_admin",
      },
    });
    expect(ignoredHeader.statusCode).toBe(403);
    await app.close();

    const adminApp = await buildApp({
      config: productionConfig,
      repository,
      providers,
      authVerifier: async () => ({
        sub: "user-prod",
        exp: Math.floor(Date.now() / 1000) + 300,
        activeOrganizationId: "org-prod",
        roles: ["organization_admin"],
      }),
    });
    const allowed = await adminApp.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: { authorization: "Bearer valid" },
    });
    expect(allowed.statusCode).toBe(200);
    await adminApp.close();
  });

  it("keeps admin identity listings tenant-isolated", async () => {
    await repository.upsertOrganizationUser(tenantId, {
      actorId,
      displayName: "Tenant A",
      roles: ["operator"],
    });
    await repository.upsertOrganizationUser("00000000-0000-4000-8000-000000000199", {
      actorId: "00000000-0000-4000-8000-000000000198",
      displayName: "Tenant B",
      roles: ["operator"],
    });
    const app = await buildApp({ config, repository, providers });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: adminHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      expect.objectContaining({ actorId, displayName: "Tenant A" }),
    ]);
    await app.close();
  });

  it("protects the last active organization administrator from lockout", async () => {
    await repository.upsertOrganizationUser(tenantId, {
      actorId,
      displayName: "Only admin",
      roles: ["organization_admin"],
      status: "active",
    });
    const app = await buildApp({ config, repository, providers });
    const demote = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/users/${actorId}`,
      headers: adminHeaders,
      payload: { roles: ["operator"], status: "active" },
    });
    expect(demote.statusCode).toBe(409);
    expect(demote.json().error.code).toBe("LAST_ADMIN_REQUIRED");

    const suspendTrust = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${actorId}/trust`,
      headers: adminHeaders,
      payload: {
        state: "SUSPENDED",
        reason: "access review",
        details: {},
      },
    });
    expect(suspendTrust.statusCode).toBe(409);
    expect(suspendTrust.json().error.code).toBe("LAST_ADMIN_REQUIRED");

    const secondAdminId = "00000000-0000-4000-8000-000000000166";
    await repository.upsertOrganizationUser(tenantId, {
      actorId: secondAdminId,
      displayName: "Backup admin",
      roles: ["organization_admin"],
      status: "active",
    });
    const allowed = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/users/${actorId}`,
      headers: adminHeaders,
      payload: { roles: ["operator"], status: "active" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().data.roles).toEqual(["operator"]);
    await app.close();
  });

  it("updates user trust through the standardized admin route", async () => {
    await repository.upsertOrganizationUser(tenantId, {
      actorId,
      displayName: "Tenant user",
      roles: ["operator"],
    });
    const app = await buildApp({ config, repository, providers });
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${actorId}/trust`,
      headers: adminHeaders,
      payload: {
        state: "ORGANIZATION_VERIFIED",
        reason: "manual verification complete",
        details: { reviewer: "qa-1" },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      scopeType: "user",
      scopeId: actorId,
      state: "ORGANIZATION_VERIFIED",
    });
    await app.close();
  });

  it("enforces suspended user trust across normal API routes", async () => {
    const suspendedActorId = "00000000-0000-4000-8000-000000000177";
    await repository.upsertOrganizationUser(tenantId, {
      actorId: suspendedActorId,
      displayName: "Suspended user",
      roles: ["operator"],
    });
    const app = await buildApp({ config, repository, providers });
    const trust = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${suspendedActorId}/trust`,
      headers: adminHeaders,
      payload: {
        state: "SUSPENDED",
        reason: "Access review",
        details: {},
      },
    });
    expect(trust.statusCode).toBe(200);
    const blocked = await app.inject({
      method: "GET",
      url: "/api/v1/suppliers",
      headers: {
        "x-tenant-id": tenantId,
        "x-actor-id": suspendedActorId,
      },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("USER_BLOCKED");
    await app.close();
  });

  it("rejects new signed sync after admin key revocation while leaving historic data intact", async () => {
    const fixture = signingFixture();
    await registerSigningIdentity(repository, fixture);
    const app = await buildApp({ config, repository, providers });
    const firstPayload = { id: "00000000-0000-4000-8000-000000000130", name: "Before revoke" };
    const firstEvent = fixture.createEvent(
      "00000000-0000-4000-8000-000000000131",
      firstPayload.id,
      1,
      "0".repeat(64),
      firstPayload,
    );

    const accepted = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...memberHeaders, "idempotency-key": "identity-first-sync" },
      payload: {
        deviceId: fixture.deviceId,
        deviceKey: fixture.deviceKey,
        operations: [{
          id: firstEvent.eventId,
          entityType: "supplier",
          entityId: firstPayload.id,
          action: "upsert",
          payload: firstPayload,
          event: firstEvent,
        }],
      },
    });
    expect(accepted.statusCode).toBe(200);

    const revoked = await app.inject({
      method: "POST",
      url: `/api/v1/admin/keys/${fixture.deviceKey.keyId}/revoke`,
      headers: adminHeaders,
      payload: { reason: "device lost" },
    });
    expect(revoked.statusCode).toBe(200);

    const secondPayload = { id: "00000000-0000-4000-8000-000000000132", name: "After revoke" };
    const secondEvent = fixture.createEvent(
      "00000000-0000-4000-8000-000000000133",
      secondPayload.id,
      2,
      firstEvent.eventHash,
      secondPayload,
    );
    const rejected = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...memberHeaders, "idempotency-key": "identity-second-sync" },
      payload: {
        deviceId: fixture.deviceId,
        deviceKey: fixture.deviceKey,
        operations: [{
          id: secondEvent.eventId,
          entityType: "supplier",
          entityId: secondPayload.id,
          action: "upsert",
          payload: secondPayload,
          event: secondEvent,
        }],
      },
    });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toMatchObject({ error: { code: "KEY_REVOKED" } });
    expect(await repository.get("suppliers", tenantId, firstPayload.id))
      .toMatchObject({ name: "Before revoke" });
    expect(await repository.get("suppliers", tenantId, secondPayload.id)).toBeNull();
    await app.close();
  });

  it("blocks new signed sync when trust state suspends the device and records history", async () => {
    const fixture = signingFixture();
    await registerSigningIdentity(repository, fixture);
    const app = await buildApp({ config, repository, providers });
    const trusted = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/devices/${fixture.deviceId}/trust`,
      headers: adminHeaders,
      payload: {
        state: "SUSPENDED",
        reason: "manual review",
        details: { caseId: "CASE-1" },
      },
    });
    expect(trusted.statusCode).toBe(200);

    const history = await app.inject({
      method: "GET",
      url: `/api/v1/admin/identity/trust/history?scopeType=device&scopeId=${fixture.deviceId}`,
      headers: adminHeaders,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().data).toEqual([
      expect.objectContaining({ scopeType: "device", state: "SUSPENDED" }),
    ]);
    const blockedApi = await app.inject({
      method: "GET",
      url: "/api/v1/suppliers",
      headers: { ...memberHeaders, "x-device-id": fixture.deviceId },
    });
    expect(blockedApi.statusCode).toBe(403);
    expect(blockedApi.json().error.code).toBe("DEVICE_BLOCKED");

    const payload = { id: "00000000-0000-4000-8000-000000000140", name: "Blocked by trust" };
    const event = fixture.createEvent(
      "00000000-0000-4000-8000-000000000141",
      payload.id,
      1,
      "0".repeat(64),
      payload,
    );
    const rejected = await app.inject({
      method: "POST",
      url: "/api/v1/sync/push",
      headers: { ...memberHeaders, "idempotency-key": "identity-trust-blocked" },
      payload: {
        deviceId: fixture.deviceId,
        deviceKey: fixture.deviceKey,
        operations: [{
          id: event.eventId,
          entityType: "supplier",
          entityId: payload.id,
          action: "upsert",
          payload,
          event,
        }],
      },
    });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toMatchObject({
      error: {
        code: "TRUST_BLOCKED",
        details: { scopeType: "device", state: "SUSPENDED" },
      },
    });
    await app.close();
  });

  it("stores explicit NOT_CONFIGURED attestation results and exposes challenges and records", async () => {
    const fixture = signingFixture();
    const app = await buildApp({ config, repository, providers });
    const register = await app.inject({
      method: "POST",
      url: "/api/v1/devices/register",
      headers: memberHeaders,
      payload: {
        deviceId: fixture.deviceId,
        displayName: "Identity device",
        platform: "android",
        appVersion: "2.0.0",
        osVersion: "14",
        keyProtection: "strongbox",
        metadata: { build: "release" },
        deviceKey: fixture.deviceKey,
      },
    });
    expect(register.statusCode).toBe(201);
    expect(register.json().data).toMatchObject({
      device: { deviceId: fixture.deviceId },
      key: { keyId: fixture.deviceKey.keyId },
    });

    const challenge = await app.inject({
      method: "POST",
      url: "/api/v1/devices/attestation/challenges",
      headers: memberHeaders,
      payload: {
        deviceId: fixture.deviceId,
        provider: "play_integrity",
        keyId: fixture.deviceKey.keyId,
        metadata: { nonce: "1" },
      },
    });
    expect(challenge.statusCode).toBe(201);
    expect(challenge.json().data.verificationConfigured).toBe(false);

    const attestation = await app.inject({
      method: "POST",
      url: "/api/v1/devices/attestations",
      headers: memberHeaders,
      payload: {
        deviceId: fixture.deviceId,
        provider: "play_integrity",
        keyId: fixture.deviceKey.keyId,
        challengeId: challenge.json().data.challengeId,
        proof: { token: "opaque" },
      },
    });
    expect(attestation.statusCode).toBe(201);
    expect(attestation.json().data).toMatchObject({
      status: "NOT_CONFIGURED",
      verified: false,
      reason: "play_integrity verifier is not configured",
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/devices/attestations",
      headers: memberHeaders,
      payload: {
        deviceId: fixture.deviceId,
        provider: "play_integrity",
        keyId: fixture.deviceKey.keyId,
        challengeId: challenge.json().data.challengeId,
        proof: { token: "opaque" },
      },
    });
    expect(replay.statusCode).toBe(409);
    expect(replay.json().error.code).toBe("INVALID_ATTESTATION_CHALLENGE");

    const adminView = await app.inject({
      method: "GET",
      url: `/api/v1/admin/devices/${fixture.deviceId}/attestations`,
      headers: adminHeaders,
    });
    expect(adminView.statusCode).toBe(200);
    expect(adminView.json().data.challenges).toHaveLength(1);
    expect(adminView.json().data.records).toEqual([
      expect.objectContaining({ status: "NOT_CONFIGURED", verified: false }),
    ]);
    const devices = await app.inject({
      method: "GET",
      url: "/api/v1/admin/devices",
      headers: adminHeaders,
    });
    expect(devices.json().data).toEqual([
      expect.objectContaining({
        deviceId: fixture.deviceId,
        attestationStatus: "NOT_CONFIGURED",
      }),
    ]);
    const keys = await app.inject({
      method: "GET",
      url: "/api/v1/admin/keys",
      headers: adminHeaders,
    });
    expect(keys.json().data).toEqual([
      expect.objectContaining({ keyId: fixture.deviceKey.keyId, trustState: null }),
    ]);
    await app.close();
  });

  it("derives tenant IDs from verified claims for admin access", async () => {
    const organizationId = "org-central";
    const repositoryTenant = authIdentityUuid("organization", organizationId);
    await repository.upsertOrganizationUser(repositoryTenant, {
      actorId: authIdentityUuid("subject", "admin-user"),
      displayName: "Central admin",
      roles: ["operator"],
    });
    const productionConfig: Config = {
      ...config,
      NODE_ENV: "production",
      DEV_AUTH_ENABLED: false,
      NEON_AUTH_BASE_URL: "https://auth.example.test/sctracker/auth",
    };
    const app = await buildApp({
      config: productionConfig,
      repository,
      providers,
      authVerifier: async () => ({
        sub: "admin-user",
        exp: Math.floor(Date.now() / 1000) + 300,
        activeOrganizationId: organizationId,
        roles: ["organization_admin"],
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/users",
      headers: {
        authorization: "Bearer valid",
        "x-tenant-id": tenantId,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      expect.objectContaining({ displayName: "Central admin" }),
    ]);
    await app.close();
  });
});
