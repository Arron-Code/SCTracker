import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { p256 } from "@noble/curves/nist.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { fromByteArray, toByteArray } from "base64-js";

export const ENCRYPTION_ALGORITHM = "XChaCha20-Poly1305";
export const SIGNATURE_ALGORITHM = "P256-SHA256";
export const EXPORT_SCRYPT_N = 32_768;
const ID_DOMAIN_PREFIX = "sctracker:neon-auth:v1";

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareUtf8(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Canonical JSON does not support non-finite numbers.");
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Value cannot be represented as canonical JSON.");
  return encoded;
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = utf8ToBytes(left);
  const rightBytes = utf8ToBytes(right);
  for (let index = 0; index < Math.min(leftBytes.length, rightBytes.length); index += 1) {
    const comparison = leftBytes[index]! - rightBytes[index]!;
    if (comparison !== 0) return comparison;
  }
  return leftBytes.length - rightBytes.length;
}

export function sha256Hex(value: Uint8Array | string): string {
  return bytesToHex(sha256(typeof value === "string" ? utf8ToBytes(value) : value));
}

export function sha256Bytes(value: Uint8Array | string): Uint8Array {
  return sha256(typeof value === "string" ? utf8ToBytes(value) : value);
}

export function sha256Base64(value: Uint8Array): string {
  return encodeBase64(sha256Bytes(value));
}

export function authIdentityId(
  kind: "organization" | "subject",
  externalId: string,
): string {
  const bytes = sha256Bytes(`${ID_DOMAIN_PREFIX}:${kind}\0${externalId}`).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const authActorId = (externalId: string): string =>
  authIdentityId("subject", externalId);

export const authTenantId = (externalId: string): string =>
  authIdentityId("organization", externalId);

export function encodeBase64(value: Uint8Array): string {
  return fromByteArray(value);
}

export function decodeBase64(value: string): Uint8Array {
  return toByteArray(value);
}

export function encryptAuthenticated(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  associatedData: Uint8Array,
): Uint8Array {
  return xchacha20poly1305(key, nonce, associatedData).encrypt(plaintext);
}

export function decryptAuthenticated(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  associatedData: Uint8Array,
): Uint8Array {
  return xchacha20poly1305(key, nonce, associatedData).decrypt(ciphertext);
}

export async function deriveExportKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  return scryptAsync(utf8ToBytes(passphrase.normalize("NFKC")), salt, {
    N: EXPORT_SCRYPT_N,
    r: 8,
    p: 1,
    dkLen: 32,
    asyncTick: 10,
  });
}

export function p256PublicKey(privateKey: Uint8Array): Uint8Array {
  return p256.getPublicKey(privateKey, false);
}

export function p256Sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return p256.sign(message, privateKey, { format: "compact", lowS: true, prehash: true });
}

export function p256Verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  return p256.verify(signature, message, publicKey, { lowS: true, prehash: true });
}

export function joinBytes(...values: Uint8Array[]): Uint8Array {
  return concatBytes(...values);
}

export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder();
