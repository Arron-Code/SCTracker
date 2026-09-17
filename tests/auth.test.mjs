import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AuthError,
  createManagedAuth,
  getAuthBaseUrl,
  getAuthProviders,
  tokenFromClient,
} from "../src/auth.mjs";

test("Neon Auth URL is runtime-configurable and missing configuration is explicit", async () => {
  assert.equal(getAuthBaseUrl({}), null);
  assert.equal(
    getAuthBaseUrl({ SC_TRACKER_NEON_AUTH_URL: "https://auth.example.test/auth/" }),
    "https://auth.example.test/auth",
  );

  const auth = createManagedAuth({ config: {} });
  assert.equal(auth.configured, false);
  await assert.rejects(
    auth.getSession(),
    (error) => error instanceof AuthError && error.code === "AUTH_NOT_CONFIGURED",
  );
});

test("configured providers are normalized and unsupported providers are rejected", async () => {
  assert.deepEqual(getAuthProviders({}), ["google"]);
  assert.deepEqual(
    getAuthProviders({ SC_TRACKER_AUTH_PROVIDERS: ["google", "", 42] }),
    ["google"],
  );

  const auth = createManagedAuth({
    config: {
      SC_TRACKER_NEON_AUTH_URL: "https://auth.example.test/auth",
      SC_TRACKER_AUTH_PROVIDERS: ["google"],
    },
    createClient: () => ({ signIn: { social: async () => ({ data: null, error: null }) } }),
  });
  await assert.rejects(
    auth.signInWithProvider("github", "https://app.example.test"),
    (error) => error instanceof AuthError && error.code === "PROVIDER_NOT_CONFIGURED",
  );
});

test("password reset and social sign-in delegate to Neon Auth", async () => {
  const calls = [];
  const auth = createManagedAuth({
    config: {
      SC_TRACKER_NEON_AUTH_URL: "https://auth.example.test/auth",
      SC_TRACKER_AUTH_PROVIDERS: ["google"],
    },
    createClient: () => ({
      requestPasswordReset: async (input) => {
        calls.push(["request", input]);
        return { data: { status: true }, error: null };
      },
      resetPassword: async (input) => {
        calls.push(["reset", input]);
        return { data: { status: true }, error: null };
      },
      signIn: {
        social: async (input) => {
          calls.push(["social", input]);
          return { data: { redirect: true }, error: null };
        },
      },
    }),
  });

  await auth.requestPasswordReset("person@example.test", "https://app.example.test/reset");
  await auth.resetPassword("new-password", "reset-token");
  await auth.signInWithProvider("google", "https://app.example.test");
  assert.deepEqual(calls, [
    ["request", { email: "person@example.test", redirectTo: "https://app.example.test/reset" }],
    ["reset", { newPassword: "new-password", token: "reset-token" }],
    ["social", { provider: "google", callbackURL: "https://app.example.test" }],
  ]);
});

test("token provider delegates to the Neon token API without persistence", async () => {
  let tokenCalls = 0;
  const token = await tokenFromClient({
    token: async () => {
      tokenCalls += 1;
      return { data: { token: "short-lived-jwt" }, error: null };
    },
  });
  assert.equal(token, "short-lived-jwt");
  assert.equal(tokenCalls, 1);

  const sources = await Promise.all([
    readFile(new URL("../src/auth.mjs", import.meta.url), "utf8"),
    readFile(new URL("../mobile/src/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../mobile/src/storage.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(
    sources.join("\n"),
    /(?:localStorage|AsyncStorage)\.setItem\([^)]*(?:token|jwt)/i,
  );
});
