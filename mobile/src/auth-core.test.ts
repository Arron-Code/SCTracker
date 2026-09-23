import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AuthError,
  getNeonAuthUrl,
  tokenFromClient,
  passwordResetTokenFromUrl,
} from "./auth-core";

test("mobile Neon Auth URL is runtime-configurable", () => {
  assert.equal(getNeonAuthUrl(undefined), null);
  assert.equal(
    getNeonAuthUrl("https://auth.example.test/auth/"),
    "https://auth.example.test/auth",
  );
});

test("mobile auth uses an Expo-inlineable Neon Auth environment access", async () => {
  const source = await readFile(new URL("./auth.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /getNeonAuthUrl\(process\.env\.EXPO_PUBLIC_NEON_AUTH_URL\)/,
  );
});

test("mobile auth sends a trusted HTTPS Origin without redirecting email sign-in", async () => {
  const source = await readFile(new URL("./auth.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /MOBILE_AUTH_ORIGIN = "https:\/\/[^"]+"/,
  );
  assert.match(
    source,
    /fetchOptions:\s*\{[\s\S]*Origin: MOBILE_AUTH_ORIGIN,[\s\S]*\}/,
  );
  assert.match(source, /signIn\.email\(\{ email, password \}\)/);
  assert.match(
    source,
    /SecureStore\.setItemAsync\(AUTH_SESSION_TOKEN_STORAGE_KEY, result\.token\)/,
  );
  assert.match(source, /SecureStore\.deleteItemAsync\(EXPO_COOKIE_STORAGE_KEY\)/);
  assert.match(source, /Authorization: `Bearer \$\{sessionToken\}`/);
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

test("mobile reset links expose only reset-password tokens", () => {
  assert.equal(
    passwordResetTokenFromUrl("sctracker://reset-password?token=temporary-token"),
    "temporary-token",
  );
  assert.equal(passwordResetTokenFromUrl("sctracker://other?token=temporary-token"), null);
  assert.equal(passwordResetTokenFromUrl("not-a-url"), null);
});
