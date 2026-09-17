import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.string().default("info"),
  DEV_AUTH_ENABLED: z.string().default("false").transform((value) => value === "true"),
  NEON_AUTH_BASE_URL: z.string().url().optional(),
  AUTH_PROVIDERS: z
    .string()
    .default("google")
    .transform((value) => value.split(",").map((provider) => provider.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1)),
  FRONTEND_ORIGINS: z
    .string()
    .default("http://localhost:4173,http://127.0.0.1:4173")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.string().url())),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
  AWS_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().default("false").transform((value) => value === "true"),
  S3_OBJECT_LOCK_REQUIRED: z.string().default("true").transform((value) => value === "true"),
  SENTINEL_HUB_CLIENT_ID: z.string().optional(),
  SENTINEL_HUB_CLIENT_SECRET: z.string().optional(),
  SENTINEL_HUB_BASE_URL: z.string().url().default("https://services.sentinel-hub.com"),
  EU_IS_BASE_URL: z.string().url().optional(),
  EU_IS_CLIENT_ID: z.string().optional(),
  EU_IS_CLIENT_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.message}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.DEV_AUTH_ENABLED) {
    throw new Error("DEV_AUTH_ENABLED must not be enabled in production");
  }
  return parsed.data;
}
