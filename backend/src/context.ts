import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { authIdentityUuid, createNeonJwtVerifier, type JwtVerifier } from "./auth.js";
import { AppError } from "./errors.js";
import type { Config } from "./config.js";

export interface ActorContext {
  tenantId: string;
  actorId: string;
  deviceId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    actor: ActorContext;
  }
}

interface ActorContextOptions {
  config: Config;
  verifier?: JwtVerifier;
}

const unauthenticated = (): AppError =>
  new AppError("UNAUTHENTICATED", "A valid bearer token is required", 401);

export const actorContext = fp(async (app: FastifyInstance, options: ActorContextOptions) => {
  const verifier = options.verifier ??
    (options.config.NEON_AUTH_BASE_URL
      ? createNeonJwtVerifier(options.config.NEON_AUTH_BASE_URL)
      : undefined);

  app.decorateRequest("actor");
  app.addHook("preHandler", async (request: FastifyRequest) => {
    if (!request.url.startsWith("/api/")) return;

    if (options.config.DEV_AUTH_ENABLED && options.config.NODE_ENV !== "production") {
      const tenantId = request.headers["x-tenant-id"];
      const actorId = request.headers["x-actor-id"];
      if (typeof tenantId !== "string" || typeof actorId !== "string") {
        throw new AppError(
          "UNAUTHENTICATED",
          "Development auth requires x-tenant-id and x-actor-id headers",
          401,
        );
      }
      request.actor = {
        tenantId,
        actorId,
        deviceId: typeof request.headers["x-device-id"] === "string" ? request.headers["x-device-id"] : null,
      };
      return;
    }

    if (!verifier) {
      throw new AppError("AUTH_NOT_CONFIGURED", "Authentication provider is not configured", 503);
    }

    const authorization = request.headers.authorization;
    const match = typeof authorization === "string" ? /^Bearer ([^\s]+)$/i.exec(authorization) : null;
    if (!match) throw unauthenticated();

    let payload;
    try {
      payload = await verifier(match[1]!);
    } catch {
      throw unauthenticated();
    }

    const organizationId = payload.activeOrganizationId;
    if (
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      typeof payload.exp !== "number" ||
      typeof organizationId !== "string" ||
      organizationId.length === 0
    ) {
      throw unauthenticated();
    }

    request.actor = {
      tenantId: authIdentityUuid("organization", organizationId),
      actorId: authIdentityUuid("subject", payload.sub),
      deviceId: typeof request.headers["x-device-id"] === "string" ? request.headers["x-device-id"] : null,
    };
  });
});
