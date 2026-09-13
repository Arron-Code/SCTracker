import { ApiError, pullChanges, pushOperations } from "./api";
import type { OutboxOperation, PersistedState, Plot, Supplier } from "./domain";

export type SyncResult = {
  state: PersistedState;
  error?: ApiError | Error;
};

const retryDelay = (attempts: number) => Math.min(60_000, 1_000 * 2 ** attempts);

function mergeRemote(
  items: Array<Supplier | Plot>,
  remote: Supplier | Plot,
): Array<Supplier | Plot> {
  const index = items.findIndex((item) => item.id === remote.id);
  if (index < 0) {
    return [...items, { ...remote, syncStatus: "synced" }];
  }
  const copy = [...items];
  copy[index] = { ...remote, syncStatus: "synced" };
  return copy;
}

export async function synchronize(input: PersistedState, force = false): Promise<SyncResult> {
  let state: PersistedState = {
    ...input,
    outbox: input.outbox.map((item) => ({ ...item })),
    conflicts: [...input.conflicts],
  };
  const now = Date.now();
  const ready = state.outbox.filter(
    (item) => force || !item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now,
  );
  try {
    if (ready.length > 0) {
      const pushed = await pushOperations(state.deviceId, ready);
      const accepted = new Set(pushed.accepted);
      const conflicts = pushed.conflicts ?? [];
      const conflictIds = new Set(conflicts.map((item) => item.operationId));
      const acceptedEntities = ready.filter((item) => accepted.has(item.id));
      state = {
        ...state,
        suppliers: state.suppliers.map((supplier) =>
          acceptedEntities.some(
            (item) => item.entityType === "supplier" && item.entityId === supplier.id,
          )
            ? { ...supplier, syncStatus: "synced" }
            : supplier,
        ),
        plots: state.plots.map((plot) =>
          acceptedEntities.some(
            (item) => item.entityType === "plot" && item.entityId === plot.id,
          )
            ? { ...plot, syncStatus: "synced" }
            : plot,
        ),
        outbox: state.outbox.filter(
          (item) => !accepted.has(item.id) && !conflictIds.has(item.id),
        ),
        conflicts: [
          ...state.conflicts,
          ...conflicts.map((conflict) => {
            const local = ready.find((item) => item.id === conflict.operationId);
            if (!local) {
              throw new Error(`Conflict operation ${conflict.operationId} is missing.`);
            }
            return {
              id: conflict.operationId,
              entityType: conflict.entityType,
              entityId: conflict.entityId,
              local: local.payload,
              remote: conflict.remote,
              detectedAt: new Date().toISOString(),
            };
          }),
        ],
      };
    }
    const pulled = await pullChanges(state.cursor);
    for (const change of pulled.changes) {
      const hasLocalChange = state.outbox.some(
        (item) =>
          item.entityType === change.entityType && item.entityId === change.entity.id,
      );
      if (hasLocalChange) {
        const local = change.entityType === "supplier"
          ? state.suppliers.find((item) => item.id === change.entity.id)
          : state.plots.find((item) => item.id === change.entity.id);
        if (
          local &&
          !state.conflicts.some(
            (item) =>
              item.entityType === change.entityType && item.entityId === change.entity.id,
          )
        ) {
          state.conflicts.push({
            id: `pull:${change.entityType}:${change.entity.id}:${pulled.cursor}`,
            entityType: change.entityType,
            entityId: change.entity.id,
            local,
            remote: change.entity,
            detectedAt: new Date().toISOString(),
          });
        }
        continue;
      }
      if (change.entityType === "supplier") {
        state.suppliers = mergeRemote(state.suppliers, change.entity) as Supplier[];
      } else {
        state.plots = mergeRemote(state.plots, change.entity) as Plot[];
      }
    }
    state.cursor = pulled.cursor;
    state.lastSyncAt = new Date().toISOString();
    return { state };
  } catch (error) {
    const readyIds = new Set(ready.map((item) => item.id));
    state.outbox = state.outbox.map((item): OutboxOperation => {
      if (!readyIds.has(item.id)) {
        return item;
      }
      const attempts = item.attempts + 1;
      return {
        ...item,
        attempts,
        nextAttemptAt: new Date(Date.now() + retryDelay(attempts)).toISOString(),
        lastError: error instanceof Error ? error.message : String(error),
      };
    });
    return { state, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
