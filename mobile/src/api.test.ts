import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { ApiError, configureApiAuth, pullChanges } from "./api";

afterEach(() => {
  configureApiAuth(null);
});

test("mobile API injects a freshly obtained bearer token", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.EXPO_PUBLIC_API_URL;
  let tokenCalls = 0;
  const authorizations: string[] = [];
  process.env.EXPO_PUBLIC_API_URL = "https://api.example.test";
  configureApiAuth(async () => `jwt-${++tokenCalls}`);
  globalThis.fetch = (async (_input, init) => {
    authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
    return new Response(JSON.stringify({ data: { changes: [], cursor: "next" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await pullChanges(null);
    await pullChanges("next");
    assert.deepEqual(authorizations, ["Bearer jwt-1", "Bearer jwt-2"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = originalUrl;
  }
});

test("mobile API fails clearly when auth is not configured", async () => {
  const originalUrl = process.env.EXPO_PUBLIC_API_URL;
  process.env.EXPO_PUBLIC_API_URL = "https://api.example.test";
  try {
    await assert.rejects(
      pullChanges(null),
      (error) => error instanceof ApiError && error.code === "AUTH_NOT_CONFIGURED",
    );
  } finally {
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = originalUrl;
  }
});
