export class AuthError extends Error {
  constructor(
    readonly code: "AUTH_NOT_CONFIGURED" | "AUTH_REQUIRED" | "AUTH_ERROR",
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
