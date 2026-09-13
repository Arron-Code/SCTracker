import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
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

export const actorContext = fp(async (app: FastifyInstance, options: { config: Config }) => {
  app.decorateRequest("actor");
  app.addHook("preHandler", async (request: FastifyRequest) => {
    if (!request.url.startsWith("/api/")) return;
    if (!options.config.DEV_AUTH_ENABLED) {
      throw new AppError("AUTH_NOT_CONFIGURED", "Authentication provider is not configured", 503);
    }
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
  });
});
