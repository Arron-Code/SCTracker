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

export function getNeonAuthUrl(
  environment: Record<string, string | undefined> = process.env,
): string | null {
  const value = environment.EXPO_PUBLIC_NEON_AUTH_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

export async function tokenFromClient(client: TokenClient): Promise<string | null> {
  const result = await client.token();
  if (result.error) {
    throw new AuthError("AUTH_ERROR", result.error.message ?? "Could not obtain an access token.");
  }
  return result.data?.token ?? null;
}
