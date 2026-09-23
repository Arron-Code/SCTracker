export class AuthError extends Error {
  constructor(
    readonly code: "AUTH_NOT_CONFIGURED" | "AUTH_REQUIRED" | "AUTH_ERROR" | "AUTH_TIMEOUT",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthSession = {
  session: {
    activeOrganizationId?: string | null;
  };
  user: {
    id: string;
    email: string;
    name: string;
  };
};

export type AuthOrganization = {
  id: string;
  name: string;
  slug: string;
};

type StoredCookie = {
  value: string;
  expires: string | null;
};

export function withSessionToken(
  storedCookies: string | null,
  token: string,
): string {
  let cookies: Record<string, StoredCookie> = {};
  if (storedCookies) {
    try {
      const parsed = JSON.parse(storedCookies);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        cookies = parsed as Record<string, StoredCookie>;
      }
    } catch {
      cookies = {};
    }
  }

  const sessionCookie = { value: token, expires: null };
  cookies["better-auth.session_token"] = sessionCookie;
  cookies["__Secure-better-auth.session_token"] = sessionCookie;
  return JSON.stringify(cookies);
}

type TokenClient = {
  token: () => Promise<{
    data?: { token?: string | null } | null;
    error?: { message?: string; code?: string } | null;
  }>;
};

export function getNeonAuthUrl(configuredUrl: string | undefined): string | null {
  const value = configuredUrl?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

export async function tokenFromClient(client: TokenClient): Promise<string | null> {
  const result = await client.token();
  if (result.error) {
    throw new AuthError("AUTH_ERROR", result.error.message ?? "Could not obtain an access token.");
  }

  return result.data?.token ?? null;
}

export function passwordResetTokenFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const target = parsed.hostname || parsed.pathname.replace(/^\/+/, "");
    const token = parsed.searchParams.get("token");
    return target === "reset-password" && token ? token : null;
  } catch {
    return null;
  }
}
