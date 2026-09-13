import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.issues },
      });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    }
    request.log.error({ err: error }, "request failed");
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } }),
  );
}
