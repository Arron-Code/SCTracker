import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { jwtClient, organizationClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import {
  AuthError,
  getNeonAuthUrl,
  tokenFromClient,
  type AuthOrganization,
  type AuthSession,
} from "./auth-core";

const baseURL = getNeonAuthUrl(process.env.EXPO_PUBLIC_NEON_AUTH_URL);
const client = baseURL
  ? createAuthClient({
      baseURL,
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

export async function getAccessToken(): Promise<string | null> {
  return tokenFromClient(requireClient());
}

export async function getSession(): Promise<AuthSession | null> {
  return unwrap(
    await requireClient().getSession(),
    "Could not load the session.",
  ) as AuthSession | null;
}

export async function signIn(email: string, password: string) {
  return unwrap(
    await requireClient().signIn.email({ email, password }),
    "Sign-in failed.",
  );
}

export async function requestPasswordReset(email: string, redirectTo: string) {
  return unwrap(
    await requireClient().requestPasswordReset({ email, redirectTo }),
    "Could not send the password reset email.",
  );
}

export async function resetPassword(newPassword: string, token: string) {
  return unwrap(
    await requireClient().resetPassword({ newPassword, token }),
    "Could not reset the password.",
  );
}

export async function signOut() {
  return unwrap(await requireClient().signOut(), "Sign-out failed.");
}

export async function listOrganizations(): Promise<AuthOrganization[]> {
  return (unwrap(
    await requireClient().organization.list(),
    "Could not load organizations.",
  ) ?? []) as AuthOrganization[];
}

export async function createOrganization(name: string, slug: string) {
  return unwrap(
    await requireClient().organization.create({
      name,
      slug,
      keepCurrentActiveOrganization: false,
    }),
    "Could not create the organization.",
  );
}

export async function setActiveOrganization(organizationId: string) {
  return unwrap(
    await requireClient().organization.setActive({ organizationId }),
    "Could not select the organization.",
  );
}
