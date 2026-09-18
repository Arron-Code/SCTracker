import test from "node:test";
import assert from "node:assert/strict";

import {
  ApiError,
  createApiClient,
  getRuntimeConfig,
} from "../src/api.mjs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("runtime configuration defaults to same-origin API and requires explicit mock mode", () => {
  assert.deepEqual(getRuntimeConfig({}), {
    apiUrl: "/api/v1",
    mockApi: false,
  });
  assert.deepEqual(
    getRuntimeConfig({
      SC_TRACKER_API_URL: "https://api.example.test/api/v1/",
      mockApi: true,
    }),
    {
      apiUrl: "https://api.example.test/api/v1",
      mockApi: true,
    },
  );
});

test("API errors preserve the provider code and never become success data", async () => {
  const client = createApiClient({
    config: { apiUrl: "/api/v1" },
    tokenProvider: async () => "jwt-test",
    fetchImpl: async () =>
      jsonResponse(
        { error: { code: "NOT_CONFIGURED", message: "Provider unavailable" } },
        503,
      ),
  });

  await assert.rejects(
    client.analyses.create({ plotId: "plot-1" }),
    (error) =>
      error instanceof ApiError
      && error.code === "NOT_CONFIGURED"
      && error.status === 503,
  );
});

test("resource and job requests use the documented endpoints and JSON shapes", async () => {
  const calls = [];
  const client = createApiClient({
    config: { SC_TRACKER_API_URL: "https://api.example.test/api/v1" },
    tokenProvider: async () => "jwt-test",
    fetchImpl: async (url, init = {}) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body) : undefined,
        authorization: new Headers(init.headers).get("authorization"),
      });
      return jsonResponse({ data: { id: "created-1", status: "queued" } });
    },
  });

  await client.suppliers.list();
  await client.suppliers.create({ name: "Kaffa", countryCode: "ET", contactEmail: "ops@example.test" });
  await client.plots.list();
  await client.plots.create({ supplierId: "sup-1", geometry: { type: "Point", coordinates: [36.8, 7.7] } });
  await client.shipments.list();
  await client.shipments.create({ reference: "IMP-1", productCode: "0901", quantityKg: 1000, originCountryCode: "ET" });
  await client.analyses.create({ plotId: "plot-1" });
  await client.analyses.get("analysis/1");
  await client.evidencePacks.create({ shipmentId: "shipment-1" });
  await client.evidencePacks.get("pack/1");
  await client.dds.create({ shipmentId: "shipment-1", action: "validate" });
  await client.dds.get("dds/1");
  await client.administration.users();
  await client.administration.devices();
  await client.administration.keys();
  await client.administration.setUserTrust("actor/1", { state: "SUSPENDED", reason: "review", details: {} });
  await client.administration.setDeviceTrust("device/1", { state: "LOCALLY_TRUSTED", reason: "approved", details: {} });
  await client.administration.revokeKey("key/1", "compromised");

  assert.deepEqual(
    calls.map(({ url, method }) => [url, method]),
    [
      ["https://api.example.test/api/v1/suppliers", "GET"],
      ["https://api.example.test/api/v1/suppliers", "POST"],
      ["https://api.example.test/api/v1/plots", "GET"],
      ["https://api.example.test/api/v1/plots", "POST"],
      ["https://api.example.test/api/v1/shipments", "GET"],
      ["https://api.example.test/api/v1/shipments", "POST"],
      ["https://api.example.test/api/v1/analyses", "POST"],
      ["https://api.example.test/api/v1/analyses/analysis%2F1", "GET"],
      ["https://api.example.test/api/v1/evidence-packs", "POST"],
      ["https://api.example.test/api/v1/evidence-packs/pack%2F1", "GET"],
      ["https://api.example.test/api/v1/dds/submissions", "POST"],
      ["https://api.example.test/api/v1/dds/submissions/dds%2F1", "GET"],
      ["https://api.example.test/api/v1/admin/users", "GET"],
      ["https://api.example.test/api/v1/admin/devices", "GET"],
      ["https://api.example.test/api/v1/admin/keys", "GET"],
      ["https://api.example.test/api/v1/admin/users/actor%2F1/trust", "PATCH"],
      ["https://api.example.test/api/v1/admin/devices/device%2F1/trust", "PATCH"],
      ["https://api.example.test/api/v1/admin/keys/key%2F1/revoke", "POST"],
    ],
  );
  assert.deepEqual(calls[10].body, {
    shipmentId: "shipment-1",
    action: "validate",
  });
  assert.ok(calls.every((call) => call.authorization === "Bearer jwt-test"));
});

test("document upload initiates, uploads bytes, and completes the document", async () => {
  const calls = [];
  const client = createApiClient({
    config: { apiUrl: "/api/v1" },
    tokenProvider: async () => "jwt-test",
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (url === "/api/v1/documents/uploads") {
        return jsonResponse({
          data: {
            documentId: "doc-1",
            uploadUrl: "https://uploads.example.test/doc-1",
          },
        });
      }
      if (url === "https://uploads.example.test/doc-1") {
        return new Response(null, { status: 200 });
      }
      return jsonResponse({ data: { id: "doc-1", status: "completed" } });
    },
  });
  const file = new Blob(["evidence"], { type: "application/pdf" });
  Object.defineProperty(file, "name", { value: "evidence.pdf" });

  const result = await client.documents.upload(file, {
    shipmentId: "shipment-1",
    category: "legality",
  });

  assert.equal(result.data.status, "completed");
  assert.equal(calls[0].url, "/api/v1/documents/uploads");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    fileName: "evidence.pdf",
    contentType: "application/pdf",
    size: 8,
    shipmentId: "shipment-1",
    category: "legality",
  });
  assert.equal(calls[1].init.method, "PUT");
  assert.equal(calls[2].url, "/api/v1/documents/doc-1/complete");
});

test("API requests obtain a fresh token and fail clearly when auth is unavailable", async () => {
  let tokenCalls = 0;
  const client = createApiClient({
    config: { apiUrl: "/api/v1" },
    tokenProvider: async () => `jwt-${++tokenCalls}`,
    fetchImpl: async (_url, init) => jsonResponse({
      data: { authorization: new Headers(init.headers).get("authorization") },
    }),
  });

  assert.equal((await client.suppliers.list()).data.authorization, "Bearer jwt-1");
  assert.equal((await client.plots.list()).data.authorization, "Bearer jwt-2");
  assert.equal(tokenCalls, 2);

  const unconfigured = createApiClient({
    config: { apiUrl: "/api/v1" },
    fetchImpl: async () => jsonResponse({ data: [] }),
  });
  await assert.rejects(
    unconfigured.suppliers.list(),
    (error) => error instanceof ApiError && error.code === "AUTH_NOT_CONFIGURED",
  );
});
