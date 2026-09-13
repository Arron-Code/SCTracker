import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, type Providers } from "../src/app.js";
import type { Config } from "../src/config.js";
import { AppError } from "../src/errors.js";
import { MemoryRepository } from "../src/repository.js";
import { processOne } from "../src/worker.js";

const config: Config = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3000,
  DATABASE_URL: "postgres://unused",
  LOG_LEVEL: "silent",
  DEV_AUTH_ENABLED: true,
  WORKER_POLL_MS: 10,
  SENTINEL_HUB_BASE_URL: "https://example.invalid",
  S3_FORCE_PATH_STYLE: false,
  S3_OBJECT_LOCK_REQUIRED: true,
};
const headers = {
  "x-tenant-id": "00000000-0000-4000-8000-000000000001",
  "x-actor-id": "00000000-0000-4000-8000-000000000002",
};

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
    };
  }, 15_000);

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
      },
    });
    expect(plotResponse.statusCode).toBe(201);
    const ring = plotResponse.json().data.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring.at(-1));
    await app.close();
  }, 15_000);

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
    const supplier = await repository.create("suppliers", headers["x-tenant-id"], {
      name: "Original",
      countryCode: "ET",
    });
    const app = await buildApp({ config, repository, providers });
    const payload = {
      operations: [{
        resourceType: "suppliers",
        resourceId: supplier.id,
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
