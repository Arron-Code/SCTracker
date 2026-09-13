import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AuthError,
  getNeonAuthUrl,
  tokenFromClient,
} from "./auth-core";

test("mobile Neon Auth URL is runtime-configurable", () => {
  assert.equal(getNeonAuthUrl({}), null);
  assert.equal(
    getNeonAuthUrl({ EXPO_PUBLIC_NEON_AUTH_URL: "https://auth.example.test/auth/" }),
    "https://auth.example.test/auth",
  );
});

test("mobile token provider calls token() for each request and surfaces errors", async () => {
  let calls = 0;
  const client = {
    token: async () => ({
      data: { token: `jwt-${++calls}` },
      error: null,
    }),
  };
  assert.equal(await tokenFromClient(client), "jwt-1");
  assert.equal(await tokenFromClient(client), "jwt-2");

  await assert.rejects(
    tokenFromClient({
      token: async () => ({ data: null, error: { message: "expired" } }),
    }),
    (error) => error instanceof AuthError && error.code === "AUTH_ERROR",
  );
});

test("mobile auth code never persists raw JWTs in AsyncStorage or localStorage", async () => {
  const sources = await Promise.all([
    readFile(new URL("./auth.ts", import.meta.url), "utf8"),
    readFile(new URL("./auth-core.ts", import.meta.url), "utf8"),
    readFile(new URL("./storage.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(
    sources.join("\n"),
    /(?:localStorage|AsyncStorage)\.setItem\([^)]*(?:token|jwt)/i,
  );
});
