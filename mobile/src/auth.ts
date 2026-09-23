import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { jwtClient, organizationClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import {
  AuthError,
  getNeonAuthUrl,
  tokenFromClient,
  withSessionToken,
  type AuthOrganization,
  type AuthSession,
} from "./auth-core";

const baseURL = getNeonAuthUrl(process.env.EXPO_PUBLIC_NEON_AUTH_URL);
const AUTH_REQUEST_TIMEOUT_MS = 15_000;
const MOBILE_AUTH_ORIGIN = "https://sc-tracker-meloy.vercel.app";
const AUTH_COOKIE_STORAGE_KEY = "sctracker.auth_cookie";
const client = baseURL
  ? createAuthClient({
      baseURL,
      fetchOptions: {
        headers: {
          Origin: MOBILE_AUTH_ORIGIN,
        },
      },
      plugins: [
        jwtClient(),
        organizationClient(),
        expoClient({
          scheme: "sctracker",
          storagePrefix: "sctracker.auth",
          storage: SecureStore,
        }),
      ],
    })
  : null;

function requireClient() {
  if (!client) {
    throw new AuthError(
      "AUTH_NOT_CONFIGURED",
      "EXPO_PUBLIC_NEON_AUTH_URL is not configured.",
    );
  }
  return client;
}

function unwrap<T>(
  result: { data?: T | null; error?: { message?: string } | null },
  fallback: string,
): T | null {
  if (result.error) {
    throw new AuthError("AUTH_ERROR", result.error.message ?? fallback);
  }
  return result.data ?? null;
}

export const authConfigured = client !== null;

async function authRequest<T>(request: Promise<T>, timeoutMessage: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new AuthError("AUTH_TIMEOUT", timeoutMessage)),
          AUTH_REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function getAccessToken(): Promise<string | null> {
  return tokenFromClient(requireClient());
}

export async function getSession(): Promise<AuthSession | null> {
  return unwrap(
    await authRequest(
      requireClient().getSession(),
      "The session request timed out. Please try again.",
    ),
    "Could not load the session.",
  ) as AuthSession | null;
}

export async function signIn(email: string, password: string) {
  const result = unwrap(
    await authRequest(
      requireClient().signIn.email({ email, password }),
      "Sign-in timed out. Check your connection and try again.",
    ),
    "Sign-in failed.",
  );
  if (result && typeof result === "object" && "token" in result && typeof result.token === "string") {
    await SecureStore.setItemAsync(
      AUTH_COOKIE_STORAGE_KEY,
      withSessionToken(SecureStore.getItem(AUTH_COOKIE_STORAGE_KEY), result.token),
    );
  }
  return result;
}

export async function requestPasswordReset(email: string, redirectTo: string) {
  return unwrap(
    await authRequest(
      requireClient().requestPasswordReset({ email, redirectTo }),
      "The password reset request timed out. Please try again.",
    ),
    "Could not send the password reset email.",
  );
}

export async function resetPassword(newPassword: string, token: string) {
  return unwrap(
    await authRequest(
      requireClient().resetPassword({ newPassword, token }),
      "The password reset request timed out. Please try again.",
    ),
    "Could not reset the password.",
  );
}

export async function signOut() {
  return unwrap(
    await authRequest(
      requireClient().signOut(),
      "Sign-out timed out. Please try again.",
    ),
    "Sign-out failed.",
  );
}

export async function listOrganizations(): Promise<AuthOrganization[]> {
  return (unwrap(
    await authRequest(
      requireClient().organization.list(),
      "Loading organizations timed out. Please try again.",
    ),
    "Could not load organizations.",
  ) ?? []) as AuthOrganization[];
}

export async function createOrganization(name: string, slug: string) {
  return unwrap(
    await authRequest(
      requireClient().organization.create({
        name,
        slug,
        keepCurrentActiveOrganization: false,
      }),
      "Creating the organization timed out. Please try again.",
    ),
    "Could not create the organization.",
  );
}

export async function setActiveOrganization(organizationId: string) {
  return unwrap(
    await authRequest(
      requireClient().organization.setActive({ organizationId }),
      "Selecting the organization timed out. Please try again.",
    ),
    "Could not select the organization.",
  );
}
