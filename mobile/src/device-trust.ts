import * as AppIntegrity from "@expo/app-integrity";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  createAttestationChallenge,
  registerDevice,
  submitDeviceAttestation,
  type AttestationProvider,
} from "./api";
import { sha256Hex } from "./crypto-core";
import { getDeviceSigningKey } from "./secure-crypto";

const APP_ATTEST_KEY_PREFIX = "sctracker.app-attest-key.v1";
const ATTESTATION_STATUS_PREFIX = "sctracker.attestation-status.v1";
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

type CachedAttestation = {
  status: "VERIFIED" | "UNVERIFIED" | "NOT_CONFIGURED";
  checkedAt: string;
};

function alias(prefix: string, actorId: string, tenantId: string): string {
  return `${prefix}.${sha256Hex(`${actorId}:${tenantId}`).slice(0, 24)}`;
}

async function getIosAppAttestKey(actorId: string, tenantId: string): Promise<string> {
  const keyAlias = alias(APP_ATTEST_KEY_PREFIX, actorId, tenantId);
  const existing = await SecureStore.getItemAsync(keyAlias);
  if (existing) return existing;
  const generated = await AppIntegrity.generateKeyAsync();
  await SecureStore.setItemAsync(keyAlias, generated, secureStoreOptions);
  return generated;
}

async function createPlatformProof(
  provider: AttestationProvider,
  challenge: string,
  actorId: string,
  tenantId: string,
): Promise<Record<string, unknown>> {
  if (provider === "play_integrity") {
    const cloudProjectNumber = process.env.EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER?.trim();
    if (!cloudProjectNumber) {
      return { unavailableReason: "EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER is not configured" };
    }
    await AppIntegrity.prepareIntegrityTokenProviderAsync(cloudProjectNumber);
    return { token: await AppIntegrity.requestIntegrityCheckAsync(challenge) };
  }
  if (!AppIntegrity.isSupported) {
    return { unavailableReason: "App Attest is not supported on this device" };
  }
  const appAttestKeyId = await getIosAppAttestKey(actorId, tenantId);
  return {
    appAttestKeyId,
    attestation: await AppIntegrity.attestKeyAsync(appAttestKeyId, challenge),
  };
}

export async function ensureDeviceTrustRegistration(
  deviceId: string,
  actorId: string,
  tenantId: string,
): Promise<void> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return;
  const deviceKey = await getDeviceSigningKey(`${tenantId}:${actorId}`);
  const appVersion = Constants.expoConfig?.version ?? "unknown";
  const provider: AttestationProvider =
    Platform.OS === "android" ? "play_integrity" : "app_attest";

  await registerDevice({
    deviceId,
    displayName: `SCTracker ${Platform.OS}`,
    platform: Platform.OS,
    appVersion,
    osVersion: String(Platform.Version),
    keyProtection: "software",
    metadata: {
      appOwnership: Constants.appOwnership ?? "unknown",
      executionEnvironment: Constants.executionEnvironment,
    },
    deviceKey,
  });

  const statusAlias = alias(ATTESTATION_STATUS_PREFIX, actorId, tenantId);
  const cachedRaw = await SecureStore.getItemAsync(statusAlias);
  if (cachedRaw) {
    const cached = JSON.parse(cachedRaw) as CachedAttestation;
    const age = Date.now() - Date.parse(cached.checkedAt);
    if (cached.status === "VERIFIED" || (Number.isFinite(age) && age < RETRY_AFTER_MS)) return;
  }

  const challenge = await createAttestationChallenge({
    deviceId,
    provider,
    keyId: deviceKey.keyId,
    metadata: { appVersion },
  });
  const proof = challenge.verificationConfigured
    ? await createPlatformProof(provider, challenge.challenge, actorId, tenantId)
    : { unavailableReason: `${provider} verifier is not configured` };
  const result = await submitDeviceAttestation({
    deviceId,
    provider,
    keyId: deviceKey.keyId,
    challengeId: challenge.challengeId,
    proof,
    metadata: { appVersion },
  });
  await SecureStore.setItemAsync(
    statusAlias,
    JSON.stringify({ status: result.status, checkedAt: new Date().toISOString() } satisfies CachedAttestation),
    secureStoreOptions,
  );
}
