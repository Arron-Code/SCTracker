import { getRandomBytesAsync } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import {
  decodeBase64,
  encodeBase64,
  p256PublicKey,
  sha256Hex,
  SIGNATURE_ALGORITHM,
} from "./crypto-core";
import { p256 } from "@noble/curves/nist.js";

const STORAGE_KEY_ALIAS = "sctracker.storage-key.v1";
const SIGNING_KEY_ALIAS = "sctracker.signing-key.p256.v1";
const DEVICE_ID_ALIAS = "sctracker.device-id.v1";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const storageKeyPromises = new Map<string, Promise<Uint8Array>>();
const signingKeyPromises = new Map<string, Promise<Uint8Array>>();

function scopedAlias(base: string, scope: string): string {
  return scope === "local" ? base : `${base}.${sha256Hex(scope).slice(0, 24)}`;
}

async function getOrCreateKey(alias: string, length: number): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(alias);
  if (existing) {
    const decoded = decodeBase64(existing);
    if (decoded.length !== length) throw new Error(`Secure key ${alias} has an invalid length.`);
    return decoded;
  }
  const generated = await getRandomBytesAsync(length);
  await SecureStore.setItemAsync(alias, encodeBase64(generated), secureStoreOptions);
  return generated;
}

export function getStorageKey(scope = "local"): Promise<Uint8Array> {
  const alias = scopedAlias(STORAGE_KEY_ALIAS, scope);
  const existing = storageKeyPromises.get(alias);
  if (existing) return existing;
  const created = getOrCreateKey(alias, 32);
  storageKeyPromises.set(alias, created);
  return created;
}

export function getSigningPrivateKey(scope = "local"): Promise<Uint8Array> {
  const alias = scopedAlias(SIGNING_KEY_ALIAS, scope);
  const cached = signingKeyPromises.get(alias);
  if (cached) return cached;
  const created = (async () => {
    const existing = await SecureStore.getItemAsync(alias);
    if (existing) {
      const decoded = decodeBase64(existing);
      if (!p256.utils.isValidSecretKey(decoded)) {
        throw new Error(`The secure signing key ${alias} is invalid.`);
      }
      return decoded;
    }
    let generated = await getRandomBytesAsync(32);
    while (!p256.utils.isValidSecretKey(generated)) generated = await getRandomBytesAsync(32);
    await SecureStore.setItemAsync(alias, encodeBase64(generated), secureStoreOptions);
    return generated;
  })();
  signingKeyPromises.set(alias, created);
  return created;
}

export async function getDeviceSigningKey(scope = "local"): Promise<{
  algorithm: typeof SIGNATURE_ALGORITHM;
  keyId: string;
  publicKeyBase64: string;
}> {
  const publicKey = p256PublicKey(await getSigningPrivateKey(scope));
  return {
    algorithm: SIGNATURE_ALGORITHM,
    keyId: sha256Hex(publicKey).slice(0, 24),
    publicKeyBase64: encodeBase64(publicKey),
  };
}

export function randomBytes(length: number): Promise<Uint8Array> {
  return getRandomBytesAsync(length);
}

export async function getDeviceId(preferred?: string, scope = "local"): Promise<string> {
  const alias = scopedAlias(DEVICE_ID_ALIAS, scope);
  const existing = await SecureStore.getItemAsync(alias);
  if (existing) return existing;
  const bytes = await getRandomBytesAsync(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  const generated =
    preferred && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(preferred)
      ? preferred
      : `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  await SecureStore.setItemAsync(alias, generated, secureStoreOptions);
  return generated;
}
