import { ApiError, pullChanges, pushOperations } from "./api";
import type { OutboxOperation, PersistedState, Plot, Supplier } from "./domain";
import { ensureDeviceTrustRegistration } from "./device-trust";
import { sealPendingOperations } from "./event-chain";
import { getDeviceSigningKey } from "./secure-crypto";

export type SyncResult = {
  state: PersistedState;
  error?: ApiError | Error;
};

export type SyncIdentity = {
  actorId: string;
  tenantId: string;
};

export type PersistBeforeNetwork = (state: PersistedState) => Promise<void>;

const retryDelay = (attempts: number) => Math.min(60_000, 1_000 * 2 ** attempts);
const MAX_PUSH_OPERATIONS = 100;

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

export async function synchronize(
  input: PersistedState,
  force = false,
  identity?: SyncIdentity,
  persist?: PersistBeforeNetwork,
): Promise<SyncResult> {
  let state: PersistedState = {
    ...input,
    outbox: input.outbox.map((item) => ({ ...item })),
    conflicts: [...input.conflicts],
  };
  let ready: OutboxOperation[] = [];
  try {
    if (!identity) throw new Error("An authenticated identity is required to sign synchronization events.");
    await ensureDeviceTrustRegistration(state.deviceId, identity.actorId, identity.tenantId);
    state = await sealPendingOperations(state, identity.actorId, identity.tenantId);
    if (persist) await persist(state);
    const now = Date.now();
    const ordered = [...state.outbox].sort(
      (left, right) => (left.event?.sequence ?? 0) - (right.event?.sequence ?? 0),
    );
    for (const item of ordered) {
      if (!force && item.nextAttemptAt && Date.parse(item.nextAttemptAt) > now) break;
      ready.push(item);
    }
    const deviceKey = await getDeviceSigningKey(`${identity.tenantId}:${identity.actorId}`);
    for (let offset = 0; offset < ready.length; offset += MAX_PUSH_OPERATIONS) {
      const batch = ready.slice(offset, offset + MAX_PUSH_OPERATIONS);
      const pushed = await pushOperations(state.deviceId, batch, deviceKey);
      const expectedHead = batch.at(-1)?.event?.eventHash;
      if (!expectedHead || pushed.chainHead !== expectedHead) {
        throw new Error("The server did not acknowledge the signed event-chain head.");
      }
      const accepted = new Set(pushed.accepted);
      const conflicts = pushed.conflicts ?? [];
      const conflictIds = new Set(conflicts.map((item) => item.operationId));
      const acceptedEntities = batch.filter((item) => accepted.has(item.id));
      const appliedByOperation = new Map<string, Supplier | Plot>();
      for (const item of pushed.applied ?? []) {
        if (item.operationId) appliedByOperation.set(item.operationId, item.resource);
      }
      state = {
        ...state,
        suppliers: state.suppliers.map((supplier) => {
          const operation = acceptedEntities.find(
            (item) => item.entityType === "supplier" && item.entityId === supplier.id,
          );
          if (!operation) return supplier;
          const remote = appliedByOperation.get(operation.id);
          return {
            ...(remote && !("farmName" in remote) ? remote : supplier),
            syncStatus: "synced",
          };
        }),
        plots: state.plots.map((plot) => {
          const operation = acceptedEntities.find(
            (item) => item.entityType === "plot" && item.entityId === plot.id,
          );
          if (!operation) return plot;
          const remote = appliedByOperation.get(operation.id);
          return {
            ...(remote && "farmName" in remote ? remote : plot),
            syncStatus: "synced",
          };
        }),
        outbox: state.outbox.filter(
          (item) => !accepted.has(item.id) && !conflictIds.has(item.id),
        ),
        conflicts: [
          ...state.conflicts,
          ...conflicts.map((conflict) => {
            const local = batch.find((item) => item.id === conflict.operationId);
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
      if (persist) await persist(state);
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
    if (persist) await persist(state);
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
    if (persist) {
      try {
        await persist(state);
      } catch (persistError) {
        return {
          state,
          error: persistError instanceof Error ? persistError : new Error(String(persistError)),
        };
      }
    }
    return { state, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
