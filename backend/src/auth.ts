import { createHash } from "node:crypto";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

export type JwtVerifier = (token: string) => Promise<JWTPayload>;

const ID_DOMAIN_PREFIX = "sctracker:neon-auth:v1";

export async function verifyNeonJwt(
  token: string,
  key: JWTVerifyGetKey,
  expectedOrigin: string,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["EdDSA"],
    issuer: expectedOrigin,
    audience: expectedOrigin,
  });
  return payload;
}

export function createNeonJwtVerifier(baseUrl: string): JwtVerifier {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const expectedOrigin = new URL(normalizedBaseUrl).origin;
  const jwks = createRemoteJWKSet(new URL(`${normalizedBaseUrl}/.well-known/jwks.json`));
  return (token) => verifyNeonJwt(token, jwks, expectedOrigin);
}

export function authIdentityUuid(kind: "organization" | "subject", externalId: string): string {
  const bytes = createHash("sha256")
    .update(`${ID_DOMAIN_PREFIX}:${kind}\0${externalId}`, "utf8")
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
