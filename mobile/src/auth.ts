import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient, jwtClient, organizationClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import {
  AuthError,
  getNeonAuthUrl,
  tokenFromClient,
  type AuthOrganization,
  type AuthSession,
} from "./auth-core";

const baseURL = getNeonAuthUrl(process.env.EXPO_PUBLIC_NEON_AUTH_URL);
const AUTH_REQUEST_TIMEOUT_MS = 15_000;
const MOBILE_AUTH_ORIGIN = "https://sc-tracker-meloy.vercel.app";
const AUTH_SESSION_TOKEN_STORAGE_KEY = "sctracker.auth_session_token";
const EXPO_COOKIE_STORAGE_KEY = "sctracker.auth_cookie";
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
        emailOTPClient(),
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
  result: { data?: T | null; error?: { message?: string; code?: string } | null },
  fallback: string,
): T | null {
  if (result.error) {
    throw new AuthError(result.error.code ?? "AUTH_ERROR", result.error.message ?? fallback);
  }
  return result.data ?? null;
}

export const authConfigured = client !== null;

function authenticatedFetchOptions() {
  const sessionToken = SecureStore.getItem(AUTH_SESSION_TOKEN_STORAGE_KEY);
  return sessionToken
    ? { headers: { Authorization: `Bearer ${sessionToken}` } }
    : {};
}

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
  return tokenFromClient({
    token: () => requireClient().token({
      fetchOptions: authenticatedFetchOptions(),
    }),
  });
}

export async function getSession(): Promise<AuthSession | null> {
  return unwrap(
    await authRequest(
      requireClient().getSession({
        fetchOptions: authenticatedFetchOptions(),
      }),
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
    await Promise.all([
      SecureStore.setItemAsync(AUTH_SESSION_TOKEN_STORAGE_KEY, result.token),
      SecureStore.deleteItemAsync(EXPO_COOKIE_STORAGE_KEY),
    ]);
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

export async function sendEmailVerificationOtp(email: string) {
  return unwrap(
    await authRequest(
      requireClient().emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      }),
      "Sending the verification code timed out. Please try again.",
    ),
    "Could not send the verification code.",
  );
}

export async function verifyEmailOtp(email: string, otp: string) {
  return unwrap(
    await authRequest(
      requireClient().emailOtp.verifyEmail({ email, otp }),
      "Email verification timed out. Please try again.",
    ),
    "Could not verify the email address.",
  );
}

export async function signOut() {
  const result = unwrap(
    await authRequest(
      requireClient().signOut({
        fetchOptions: authenticatedFetchOptions(),
      }),
      "Sign-out timed out. Please try again.",
    ),
    "Sign-out failed.",
  );
  await SecureStore.deleteItemAsync(AUTH_SESSION_TOKEN_STORAGE_KEY);
  return result;
}

export async function listOrganizations(): Promise<AuthOrganization[]> {
  return (unwrap(
    await authRequest(
      requireClient().organization.list({
        fetchOptions: authenticatedFetchOptions(),
      }),
      "Loading organizations timed out. Please try again.",
    ),
    "Could not load organizations.",
  ) ?? []) as AuthOrganization[];
}

export async function setActiveOrganization(organizationId: string) {
  return unwrap(
    await authRequest(
      requireClient().organization.setActive({
        organizationId,
        fetchOptions: authenticatedFetchOptions(),
      }),
      "Selecting the organization timed out. Please try again.",
    ),
    "Could not select the organization.",
  );
}
