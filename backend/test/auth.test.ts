import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { describe, expect, it } from "vitest";
import { authIdentityUuid, verifyNeonJwt } from "../src/auth.js";
import { buildApp, type Providers } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { MemoryRepository } from "../src/repository.js";

const origin = "https://auth.example.test";
const baseConfig: Config = {
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  PORT: 3000,
  DATABASE_URL: "postgres://unused",
  LOG_LEVEL: "silent",
  DEV_AUTH_ENABLED: false,
  NEON_AUTH_BASE_URL: `${origin}/sctracker/auth`,
  WORKER_POLL_MS: 10,
  SENTINEL_HUB_BASE_URL: "https://example.invalid",
  S3_FORCE_PATH_STYLE: false,
  S3_OBJECT_LOCK_REQUIRED: true,
};

const providers: Providers = {
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
};

async function signedToken(
  claims: Record<string, unknown> = { sub: "user-123", activeOrganizationId: "org-123" },
  expirationTime = Math.floor(Date.now() / 1000) + 300,
) {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  publicJwk.alg = "EdDSA";
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
    .setIssuer(origin)
    .setAudience(origin)
    .setIssuedAt()
    .setExpirationTime(expirationTime)
    .sign(privateKey);
  return { token, jwks: createLocalJWKSet({ keys: [publicJwk] }) };
}

describe("Neon Managed Better Auth", () => {
  it("verifies EdDSA signatures, issuer, audience, and expiration", async () => {
    const { token, jwks } = await signedToken();
    await expect(verifyNeonJwt(token, jwks, origin)).resolves.toMatchObject({
      sub: "user-123",
      activeOrganizationId: "org-123",
    });
    await expect(verifyNeonJwt(token, jwks, "https://wrong.example.test")).rejects.toThrow();

    const { token: expiredToken, jwks: expiredJwks } = await signedToken(
      undefined,
      Math.floor(Date.now() / 1000) - 60,
    );
    await expect(verifyNeonJwt(expiredToken, expiredJwks, origin)).rejects.toThrow();
  });

  it("maps identities to stable, domain-separated UUIDs", () => {
    expect(authIdentityUuid("organization", "same-id")).toBe(
      authIdentityUuid("organization", "same-id"),
    );
    expect(authIdentityUuid("organization", "same-id")).not.toBe(
      authIdentityUuid("subject", "same-id"),
    );
    expect(authIdentityUuid("organization", "same-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("requires a valid bearer token with an active organization", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({
      config: baseConfig,
      repository,
      providers,
      authVerifier: async (token) => {
        if (token !== "valid") throw new Error("signature details");
        return { sub: "user-123", exp: Math.floor(Date.now() / 1000) + 300 };
      },
    });

    const invalid = await app.inject({
      method: "GET",
      url: "/api/v1/suppliers",
      headers: { authorization: "NotBearer valid" },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "A valid bearer token is required" },
    });

    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/suppliers",
    });
    expect(missing.statusCode).toBe(401);

    const badToken = await app.inject({
      method: "GET",
      url: "/api/v1/suppliers",
      headers: { authorization: "Bearer invalid" },
    });
    expect(badToken.statusCode).toBe(401);
    expect(badToken.body).not.toContain("signature details");

    const missingOrg = await app.inject({
      method: "GET",
      url: "/api/v1/suppliers",
      headers: { authorization: "Bearer valid" },
    });
    expect(missingOrg.statusCode).toBe(401);
    expect(missingOrg.body).not.toContain("signature details");
    await app.close();
  }, 120_000);

  it("uses signed claims and ignores tenant authorization headers in production", async () => {
    const repository = new MemoryRepository();
    const organizationId = "org-production";
    await repository.create("suppliers", authIdentityUuid("organization", organizationId), {
      name: "Visible",
    });
    await repository.create("suppliers", "00000000-0000-4000-8000-000000000099", {
      name: "Header tenant",
    });
    const app = await buildApp({
      config: baseConfig,
      repository,
      providers,
      authVerifier: async () => ({
        sub: "user-production",
        activeOrganizationId: organizationId,
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/suppliers",
      headers: {
        authorization: "Bearer valid",
        "x-tenant-id": "00000000-0000-4000-8000-000000000099",
        "x-actor-id": "00000000-0000-4000-8000-000000000098",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0].name).toBe("Visible");
    await app.close();
  }, 120_000);

  it("keeps development header auth but reports missing production configuration", async () => {
    const developmentApp = await buildApp({
      config: { ...baseConfig, NODE_ENV: "test", DEV_AUTH_ENABLED: true },
      repository: new MemoryRepository(),
      providers,
    });
    const development = await developmentApp.inject({
      method: "GET",
      url: "/api/v1/suppliers",
      headers: {
        "x-tenant-id": "00000000-0000-4000-8000-000000000001",
        "x-actor-id": "00000000-0000-4000-8000-000000000002",
      },
    });
    expect(development.statusCode).toBe(200);
    await developmentApp.close();

    const unconfiguredProduction: Config = { ...baseConfig };
    delete unconfiguredProduction.NEON_AUTH_BASE_URL;
    const productionApp = await buildApp({
      config: unconfiguredProduction,
      repository: new MemoryRepository(),
      providers,
    });
    const production = await productionApp.inject({
      method: "GET",
      url: "/api/v1/suppliers",
      headers: {
        "x-tenant-id": "00000000-0000-4000-8000-000000000001",
        "x-actor-id": "00000000-0000-4000-8000-000000000002",
      },
    });
    expect(production.statusCode).toBe(503);
    expect(production.json()).toMatchObject({ error: { code: "AUTH_NOT_CONFIGURED" } });
    await productionApp.close();
  }, 120_000);

  it("prohibits development header auth in production configuration", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgres://unused",
        NODE_ENV: "production",
        DEV_AUTH_ENABLED: "true",
      }),
    ).toThrow("DEV_AUTH_ENABLED must not be enabled in production");
  });
});
