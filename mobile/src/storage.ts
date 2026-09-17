import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  closePolygon,
  createUuid,
  type LegacyPlotDraft,
  type PersistedState,
  type Plot,
} from "./domain";

const LEGACY_STATE_KEY = "sctracker.mobileState.v2";
const LEGACY_PLOTS_KEY = "sctracker.plotDrafts.v1";
export const LANGUAGE_STORAGE_KEY = "sctracker.language.v1";

function stateKey(scope: string): string {
  return `sctracker.mobileState.v2.${scope}`;
}

export function emptyState(): PersistedState {
  return {
    version: 2,
    deviceId: createUuid(),
    cursor: null,
    suppliers: [],
    plots: [],
    documents: [],
    operations: [],
    outbox: [],
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

export async function loadState(scope = "local"): Promise<PersistedState> {
  const scoped = await AsyncStorage.getItem(stateKey(scope));
  const legacy = scope === "local" ? await AsyncStorage.getItem(LEGACY_STATE_KEY) : null;
  const current = scoped ?? legacy;
  if (current) {
    const parsed = JSON.parse(current) as PersistedState;
    if (parsed.version === 2) {
      return {
        ...parsed,
        suppliers: parsed.suppliers.map((supplier) => ({
          ...supplier,
          country: supplier.country ?? "",
        })),
      };
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
    await AsyncStorage.setItem(stateKey(scope), JSON.stringify(state));
  }
  return state;
}

export function saveState(state: PersistedState, scope = "local") {
  return AsyncStorage.setItem(stateKey(scope), JSON.stringify(state));
}
