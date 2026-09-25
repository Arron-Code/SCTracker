import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import {
  AuthError,
  getNeonAuthUrl,
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
        emailOTPClient(),
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

function getSessionToken() {
  const sessionToken = SecureStore.getItem(AUTH_SESSION_TOKEN_STORAGE_KEY);
  if (!sessionToken) {
    throw new AuthError("AUTH_REQUIRED", "Sign in again to continue.");
  }
  return sessionToken;
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

async function authenticatedAuthRequest<T>(
  path: string,
  fallbackMessage: string,
  init: RequestInit = {},
): Promise<T> {
  if (!baseURL) {
    throw new AuthError(
      "AUTH_NOT_CONFIGURED",
      "EXPO_PUBLIC_NEON_AUTH_URL is not configured.",
    );
  }

  return authRequest(
    (async () => {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("Authorization", `Bearer ${getSessionToken()}`);
      headers.set("Origin", MOBILE_AUTH_ORIGIN);
      if (init.body) headers.set("Content-Type", "application/json");

      const response = await fetch(`${baseURL}${path}`, {
        ...init,
        headers,
      });
      const payload = response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : null;
      if (!response.ok) {
        throw new AuthError(
          payload?.code ?? payload?.error?.code ?? `AUTH_HTTP_${response.status}`,
          payload?.message ?? payload?.error?.message ?? `${fallbackMessage} (${response.status}).`,
        );
      }
      return payload as T;
    })(),
    `${fallbackMessage} Please try again.`,
  );
}

export async function getAccessToken(): Promise<string | null> {
  const result = await authenticatedAuthRequest<{ token?: string | null }>(
    "/token",
    "Could not obtain an access token.",
  );
  return result?.token ?? null;
}

export async function getSession(): Promise<AuthSession | null> {
  return authenticatedAuthRequest<AuthSession | null>(
    "/get-session",
    "Could not load the session.",
  );
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
  const result = await authenticatedAuthRequest<unknown>(
    "/sign-out",
    "Sign-out failed.",
    { method: "POST" },
  );
  await SecureStore.deleteItemAsync(AUTH_SESSION_TOKEN_STORAGE_KEY);
  return result;
}

export async function listOrganizations(): Promise<AuthOrganization[]> {
  const organizations = await authenticatedAuthRequest<unknown>(
    "/organization/list",
    "Could not load organizations.",
  );
  if (!Array.isArray(organizations)) {
    throw new AuthError("INVALID_AUTH_RESPONSE", "Could not load organizations.");
  }
  return organizations as AuthOrganization[];
}

export async function setActiveOrganization(organizationId: string) {
  return authenticatedAuthRequest<AuthOrganization>(
    "/organization/set-active",
    "Could not select the organization.",
    {
      method: "POST",
      body: JSON.stringify({ organizationId }),
    },
  );
}
