import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  closePolygon,
  createUuid,
  type LegacyPlotDraft,
  type PersistedState,
  type Plot,
} from "./domain";

const STATE_KEY = "sctracker.mobileState.v2";
const LEGACY_PLOTS_KEY = "sctracker.plotDrafts.v1";
export const LANGUAGE_STORAGE_KEY = "sctracker.language.v1";

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

export async function loadState(): Promise<PersistedState> {
  const current = await AsyncStorage.getItem(STATE_KEY);
  if (current) {
    const parsed = JSON.parse(current) as PersistedState;
    if (parsed.version === 2) {
      return parsed;
    }
  }
  const state = emptyState();
  const legacy = await AsyncStorage.getItem(LEGACY_PLOTS_KEY);
  if (legacy) {
    const drafts = JSON.parse(legacy) as LegacyPlotDraft[];
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
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  }
  return state;
}

export function saveState(state: PersistedState) {
  return AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}
