import {
  canonicalJson,
  encodeBase64,
  p256Sign,
  sha256Hex,
  textEncoder,
} from "./crypto-core";
import type { OutboxOperation, PersistedState, SignedEvent } from "./domain";
import { getDeviceSigningKey, getSigningPrivateKey } from "./secure-crypto";

export const GENESIS_HASH = "0".repeat(64);

type EventSigningMaterial = Omit<SignedEvent, "eventHash" | "signature" | "payload">;

export function eventSigningMaterial(event: SignedEvent): EventSigningMaterial {
  return {
    schema: event.schema,
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    sequence: event.sequence,
    prevHash: event.prevHash,
    reportedUtc: event.reportedUtc,
    deviceId: event.deviceId,
    actorId: event.actorId,
    tenantId: event.tenantId,
    payloadHash: event.payloadHash,
    keyId: event.keyId,
  };
}

export function verifyEventChain(events: SignedEvent[]): boolean {
  let previousHash = GENESIS_HASH;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.sequence !== index + 1 || event.prevHash !== previousHash) return false;
    if (sha256Hex(canonicalJson(event.payload)) !== event.payloadHash) return false;
    if (sha256Hex(canonicalJson(eventSigningMaterial(event))) !== event.eventHash) return false;
    previousHash = event.eventHash;
  }
  return true;
}

async function signOperation(
  operation: OutboxOperation,
  state: PersistedState,
  actorId: string,
  tenantId: string,
): Promise<SignedEvent> {
  const signingKey = await getDeviceSigningKey();
  const sequence = state.events.length + 1;
  const unsigned: EventSigningMaterial = {
    schema: 1,
    eventId: operation.id,
    eventType: `${operation.entityType}.${operation.action}`,
    aggregateId: operation.entityId,
    sequence,
    prevHash: state.events.at(-1)?.eventHash ?? GENESIS_HASH,
    reportedUtc: operation.createdAt,
    deviceId: state.deviceId,
    actorId,
    tenantId,
    payloadHash: sha256Hex(canonicalJson(operation.payload)),
    keyId: signingKey.keyId,
  };
  const eventHash = sha256Hex(canonicalJson(unsigned));
  const signature = p256Sign(textEncoder.encode(canonicalJson(unsigned)), await getSigningPrivateKey());
  return {
    ...unsigned,
    eventHash,
    signature: encodeBase64(signature),
    payload: operation.payload,
  };
}

export async function sealPendingOperations(
  input: PersistedState,
  actorId: string,
  tenantId: string,
): Promise<PersistedState> {
  let state: PersistedState = {
    ...input,
    events: [...input.events],
    outbox: input.outbox.map((operation) => ({ ...operation })),
  };
  if (!verifyEventChain(state.events)) {
    throw new Error("The local signed event chain is invalid.");
  }
  for (let index = 0; index < state.outbox.length; index += 1) {
    const operation = state.outbox[index]!;
    if (operation.event) continue;
    const event = await signOperation(operation, state, actorId, tenantId);
    state.events.push(event);
    state.outbox[index] = { ...operation, event };
  }
  return state;
}
