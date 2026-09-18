import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  canonicalJson,
  decodeBase64,
  decryptAuthenticated,
  encodeBase64,
  encryptAuthenticated,
  textDecoder,
  textEncoder,
} from "./crypto-core";
import {
  closePolygon,
  createUuid,
  type LegacyPlotDraft,
  type PersistedState,
  type Plot,
} from "./domain";
import { getDeviceId, getStorageKey, randomBytes } from "./secure-crypto";

const LEGACY_STATE_KEY = "sctracker.mobileState.v2";
const LEGACY_PLOTS_KEY = "sctracker.plotDrafts.v1";
const ENCRYPTED_STATE_VERSION = 1;
export const LANGUAGE_STORAGE_KEY = "sctracker.language.v1";
const saveQueues = new Map<string, Promise<void>>();

function stateKey(scope: string): string {
  return `sctracker.mobileState.v3.encrypted.${scope}`;
}

function plaintextStateKey(scope: string): string {
  return `sctracker.mobileState.v2.${scope}`;
}

function quarantineKey(scope: string): string {
  return `sctracker.mobileState.v3.quarantine.${scope}`;
}

export function emptyState(): PersistedState {
  return {
    version: 3,
    deviceId: createUuid(),
    cursor: null,
    suppliers: [],
    plots: [],
    documents: [],
    operations: [],
    outbox: [],
    events: [],
    conflicts: [],
    lastSyncAt: null,
  };
}

function migratePlot(draft: LegacyPlotDraft): Plot | null {
  if (
    !draft.producer ||
    !draft.farmName ||
    typeof draft.latitude !== "number" ||
    typeof draft.longitude !== "number"
  ) {
    return null;
  }
  const delta = 0.00005;
  const capturedAt = draft.capturedAt ?? new Date().toISOString();
  return {
    id: draft.id ?? createUuid(),
    producer: draft.producer,
    farmName: draft.farmName,
    areaHa: draft.areaHa ?? "0.00",
    polygon: closePolygon([
      [draft.longitude - delta, draft.latitude - delta],
      [draft.longitude + delta, draft.latitude - delta],
      [draft.longitude + delta, draft.latitude + delta],
      [draft.longitude - delta, draft.latitude + delta],
    ]),
    capturedAt,
    updatedAt: capturedAt,
    syncStatus: "pending",
  };
}

type EncryptedState = {
  version: typeof ENCRYPTED_STATE_VERSION;
  algorithm: "XChaCha20-Poly1305";
  nonce: string;
  ciphertext: string;
};

function normalizeState(parsed: PersistedState | (Omit<PersistedState, "version" | "events"> & { version: 2 })): PersistedState {
  return {
    ...parsed,
    version: 3,
    events: "events" in parsed && Array.isArray(parsed.events) ? parsed.events : [],
    suppliers: parsed.suppliers.map((supplier) => ({
      ...supplier,
      country: supplier.country ?? "",
    })),
  };
}

async function decryptState(encoded: string, scope: string): Promise<PersistedState> {
  const envelope = JSON.parse(encoded) as EncryptedState;
  if (envelope.version !== ENCRYPTED_STATE_VERSION || envelope.algorithm !== "XChaCha20-Poly1305") {
    throw new Error("Unsupported encrypted state format.");
  }
  const plaintext = decryptAuthenticated(
    decodeBase64(envelope.ciphertext),
    await getStorageKey(),
    decodeBase64(envelope.nonce),
    textEncoder.encode(stateKey(scope)),
  );
  const state = normalizeState(JSON.parse(textDecoder.decode(plaintext)) as PersistedState);
  return { ...state, deviceId: await getDeviceId(state.deviceId) };
}

async function encryptText(value: string, associatedKey: string): Promise<string> {
  const nonce = await randomBytes(24);
  const ciphertext = encryptAuthenticated(
    textEncoder.encode(value),
    await getStorageKey(),
    nonce,
    textEncoder.encode(associatedKey),
  );
  const envelope: EncryptedState = {
    version: ENCRYPTED_STATE_VERSION,
    algorithm: "XChaCha20-Poly1305",
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext),
  };
  return canonicalJson(envelope);
}

export async function loadState(scope = "local"): Promise<PersistedState> {
  await saveQueues.get(scope);
  const encrypted = await AsyncStorage.getItem(stateKey(scope));
  if (encrypted) return decryptState(encrypted, scope);

  const scoped = await AsyncStorage.getItem(plaintextStateKey(scope));
  const legacy = scope === "local" ? await AsyncStorage.getItem(LEGACY_STATE_KEY) : null;
  const current = scoped ?? legacy;
  if (current) {
    try {
      const parsed = JSON.parse(current) as PersistedState | (Omit<PersistedState, "version" | "events"> & { version: 2 });
      if (parsed.version !== 2 && parsed.version !== 3) {
        throw new Error("Unsupported plaintext state version.");
      }
      const migrated = normalizeState(parsed);
      const secured = { ...migrated, deviceId: await getDeviceId(migrated.deviceId) };
      await saveState(secured, scope);
      await AsyncStorage.multiRemove([plaintextStateKey(scope), ...(scope === "local" ? [LEGACY_STATE_KEY] : [])]);
      return secured;
    } catch (error) {
      const protectedKey = quarantineKey(scope);
      await AsyncStorage.setItem(protectedKey, await encryptText(current, protectedKey));
      await AsyncStorage.multiRemove([plaintextStateKey(scope), ...(scope === "local" ? [LEGACY_STATE_KEY] : [])]);
      throw new Error("Legacy local data could not be migrated and was moved to encrypted quarantine.", {
        cause: error,
      });
    }
  }
  const state = emptyState();
  const legacyPlots = scope === "local" ? await AsyncStorage.getItem(LEGACY_PLOTS_KEY) : null;
  if (legacyPlots) {
    const drafts = JSON.parse(legacyPlots) as LegacyPlotDraft[];
    state.plots = drafts.map(migratePlot).filter((plot): plot is Plot => plot !== null);
    state.outbox = state.plots.map((plot) => ({
      id: createUuid(),
      idempotencyKey: createUuid(),
      entityType: "plot",
      entityId: plot.id,
      action: "upsert",
      payload: plot,
      createdAt: plot.updatedAt,
      attempts: 0,
    }));
    state.deviceId = await getDeviceId(state.deviceId);
    await saveState(state, scope);
    await AsyncStorage.removeItem(LEGACY_PLOTS_KEY);
  }
  return { ...state, deviceId: await getDeviceId() };
}

export async function saveState(state: PersistedState, scope = "local"): Promise<void> {
  const write = async () => {
    await AsyncStorage.setItem(
      stateKey(scope),
      await encryptText(canonicalJson(state), stateKey(scope)),
    );
  };
  const previous = saveQueues.get(scope);
  const queued = previous ? previous.then(write, write) : write();
  saveQueues.set(scope, queued);
  try {
    await queued;
  } finally {
    if (saveQueues.get(scope) === queued) saveQueues.delete(scope);
  }
}
