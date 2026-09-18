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

let storageKeyPromise: Promise<Uint8Array> | null = null;
let signingKeyPromise: Promise<Uint8Array> | null = null;

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

export function getStorageKey(): Promise<Uint8Array> {
  storageKeyPromise ??= getOrCreateKey(STORAGE_KEY_ALIAS, 32);
  return storageKeyPromise;
}

export function getSigningPrivateKey(): Promise<Uint8Array> {
  signingKeyPromise ??= (async () => {
    const existing = await SecureStore.getItemAsync(SIGNING_KEY_ALIAS);
    if (existing) {
      const decoded = decodeBase64(existing);
      if (!p256.utils.isValidSecretKey(decoded)) {
        throw new Error("The secure signing key is invalid.");
      }
      return decoded;
    }
    let generated = await getRandomBytesAsync(32);
    while (!p256.utils.isValidSecretKey(generated)) generated = await getRandomBytesAsync(32);
    await SecureStore.setItemAsync(SIGNING_KEY_ALIAS, encodeBase64(generated), secureStoreOptions);
    return generated;
  })();
  return signingKeyPromise;
}

export async function getDeviceSigningKey(): Promise<{
  algorithm: typeof SIGNATURE_ALGORITHM;
  keyId: string;
  publicKeyBase64: string;
}> {
  const publicKey = p256PublicKey(await getSigningPrivateKey());
  return {
    algorithm: SIGNATURE_ALGORITHM,
    keyId: sha256Hex(publicKey).slice(0, 24),
    publicKeyBase64: encodeBase64(publicKey),
  };
}

export function randomBytes(length: number): Promise<Uint8Array> {
  return getRandomBytesAsync(length);
}

export async function getDeviceId(preferred?: string): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_ALIAS);
  if (existing) return existing;
  const bytes = await getRandomBytesAsync(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  const generated =
    preferred && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(preferred)
      ? preferred
      : `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  await SecureStore.setItemAsync(DEVICE_ID_ALIAS, generated, secureStoreOptions);
  return generated;
}
