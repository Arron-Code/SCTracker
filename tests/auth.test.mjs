import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AuthError,
  createManagedAuth,
  getAuthBaseUrl,
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
