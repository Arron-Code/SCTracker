import { createAuthClient } from "../vendor/neon-auth.mjs";

export class AuthError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "AuthError";
    this.code = code;
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function getAuthBaseUrl(runtime = globalThis.SC_TRACKER_CONFIG ?? {}) {
  const value = runtime.SC_TRACKER_NEON_AUTH_URL ?? runtime.neonAuthUrl;
  return typeof value === "string" && value.trim()
    ? trimTrailingSlash(value.trim())
    : null;
}

function unwrap(result, fallbackMessage) {
  if (result?.error) {
    throw new AuthError(
      result.error.code ?? "AUTH_ERROR",
      result.error.message ?? fallbackMessage,
      result.error,
    );
  }
  return result?.data ?? null;
}

export function tokenFromClient(client) {
  return client.token().then((result) => unwrap(result, "Could not obtain an access token.")?.token ?? null);
}

export function createManagedAuth(options = {}) {
  const baseUrl = getAuthBaseUrl(options.config);
  const client = baseUrl
    ? (options.createClient ?? createAuthClient)(baseUrl)
    : null;

  function requireClient() {
    if (!client) {
      throw new AuthError(
        "AUTH_NOT_CONFIGURED",
        "SC_TRACKER_NEON_AUTH_URL is not configured.",
      );
    }
    return client;
  }

  return {
    baseUrl,
    configured: client !== null,
    getSession: async () => unwrap(
      await requireClient().getSession(),
      "Could not load the session.",
    ),
    token: () => tokenFromClient(requireClient()),
    signIn: async (email, password) => unwrap(
      await requireClient().signIn.email({ email, password }),
      "Sign-in failed.",
    ),
    signUp: async (name, email, password) => unwrap(
      await requireClient().signUp.email({ name, email, password }),
      "Sign-up failed.",
    ),
    signOut: async () => unwrap(
      await requireClient().signOut(),
      "Sign-out failed.",
    ),
    listOrganizations: async () => unwrap(
      await requireClient().organization.list(),
      "Could not load organizations.",
    ) ?? [],
    createOrganization: async (name, slug) => unwrap(
      await requireClient().organization.create({
        name,
        slug,
        keepCurrentActiveOrganization: false,
      }),
      "Could not create the organization.",
    ),
    setActiveOrganization: async (organizationId) => unwrap(
      await requireClient().organization.setActive({ organizationId }),
      "Could not select the organization.",
    ),
  };
}
