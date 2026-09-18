import { createHash, createPublicKey, verify } from "node:crypto";

export const SIGNING_ALGORITHM = "P256-SHA256" as const;

export interface DeviceSigningKey {
  keyId: string;
  algorithm: typeof SIGNING_ALGORITHM;
  publicKeyBase64: string;
}

export interface SignedEvent {
  schema: 1;
  tenantId: string;
  eventId: string;
  eventType: string;
  aggregateId: string;
  sequence: number;
  prevHash: string;
  reportedUtc: string;
  deviceId: string;
  actorId: string;
  payloadHash: string;
  keyId: string;
  eventHash: string;
  signature: string;
  payload: Record<string, unknown>;
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function eventSigningMaterial(event: SignedEvent): string {
  return canonicalJson({
    schema: event.schema,
    tenantId: event.tenantId,
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    sequence: event.sequence,
    prevHash: event.prevHash,
    reportedUtc: event.reportedUtc,
    deviceId: event.deviceId,
    actorId: event.actorId,
    payloadHash: event.payloadHash,
    keyId: event.keyId,
  });
}

export function signedEventHash(event: SignedEvent): string {
  return createHash("sha256").update(eventSigningMaterial(event), "utf8").digest("hex");
}

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

export function verifySignedEvent(event: SignedEvent, deviceKey: DeviceSigningKey): boolean {
  const publicKey = Buffer.from(deviceKey.publicKeyBase64, "base64");
  const signature = Buffer.from(event.signature, "base64");
  if (publicKey.length !== 65 || publicKey[0] !== 4 || signature.length !== 64) return false;

  try {
    const key = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: base64Url(publicKey.subarray(1, 33)),
        y: base64Url(publicKey.subarray(33, 65)),
      },
      format: "jwk",
    });
    return verify(
      "sha256",
      Buffer.from(eventSigningMaterial(event), "utf8"),
      { key, dsaEncoding: "ieee-p1363" },
      signature,
    );
  } catch {
    return false;
  }
}
