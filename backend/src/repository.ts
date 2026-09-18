import { randomUUID } from "node:crypto";
import pg from "pg";
import { AppError } from "./errors.js";
import {
  blockingTrustStates,
  type AttestationChallenge,
  type AttestationProviderName,
  type AttestationRecord,
  type AttestationStatus,
  type DevicePlatform,
  type DeviceStatus,
  type KeyProtectionLevel,
  type KeyStatus,
  type OrganizationIdentitySnapshot,
  type OrganizationUser,
  type RegisteredDevice,
  type RegisteredKey,
  type TrustHistoryEntry,
  type TrustScopeType,
  type TrustState,
  type TrustStateRecord,
  type UserStatus,
} from "./identity.js";
import type { DeviceSigningKey, SignedEvent } from "./signed-events.js";
import { canonicalJson, signedEventHash } from "./signed-events.js";

const GENESIS_HASH = "0".repeat(64);

const { Pool } = pg;
export type ResourceType =
  | "suppliers"
  | "supplier_invitations"
  | "plots"
  | "shipments"
  | "documents"
  | "analyses"
  | "evidence_packs"
  | "dds_submissions";

export interface Resource {
  id: string;
  tenantId: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface Change {
  sequence: number;
  resourceType: ResourceType;
  resourceId: string;
  operation: "upsert";
  payload: Resource;
  occurredAt: string;
}

export interface UpsertOrganizationUserInput {
  actorId: string;
  subjectId?: string | null;
  displayName?: string | null;
  email?: string | null;
  roles?: string[];
  status?: UserStatus;
  lastAuthenticatedAt?: string | null;
}

export interface RegisterDeviceInput {
  deviceId: string;
  displayName: string;
  platform: DevicePlatform;
  appVersion: string;
  osVersion: string;
  keyProtection: KeyProtectionLevel;
  metadata: Record<string, unknown>;
}

export interface UpdateDeviceStatusInput {
  status: DeviceStatus;
  reason?: string | null;
}

export interface CreateAttestationChallengeInput {
  deviceId: string;
  keyId?: string | null;
  provider: AttestationProviderName;
  challenge: string;
  metadata: Record<string, unknown>;
  expiresAt: string;
}

export interface RecordAttestationInput {
  deviceId: string;
  keyId?: string | null;
  challengeId?: string | null;
  provider: AttestationProviderName;
  status: AttestationStatus;
  verified: boolean;
  reason: string;
  providerReference?: string | null;
  evidence: Record<string, unknown>;
  payloadDigest: string;
}

export interface SetTrustStateInput {
  scopeType: TrustScopeType;
  scopeId: string;
  state: TrustState;
  reason: string;
  details: Record<string, unknown>;
}

export interface Repository {
  create(type: ResourceType, tenantId: string, payload: Record<string, unknown>): Promise<Resource>;
  list(type: ResourceType, tenantId: string): Promise<Resource[]>;
  get(type: ResourceType, tenantId: string, id: string): Promise<Resource | null>;
  update(
    type: ResourceType,
    tenantId: string,
    id: string,
    patch: Record<string, unknown>,
    expectedUpdatedAt?: string,
  ): Promise<Resource>;
  claimJob(types: ResourceType[]): Promise<Resource | null>;
  appendAudit(tenantId: string, actorId: string, action: string, payload: unknown): Promise<void>;
  findIdempotency(tenantId: string, key: string): Promise<unknown | null>;
  saveIdempotency(tenantId: string, key: string, response: unknown): Promise<void>;
  changes(tenantId: string, cursor: number, limit: number): Promise<Change[]>;
  listOrganizationUsers(tenantId: string): Promise<OrganizationUser[]>;
  upsertOrganizationUser(tenantId: string, input: UpsertOrganizationUserInput): Promise<OrganizationUser>;
  getOrganizationUser(tenantId: string, actorId: string): Promise<OrganizationUser | null>;
  getIdentitySnapshot(tenantId: string, actorId: string): Promise<OrganizationIdentitySnapshot>;
  listDevices(tenantId: string, actorId?: string): Promise<RegisteredDevice[]>;
  registerDevice(tenantId: string, actorId: string, input: RegisterDeviceInput): Promise<RegisteredDevice>;
  getDevice(tenantId: string, deviceId: string): Promise<RegisteredDevice | null>;
  updateDeviceStatus(
    tenantId: string,
    deviceId: string,
    actorId: string,
    input: UpdateDeviceStatusInput,
  ): Promise<RegisteredDevice>;
  listSigningKeys(tenantId: string, deviceId?: string): Promise<RegisteredKey[]>;
  registerSigningKey(
    tenantId: string,
    actorId: string,
    deviceId: string,
    deviceKey: DeviceSigningKey,
  ): Promise<RegisteredKey>;
  getSigningKey(tenantId: string, keyId: string): Promise<RegisteredKey | null>;
  revokeSigningKey(tenantId: string, keyId: string, actorId: string, reason: string): Promise<RegisteredKey>;
  listAttestationChallenges(tenantId: string, deviceId?: string): Promise<AttestationChallenge[]>;
  createAttestationChallenge(
    tenantId: string,
    actorId: string,
    input: CreateAttestationChallengeInput,
  ): Promise<AttestationChallenge>;
  listAttestations(tenantId: string, deviceId?: string): Promise<AttestationRecord[]>;
  recordAttestation(tenantId: string, actorId: string, input: RecordAttestationInput): Promise<AttestationRecord>;
  getTrustState(tenantId: string, scopeType: TrustScopeType, scopeId: string): Promise<TrustStateRecord | null>;
  setTrustState(tenantId: string, actorId: string, input: SetTrustStateInput): Promise<TrustStateRecord>;
  listTrustHistory(
    tenantId: string,
    filters?: Partial<Pick<TrustStateRecord, "scopeType" | "scopeId">>,
  ): Promise<TrustHistoryEntry[]>;
  appendSignedEvents(
    tenantId: string,
    deviceKey: DeviceSigningKey & { deviceId: string; actorId: string },
    events: SignedEvent[],
  ): Promise<void>;
}

function now(): string {
  return new Date().toISOString();
}

function resourceId(payload: Record<string, unknown>): string {
  const requested = payload.id;
  if (typeof requested === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requested)) {
    return requested;
  }
  return randomUUID();
}

function resourcePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "id"));
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function blockedTrustError(scopeType: TrustScopeType, state: TrustState): AppError {
  return new AppError("TRUST_BLOCKED", `${scopeType} trust state blocks new signed sync events`, 403, {
    scopeType,
    state,
  });
}

export class MemoryRepository implements Repository {
  private readonly resources = new Map<ResourceType, Map<string, Resource>>();
  private readonly idempotency = new Map<string, unknown>();
  private readonly changeLog: Change[] = [];
  private readonly auditLog: unknown[] = [];
  private readonly deviceKeysById = new Map<
    string,
    DeviceSigningKey & { deviceId: string; actorId: string }
  >();
  private readonly deviceKeysByDevice = new Map<
    string,
    DeviceSigningKey & { deviceId: string; actorId: string }
  >();
  private readonly signedEvents = new Map<string, SignedEvent[]>();
  private readonly eventsById = new Map<string, {
    tenantId: string;
    deviceId: string;
    event: SignedEvent;
  }>();
  private readonly organizationUsers = new Map<string, OrganizationUser>();
  private readonly devices = new Map<string, RegisteredDevice>();
  private readonly keys = new Map<string, RegisteredKey>();
  private readonly attestationChallenges = new Map<string, AttestationChallenge>();
  private readonly attestationRecords: AttestationRecord[] = [];
  private readonly trustStates = new Map<string, TrustStateRecord>();
  private readonly trustHistory: TrustHistoryEntry[] = [];

  private bucket(type: ResourceType): Map<string, Resource> {
    const existing = this.resources.get(type);
    if (existing) return existing;
    const created = new Map<string, Resource>();
    this.resources.set(type, created);
    return created;
  }

  private trustKey(tenantId: string, scopeType: TrustScopeType, scopeId: string): string {
    return `${tenantId}:${scopeType}:${scopeId}`;
  }

  private ensureRegisteredDevice(tenantId: string, deviceId: string, actorId: string): RegisteredDevice {
    const device = this.devices.get(`${tenantId}:${deviceId}`);
    if (!device) throw new AppError("DEVICE_NOT_REGISTERED", "Device must be registered before signing sync events", 403);
    if (device.actorId !== actorId) {
      throw new AppError("DEVICE_KEY_MISMATCH", "Device is bound to a different actor", 409);
    }
    if (device.status === "suspended") throw new AppError("DEVICE_SUSPENDED", "Device is suspended", 403);
    if (device.status === "revoked") throw new AppError("DEVICE_REVOKED", "Device is revoked", 403);
    for (const [scopeType, scopeId] of [
      ["organization", tenantId],
      ["user", actorId],
      ["device", deviceId],
    ] as const) {
      const trust = this.trustStates.get(this.trustKey(tenantId, scopeType, scopeId));
      if (trust && blockingTrustStates.has(trust.state)) throw blockedTrustError(scopeType, trust.state);
    }
    return device;
  }

  private ensureRegisteredKey(
    tenantId: string,
    actorId: string,
    deviceId: string,
    deviceKey: DeviceSigningKey,
  ): RegisteredKey {
    const registered = this.keys.get(`${tenantId}:${deviceKey.keyId}`);
    if (!registered) throw new AppError("KEY_NOT_REGISTERED", "Signing key must be registered before signed sync", 403);
    if (
      registered.actorId !== actorId ||
      registered.deviceId !== deviceId ||
      registered.algorithm !== deviceKey.algorithm ||
      registered.publicKeyBase64 !== deviceKey.publicKeyBase64
    ) {
      throw new AppError("DEVICE_KEY_MISMATCH", "Device signing binding cannot be changed", 409);
    }
    if (registered.status === "revoked") throw new AppError("KEY_REVOKED", "Signing key is revoked", 403);
    const trust = this.trustStates.get(this.trustKey(tenantId, "key", deviceKey.keyId));
    if (trust && blockingTrustStates.has(trust.state)) throw blockedTrustError("key", trust.state);
    return registered;
  }

  async create(type: ResourceType, tenantId: string, payload: Record<string, unknown>): Promise<Resource> {
    const timestamp = now();
    const resource: Resource = {
      ...resourcePayload(payload),
      id: resourceId(payload),
      tenantId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.bucket(type).set(resource.id, resource);
    this.recordChange(type, resource);
    return structuredClone(resource);
  }

  async list(type: ResourceType, tenantId: string): Promise<Resource[]> {
    return [...this.bucket(type).values()]
      .filter((resource) => resource.tenantId === tenantId)
      .map((resource) => structuredClone(resource));
  }

  async get(type: ResourceType, tenantId: string, id: string): Promise<Resource | null> {
    const value = this.bucket(type).get(id);
    return value?.tenantId === tenantId ? structuredClone(value) : null;
  }

  async update(
    type: ResourceType,
    tenantId: string,
    id: string,
    patch: Record<string, unknown>,
    expectedUpdatedAt?: string,
  ): Promise<Resource> {
    const existing = this.bucket(type).get(id);
    if (!existing || existing.tenantId !== tenantId) {
      throw new AppError("NOT_FOUND", `${type} resource not found`, 404);
    }
    if (expectedUpdatedAt && expectedUpdatedAt !== existing.updatedAt) {
      throw new AppError("SYNC_CONFLICT", "Resource changed since it was last synchronized", 409, {
        current: existing,
      });
    }
    const updated = { ...existing, ...patch, id, tenantId, updatedAt: now() };
    this.bucket(type).set(id, updated);
    this.recordChange(type, updated);
    return structuredClone(updated);
  }

  async claimJob(types: ResourceType[]): Promise<Resource | null> {
    for (const type of types) {
      const job = [...this.bucket(type).values()].find(
        (value) => value.status === "queued" && Number(value.nextAttemptAt ?? 0) <= Date.now(),
      );
      if (job) {
        const claimed = await this.update(type, job.tenantId, job.id, { status: "processing" });
        return { ...claimed, resourceType: type };
      }
    }
    return null;
  }

  async appendAudit(tenantId: string, actorId: string, action: string, payload: unknown): Promise<void> {
    this.auditLog.push({ tenantId, actorId, action, payload, occurredAt: now() });
  }

  async findIdempotency(tenantId: string, key: string): Promise<unknown | null> {
    return structuredClone(this.idempotency.get(`${tenantId}:${key}`) ?? null);
  }

  async saveIdempotency(tenantId: string, key: string, response: unknown): Promise<void> {
    this.idempotency.set(`${tenantId}:${key}`, structuredClone(response));
  }

  async changes(tenantId: string, cursor: number, limit: number): Promise<Change[]> {
    return this.changeLog.filter((change) => change.sequence > cursor && change.payload.tenantId === tenantId).slice(0, limit);
  }

  async listOrganizationUsers(tenantId: string): Promise<OrganizationUser[]> {
    return [...this.organizationUsers.values()]
      .filter((user) => user.tenantId === tenantId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((user) => structuredClone(user));
  }

  async upsertOrganizationUser(tenantId: string, input: UpsertOrganizationUserInput): Promise<OrganizationUser> {
    const index = `${tenantId}:${input.actorId}`;
    const timestamp = now();
    const existing = this.organizationUsers.get(index);
    const roles = input.roles ?? existing?.roles ?? [];
    const user: OrganizationUser = {
      tenantId,
      actorId: input.actorId,
      subjectId: input.subjectId ?? existing?.subjectId ?? null,
      displayName: input.displayName ?? existing?.displayName ?? null,
      email: input.email ?? existing?.email ?? null,
      roles: structuredClone(roles),
      status: input.status ?? existing?.status ?? "active",
      lastAuthenticatedAt: input.lastAuthenticatedAt ?? existing?.lastAuthenticatedAt ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.organizationUsers.set(index, user);
    return structuredClone(user);
  }

  async getOrganizationUser(tenantId: string, actorId: string): Promise<OrganizationUser | null> {
    return structuredClone(this.organizationUsers.get(`${tenantId}:${actorId}`) ?? null);
  }

  async getIdentitySnapshot(tenantId: string, actorId: string): Promise<OrganizationIdentitySnapshot> {
    const devices = await this.listDevices(tenantId, actorId);
    const keys = (await this.listSigningKeys(tenantId)).filter((key) => key.actorId === actorId);
    return {
      user: await this.getOrganizationUser(tenantId, actorId),
      devices,
      keys,
    };
  }

  async listDevices(tenantId: string, actorId?: string): Promise<RegisteredDevice[]> {
    return [...this.devices.values()]
      .filter((device) => device.tenantId === tenantId && (!actorId || device.actorId === actorId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((device) => structuredClone(device));
  }

  async registerDevice(tenantId: string, actorId: string, input: RegisterDeviceInput): Promise<RegisteredDevice> {
    const index = `${tenantId}:${input.deviceId}`;
    const timestamp = now();
    const existing = this.devices.get(index);
    if (existing && existing.actorId !== actorId) {
      throw new AppError("DEVICE_KEY_MISMATCH", "Device is already registered to another actor", 409);
    }
    const device: RegisteredDevice = {
      tenantId,
      deviceId: input.deviceId,
      actorId,
      displayName: input.displayName,
      platform: input.platform,
      appVersion: input.appVersion,
      osVersion: input.osVersion,
      keyProtection: input.keyProtection,
      status: existing?.status ?? "active",
      statusReason: existing?.statusReason ?? null,
      metadata: structuredClone(input.metadata),
      lastSeenAt: timestamp,
      lastAttestedAt: existing?.lastAttestedAt ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.devices.set(index, device);
    return structuredClone(device);
  }

  async getDevice(tenantId: string, deviceId: string): Promise<RegisteredDevice | null> {
    return structuredClone(this.devices.get(`${tenantId}:${deviceId}`) ?? null);
  }

  async updateDeviceStatus(
    tenantId: string,
    deviceId: string,
    _actorId: string,
    input: UpdateDeviceStatusInput,
  ): Promise<RegisteredDevice> {
    const existing = this.devices.get(`${tenantId}:${deviceId}`);
    if (!existing) throw new AppError("NOT_FOUND", "Device not found", 404);
    const updated: RegisteredDevice = {
      ...existing,
      status: input.status,
      statusReason: input.reason ?? null,
      updatedAt: now(),
    };
    this.devices.set(`${tenantId}:${deviceId}`, updated);
    return structuredClone(updated);
  }

  async listSigningKeys(tenantId: string, deviceId?: string): Promise<RegisteredKey[]> {
    return [...this.keys.values()]
      .filter((key) => key.tenantId === tenantId && (!deviceId || key.deviceId === deviceId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((key) => structuredClone(key));
  }

  async registerSigningKey(
    tenantId: string,
    actorId: string,
    deviceId: string,
    deviceKey: DeviceSigningKey,
  ): Promise<RegisteredKey> {
    this.ensureRegisteredDevice(tenantId, deviceId, actorId);
    const keyIndex = `${tenantId}:${deviceKey.keyId}`;
    const existing = this.keys.get(keyIndex);
    const deviceBinding = [...this.keys.values()].find((key) => key.tenantId === tenantId && key.deviceId === deviceId);
    if (
      (existing && (
        existing.actorId !== actorId ||
        existing.deviceId !== deviceId ||
        existing.algorithm !== deviceKey.algorithm ||
        existing.publicKeyBase64 !== deviceKey.publicKeyBase64
      )) ||
      (deviceBinding && deviceBinding.keyId !== deviceKey.keyId)
    ) {
      throw new AppError("DEVICE_KEY_MISMATCH", "Device signing binding cannot be changed", 409);
    }
    const timestamp = now();
    const registered: RegisteredKey = {
      tenantId,
      keyId: deviceKey.keyId,
      deviceId,
      actorId,
      algorithm: deviceKey.algorithm,
      publicKeyBase64: deviceKey.publicKeyBase64,
      status: existing?.status ?? "active",
      statusReason: existing?.statusReason ?? null,
      revokedAt: existing?.revokedAt ?? null,
      revokedByActorId: existing?.revokedByActorId ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.keys.set(keyIndex, registered);
    return structuredClone(registered);
  }

  async getSigningKey(tenantId: string, keyId: string): Promise<RegisteredKey | null> {
    return structuredClone(this.keys.get(`${tenantId}:${keyId}`) ?? null);
  }

  async revokeSigningKey(tenantId: string, keyId: string, actorId: string, reason: string): Promise<RegisteredKey> {
    const existing = this.keys.get(`${tenantId}:${keyId}`);
    if (!existing) throw new AppError("NOT_FOUND", "Signing key not found", 404);
    const updated: RegisteredKey = {
      ...existing,
      status: "revoked",
      statusReason: reason,
      revokedAt: now(),
      revokedByActorId: actorId,
      updatedAt: now(),
    };
    this.keys.set(`${tenantId}:${keyId}`, updated);
    return structuredClone(updated);
  }

  async listAttestationChallenges(tenantId: string, deviceId?: string): Promise<AttestationChallenge[]> {
    return [...this.attestationChallenges.values()]
      .filter((challenge) => challenge.tenantId === tenantId && (!deviceId || challenge.deviceId === deviceId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((challenge) => structuredClone(challenge));
  }

  async createAttestationChallenge(
    tenantId: string,
    actorId: string,
    input: CreateAttestationChallengeInput,
  ): Promise<AttestationChallenge> {
    this.ensureRegisteredDevice(tenantId, input.deviceId, actorId);
    if (input.keyId) {
      const key = await this.getSigningKey(tenantId, input.keyId);
      if (!key) throw new AppError("NOT_FOUND", "Signing key not found", 404);
      this.ensureRegisteredKey(tenantId, actorId, input.deviceId, {
        keyId: key.keyId,
        algorithm: key.algorithm as DeviceSigningKey["algorithm"],
        publicKeyBase64: key.publicKeyBase64,
      });
    }
    const timestamp = now();
    const challenge: AttestationChallenge = {
      challengeId: randomUUID(),
      tenantId,
      deviceId: input.deviceId,
      actorId,
      keyId: input.keyId ?? null,
      provider: input.provider,
      challenge: input.challenge,
      status: "pending",
      metadata: structuredClone(input.metadata),
      expiresAt: input.expiresAt,
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.attestationChallenges.set(`${tenantId}:${challenge.challengeId}`, challenge);
    return structuredClone(challenge);
  }

  async listAttestations(tenantId: string, deviceId?: string): Promise<AttestationRecord[]> {
    return this.attestationRecords
      .filter((record) => record.tenantId === tenantId && (!deviceId || record.deviceId === deviceId))
      .map((record) => structuredClone(record));
  }

  async recordAttestation(tenantId: string, actorId: string, input: RecordAttestationInput): Promise<AttestationRecord> {
    const device = this.ensureRegisteredDevice(tenantId, input.deviceId, actorId);
    if (input.keyId) {
      const key = this.keys.get(`${tenantId}:${input.keyId}`);
      if (!key) throw new AppError("NOT_FOUND", "Signing key not found", 404);
      this.ensureRegisteredKey(tenantId, actorId, input.deviceId, {
        keyId: key.keyId,
        algorithm: key.algorithm as DeviceSigningKey["algorithm"],
        publicKeyBase64: key.publicKeyBase64,
      });
    }
    if (input.challengeId) {
      const challengeIndex = `${tenantId}:${input.challengeId}`;
      const challenge = this.attestationChallenges.get(challengeIndex);
      if (
        !challenge ||
        challenge.deviceId !== input.deviceId ||
        challenge.actorId !== actorId ||
        challenge.provider !== input.provider
      ) {
        throw new AppError("NOT_FOUND", "Attestation challenge not found", 404);
      }
      if (
        challenge.status !== "pending" ||
        (challenge.keyId !== null && challenge.keyId !== (input.keyId ?? null))
      ) {
        throw new AppError("INVALID_ATTESTATION_CHALLENGE", "Attestation challenge is invalid or already used", 409);
      }
      const expired = new Date(challenge.expiresAt).getTime() <= Date.now();
      if (expired) {
        this.attestationChallenges.set(challengeIndex, {
          ...challenge,
          status: "expired",
          updatedAt: now(),
        });
        throw new AppError("ATTESTATION_CHALLENGE_EXPIRED", "Attestation challenge has expired", 409);
      }
      const updatedChallenge: AttestationChallenge = {
        ...challenge,
        status: "completed",
        completedAt: now(),
        updatedAt: now(),
      };
      this.attestationChallenges.set(challengeIndex, updatedChallenge);
    }
    const record: AttestationRecord = {
      attestationId: randomUUID(),
      tenantId,
      deviceId: input.deviceId,
      actorId,
      keyId: input.keyId ?? null,
      challengeId: input.challengeId ?? null,
      provider: input.provider,
      status: input.status,
      verified: input.verified,
      reason: input.reason,
      providerReference: input.providerReference ?? null,
      evidence: structuredClone(input.evidence),
      payloadDigest: input.payloadDigest,
      createdAt: now(),
    };
    this.attestationRecords.push(record);
    this.devices.set(`${tenantId}:${input.deviceId}`, {
      ...device,
      lastAttestedAt: record.createdAt,
      updatedAt: record.createdAt,
    });
    return structuredClone(record);
  }

  async getTrustState(tenantId: string, scopeType: TrustScopeType, scopeId: string): Promise<TrustStateRecord | null> {
    return structuredClone(this.trustStates.get(this.trustKey(tenantId, scopeType, scopeId)) ?? null);
  }

  async setTrustState(tenantId: string, actorId: string, input: SetTrustStateInput): Promise<TrustStateRecord> {
    const index = this.trustKey(tenantId, input.scopeType, input.scopeId);
    const timestamp = now();
    const existing = this.trustStates.get(index);
    const current: TrustStateRecord = {
      tenantId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      state: input.state,
      reason: input.reason,
      details: structuredClone(input.details),
      updatedByActorId: actorId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.trustStates.set(index, current);
    this.trustHistory.push({
      entryId: randomUUID(),
      tenantId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      state: input.state,
      reason: input.reason,
      details: structuredClone(input.details),
      actorId,
      createdAt: timestamp,
    });
    return structuredClone(current);
  }

  async listTrustHistory(
    tenantId: string,
    filters: Partial<Pick<TrustStateRecord, "scopeType" | "scopeId">> = {},
  ): Promise<TrustHistoryEntry[]> {
    return this.trustHistory
      .filter((entry) =>
        entry.tenantId === tenantId &&
        (filters.scopeType === undefined || entry.scopeType === filters.scopeType) &&
        (filters.scopeId === undefined || entry.scopeId === filters.scopeId))
      .map((entry) => structuredClone(entry));
  }

  async appendSignedEvents(
    tenantId: string,
    deviceKey: DeviceSigningKey & { deviceId: string; actorId: string },
    events: SignedEvent[],
  ): Promise<void> {
    const registeredDevice = this.ensureRegisteredDevice(tenantId, deviceKey.deviceId, deviceKey.actorId);
    this.ensureRegisteredKey(tenantId, deviceKey.actorId, deviceKey.deviceId, deviceKey);
    this.devices.set(`${tenantId}:${deviceKey.deviceId}`, {
      ...registeredDevice,
      lastSeenAt: now(),
      updatedAt: now(),
    });
    const keyIndex = `${tenantId}:${deviceKey.keyId}`;
    const deviceIndex = `${tenantId}:${deviceKey.deviceId}`;
    const bindings = [this.deviceKeysById.get(keyIndex), this.deviceKeysByDevice.get(deviceIndex)]
      .filter((binding) => binding !== undefined);
    if (bindings.some((binding) =>
      binding.deviceId !== deviceKey.deviceId ||
      binding.actorId !== deviceKey.actorId ||
      binding.keyId !== deviceKey.keyId ||
      binding.algorithm !== deviceKey.algorithm ||
      binding.publicKeyBase64 !== deviceKey.publicKeyBase64
    )) {
      throw new AppError("DEVICE_KEY_MISMATCH", "Device signing binding cannot be changed", 409);
    }
    for (const event of events) {
      if (
        event.tenantId !== tenantId ||
        event.deviceId !== deviceKey.deviceId ||
        event.actorId !== deviceKey.actorId ||
        event.keyId !== deviceKey.keyId
      ) {
        throw new AppError("INVALID_EVENT_CHAIN", "Signed event batch binding is invalid", 409);
      }
    }
    const chainIndex = deviceIndex;
    const chain = this.signedEvents.get(chainIndex) ?? [];
    let sequence = chain.at(-1)?.sequence ?? 0;
    let previousHash = chain.at(-1)?.eventHash ?? GENESIS_HASH;
    const pendingIds = new Set<string>();
    const existingEvents = events.map((event) => this.eventsById.get(event.eventId));
    if (existingEvents.some((event) => event !== undefined)) {
      const replayStart = sequence - events.length + 1;
      const exactTailReplay = existingEvents.every((stored, index) =>
        stored?.tenantId === tenantId &&
        stored.deviceId === deviceKey.deviceId &&
        stored.event.sequence === replayStart + index &&
        canonicalJson(stored.event) === canonicalJson(events[index]),
      );
      if (!exactTailReplay || events.at(-1)?.sequence !== sequence) {
        throw new AppError("INVALID_EVENT_CHAIN", "Signed event replay is not an exact chain tail", 409);
      }
      return;
    }
    for (const event of events) {
      if (
        event.sequence !== sequence + 1 ||
        event.prevHash !== previousHash ||
        event.eventHash !== signedEventHash(event) ||
        pendingIds.has(event.eventId)
      ) {
        throw new AppError("INVALID_EVENT_CHAIN", "Signed event chain is not contiguous", 409);
      }
      sequence = event.sequence;
      previousHash = event.eventHash;
      pendingIds.add(event.eventId);
    }
    this.deviceKeysById.set(keyIndex, structuredClone(deviceKey));
    this.deviceKeysByDevice.set(deviceIndex, structuredClone(deviceKey));
    this.signedEvents.set(chainIndex, [...chain, ...structuredClone(events)]);
    for (const event of events) {
      this.eventsById.set(event.eventId, {
        tenantId,
        deviceId: deviceKey.deviceId,
        event: structuredClone(event),
      });
    }
  }

  private recordChange(type: ResourceType, resource: Resource): void {
    this.changeLog.push({
      sequence: this.changeLog.length + 1,
      resourceType: type,
      resourceId: resource.id,
      operation: "upsert",
      payload: structuredClone(resource),
      occurredAt: now(),
    });
  }
}

const tableByType: Record<ResourceType, string> = {
  suppliers: "suppliers",
  supplier_invitations: "supplier_invitations",
  plots: "coffee_plots",
  shipments: "shipments",
  documents: "documents",
  analyses: "analysis_jobs",
  evidence_packs: "evidence_packs",
  dds_submissions: "dds_submissions",
};

function fromRow(row: Record<string, unknown>): Resource {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return {
    ...payload,
    id: String(row.id),
    tenantId: String(row.tenant_id),
    ...(row.status === null ? {} : { status: String(row.status) }),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function organizationUserFromRow(row: Record<string, unknown>): OrganizationUser {
  return {
    tenantId: String(row.tenant_id),
    actorId: String(row.actor_id),
    subjectId: row.subject_id === null ? null : String(row.subject_id),
    displayName: row.display_name === null ? null : String(row.display_name),
    email: row.email === null ? null : String(row.email),
    roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
    status: String(row.status) as UserStatus,
    lastAuthenticatedAt: row.last_authenticated_at === null ? null : new Date(String(row.last_authenticated_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function deviceFromRow(row: Record<string, unknown>): RegisteredDevice {
  return {
    tenantId: String(row.tenant_id),
    deviceId: String(row.device_id),
    actorId: String(row.actor_id),
    displayName: String(row.display_name),
    platform: String(row.platform) as DevicePlatform,
    appVersion: String(row.app_version),
    osVersion: String(row.os_version),
    keyProtection: String(row.key_protection) as KeyProtectionLevel,
    status: String(row.status) as DeviceStatus,
    statusReason: row.status_reason === null ? null : String(row.status_reason),
    metadata: jsonRecord(row.metadata),
    lastSeenAt: row.last_seen_at === null ? null : new Date(String(row.last_seen_at)).toISOString(),
    lastAttestedAt: row.last_attested_at === null ? null : new Date(String(row.last_attested_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function signingKeyFromRow(row: Record<string, unknown>): RegisteredKey {
  return {
    tenantId: String(row.tenant_id),
    keyId: String(row.key_id),
    deviceId: String(row.device_id),
    actorId: String(row.actor_id),
    algorithm: String(row.algorithm),
    publicKeyBase64: String(row.public_key_base64),
    status: String(row.status) as KeyStatus,
    statusReason: row.status_reason === null ? null : String(row.status_reason),
    revokedAt: row.revoked_at === null ? null : new Date(String(row.revoked_at)).toISOString(),
    revokedByActorId: row.revoked_by_actor_id === null ? null : String(row.revoked_by_actor_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function attestationChallengeFromRow(row: Record<string, unknown>): AttestationChallenge {
  return {
    challengeId: String(row.challenge_id),
    tenantId: String(row.tenant_id),
    deviceId: String(row.device_id),
    actorId: String(row.actor_id),
    keyId: row.key_id === null ? null : String(row.key_id),
    provider: String(row.provider) as AttestationProviderName,
    challenge: String(row.challenge),
    status: String(row.status) as AttestationChallenge["status"],
    metadata: jsonRecord(row.metadata),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    completedAt: row.completed_at === null ? null : new Date(String(row.completed_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function attestationRecordFromRow(row: Record<string, unknown>): AttestationRecord {
  return {
    attestationId: String(row.attestation_id),
    tenantId: String(row.tenant_id),
    deviceId: String(row.device_id),
    actorId: String(row.actor_id),
    keyId: row.key_id === null ? null : String(row.key_id),
    challengeId: row.challenge_id === null ? null : String(row.challenge_id),
    provider: String(row.provider) as AttestationProviderName,
    status: String(row.status) as AttestationStatus,
    verified: Boolean(row.verified),
    reason: String(row.reason),
    providerReference: row.provider_reference === null ? null : String(row.provider_reference),
    evidence: jsonRecord(row.evidence),
    payloadDigest: String(row.payload_digest),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function trustStateFromRow(row: Record<string, unknown>): TrustStateRecord {
  return {
    tenantId: String(row.tenant_id),
    scopeType: String(row.scope_type) as TrustScopeType,
    scopeId: String(row.scope_id),
    state: String(row.state) as TrustState,
    reason: String(row.reason),
    details: jsonRecord(row.details),
    updatedByActorId: String(row.updated_by_actor_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function trustHistoryFromRow(row: Record<string, unknown>): TrustHistoryEntry {
  return {
    entryId: String(row.entry_id),
    tenantId: String(row.tenant_id),
    scopeType: String(row.scope_type) as TrustScopeType,
    scopeId: String(row.scope_id),
    state: String(row.state) as TrustState,
    reason: String(row.reason),
    details: jsonRecord(row.details),
    actorId: String(row.actor_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export class PgRepository implements Repository {
  constructor(private readonly pool: pg.Pool) {}

  static connect(connectionString: string): PgRepository {
    return new PgRepository(new Pool({ connectionString, max: 20 }));
  }

  private async assertRegisteredDevice(
    client: pg.Pool | pg.PoolClient,
    tenantId: string,
    deviceId: string,
    actorId: string,
  ): Promise<RegisteredDevice> {
    const deviceResult = await client.query(
      `SELECT tenant_id, device_id, actor_id, display_name, platform, app_version, os_version,
              key_protection, status, status_reason, metadata, last_seen_at, last_attested_at,
              created_at, updated_at
         FROM organization_devices
        WHERE tenant_id = $1 AND device_id = $2`,
      [tenantId, deviceId],
    );
    if (!deviceResult.rowCount) {
      throw new AppError("DEVICE_NOT_REGISTERED", "Device must be registered before signing sync events", 403);
    }
    const device = deviceFromRow(deviceResult.rows[0]);
    if (device.actorId !== actorId) throw new AppError("DEVICE_KEY_MISMATCH", "Device is bound to a different actor", 409);
    if (device.status === "suspended") throw new AppError("DEVICE_SUSPENDED", "Device is suspended", 403);
    if (device.status === "revoked") throw new AppError("DEVICE_REVOKED", "Device is revoked", 403);
    const trustResult = await client.query(
      `SELECT scope_type, state
         FROM organization_trust_state
        WHERE tenant_id = $1 AND (
          (scope_type = 'organization' AND scope_id = $1) OR
          (scope_type = 'user' AND scope_id = $2) OR
          (scope_type = 'device' AND scope_id = $3)
        )`,
      [tenantId, actorId, deviceId],
    );
    for (const row of trustResult.rows) {
      const state = String(row.state) as TrustState;
      if (blockingTrustStates.has(state)) {
        throw blockedTrustError(String(row.scope_type) as TrustScopeType, state);
      }
    }
    return device;
  }

  private async assertRegisteredKey(
    client: pg.Pool | pg.PoolClient,
    tenantId: string,
    actorId: string,
    deviceId: string,
    deviceKey: DeviceSigningKey,
  ): Promise<RegisteredKey> {
    const keyResult = await client.query(
      `SELECT tenant_id, key_id, device_id, actor_id, algorithm, public_key_base64, status,
              status_reason, revoked_at, revoked_by_actor_id, created_at, updated_at
         FROM organization_signing_keys
        WHERE tenant_id = $1 AND key_id = $2`,
      [tenantId, deviceKey.keyId],
    );
    if (!keyResult.rowCount) {
      throw new AppError("KEY_NOT_REGISTERED", "Signing key must be registered before signed sync", 403);
    }
    const key = signingKeyFromRow(keyResult.rows[0]);
    if (
      key.actorId !== actorId ||
      key.deviceId !== deviceId ||
      key.algorithm !== deviceKey.algorithm ||
      key.publicKeyBase64 !== deviceKey.publicKeyBase64
    ) {
      throw new AppError("DEVICE_KEY_MISMATCH", "Device signing binding cannot be changed", 409);
    }
    if (key.status === "revoked") throw new AppError("KEY_REVOKED", "Signing key is revoked", 403);
    const trustResult = await client.query(
      `SELECT state
         FROM organization_trust_state
        WHERE tenant_id = $1 AND scope_type = 'key' AND scope_id = $2`,
      [tenantId, deviceKey.keyId],
    );
    for (const row of trustResult.rows) {
      const state = String(row.state) as TrustState;
      if (blockingTrustStates.has(state)) throw blockedTrustError("key", state);
    }
    return key;
  }

  async create(type: ResourceType, tenantId: string, payload: Record<string, unknown>): Promise<Resource> {
    const id = resourceId(payload);
    const storedPayload = resourcePayload(payload);
    const status = typeof payload.status === "string" ? payload.status : null;
    const result = await this.pool.query(
      `INSERT INTO ${tableByType[type]} (id, tenant_id, status, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, tenant_id, status, payload, created_at, updated_at`,
      [id, tenantId, status, JSON.stringify(storedPayload)],
    );
    const resource = fromRow(result.rows[0]);
    await this.recordChange(type, resource);
    return resource;
  }

  async list(type: ResourceType, tenantId: string): Promise<Resource[]> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, status, payload, created_at, updated_at
       FROM ${tableByType[type]} WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map(fromRow);
  }

  async get(type: ResourceType, tenantId: string, id: string): Promise<Resource | null> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, status, payload, created_at, updated_at
       FROM ${tableByType[type]} WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return result.rowCount ? fromRow(result.rows[0]) : null;
  }

  async update(
    type: ResourceType,
    tenantId: string,
    id: string,
    patch: Record<string, unknown>,
    expectedUpdatedAt?: string,
  ): Promise<Resource> {
    const storedPatch = Object.fromEntries(
      Object.entries(patch).filter(
        ([key]) => !["id", "tenantId", "createdAt", "updatedAt"].includes(key),
      ),
    );
    const result = await this.pool.query(
      `UPDATE ${tableByType[type]}
       SET payload = payload || $3::jsonb,
           status = CASE
             WHEN $3::jsonb ? 'status' AND jsonb_typeof($3::jsonb->'status') = 'string'
               THEN $3::jsonb->>'status'
             WHEN $3::jsonb ? 'status' THEN NULL
             ELSE status
           END,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
         AND ($4::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = $4::timestamptz)
       RETURNING id, tenant_id, status, payload, created_at, updated_at`,
      [tenantId, id, JSON.stringify(storedPatch), expectedUpdatedAt ?? null],
    );
    if (!result.rowCount) {
      const existing = await this.get(type, tenantId, id);
      if (!existing) throw new AppError("NOT_FOUND", `${type} resource not found`, 404);
      throw new AppError("SYNC_CONFLICT", "Resource changed since it was last synchronized", 409, {
        current: existing,
      });
    }
    const resource = fromRow(result.rows[0]);
    await this.recordChange(type, resource);
    return resource;
  }

  async claimJob(types: ResourceType[]): Promise<Resource | null> {
    for (const type of types) {
      const table = tableByType[type];
      const result = await this.pool.query(
        `WITH candidate AS (
           SELECT id FROM ${table}
           WHERE status = 'queued'
             AND COALESCE((payload->>'nextAttemptAt')::bigint, 0) <= $1
           ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE ${table} target SET status = 'processing',
           payload = jsonb_set(target.payload, '{status}', '"processing"'), updated_at = now()
         FROM candidate WHERE target.id = candidate.id
         RETURNING target.id, target.tenant_id, target.status, target.payload,
                   target.created_at, target.updated_at`,
        [Date.now()],
      );
      if (result.rowCount) return { ...fromRow(result.rows[0]), resourceType: type };
    }
    return null;
  }

  async appendAudit(tenantId: string, actorId: string, action: string, payload: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_log (tenant_id, actor_id, action, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [tenantId, actorId, action, JSON.stringify(payload)],
    );
  }

  async findIdempotency(tenantId: string, key: string): Promise<unknown | null> {
    const result = await this.pool.query(
      "SELECT response FROM idempotency_keys WHERE tenant_id = $1 AND key = $2",
      [tenantId, key],
    );
    return result.rowCount ? result.rows[0].response : null;
  }

  async saveIdempotency(tenantId: string, key: string, response: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO idempotency_keys (tenant_id, key, response)
       VALUES ($1, $2, $3::jsonb) ON CONFLICT (tenant_id, key) DO NOTHING`,
      [tenantId, key, JSON.stringify(response)],
    );
  }

  async changes(tenantId: string, cursor: number, limit: number): Promise<Change[]> {
    const result = await this.pool.query(
      `SELECT sequence, resource_type, resource_id, operation, payload, occurred_at
       FROM sync_changes WHERE tenant_id = $1 AND sequence > $2
       ORDER BY sequence LIMIT $3`,
      [tenantId, cursor, limit],
    );
    return result.rows.map((row) => ({
      sequence: Number(row.sequence),
      resourceType: row.resource_type as ResourceType,
      resourceId: String(row.resource_id),
      operation: "upsert",
      payload: row.payload as Resource,
      occurredAt: new Date(String(row.occurred_at)).toISOString(),
    }));
  }

  async listOrganizationUsers(tenantId: string): Promise<OrganizationUser[]> {
    const result = await this.pool.query(
      `SELECT tenant_id, actor_id, subject_id, display_name, email, roles, status,
              last_authenticated_at, created_at, updated_at
         FROM organization_users
        WHERE tenant_id = $1
        ORDER BY created_at, actor_id`,
      [tenantId],
    );
    return result.rows.map(organizationUserFromRow);
  }

  async upsertOrganizationUser(tenantId: string, input: UpsertOrganizationUserInput): Promise<OrganizationUser> {
    const result = await this.pool.query(
      `INSERT INTO organization_users
         (tenant_id, actor_id, subject_id, display_name, email, roles, status, last_authenticated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7, 'active'), $8::timestamptz)
       ON CONFLICT (tenant_id, actor_id) DO UPDATE SET
         subject_id = COALESCE(EXCLUDED.subject_id, organization_users.subject_id),
         display_name = COALESCE(EXCLUDED.display_name, organization_users.display_name),
         email = COALESCE(EXCLUDED.email, organization_users.email),
         roles = EXCLUDED.roles,
         status = COALESCE($7, organization_users.status),
         last_authenticated_at = COALESCE(EXCLUDED.last_authenticated_at, organization_users.last_authenticated_at),
         updated_at = now()
       RETURNING tenant_id, actor_id, subject_id, display_name, email, roles, status,
                 last_authenticated_at, created_at, updated_at`,
      [
        tenantId,
        input.actorId,
        input.subjectId ?? null,
        input.displayName ?? null,
        input.email ?? null,
        JSON.stringify(input.roles ?? []),
        input.status ?? null,
        input.lastAuthenticatedAt ?? null,
      ],
    );
    return organizationUserFromRow(result.rows[0]);
  }

  async getOrganizationUser(tenantId: string, actorId: string): Promise<OrganizationUser | null> {
    const result = await this.pool.query(
      `SELECT tenant_id, actor_id, subject_id, display_name, email, roles, status,
              last_authenticated_at, created_at, updated_at
         FROM organization_users
        WHERE tenant_id = $1 AND actor_id = $2`,
      [tenantId, actorId],
    );
    return result.rowCount ? organizationUserFromRow(result.rows[0]) : null;
  }

  async getIdentitySnapshot(tenantId: string, actorId: string): Promise<OrganizationIdentitySnapshot> {
    const [user, devices, keys] = await Promise.all([
      this.getOrganizationUser(tenantId, actorId),
      this.listDevices(tenantId, actorId),
      this.listSigningKeys(tenantId),
    ]);
    return {
      user,
      devices,
      keys: keys.filter((key) => key.actorId === actorId),
    };
  }

  async listDevices(tenantId: string, actorId?: string): Promise<RegisteredDevice[]> {
    const clauses = ["tenant_id = $1"];
    const values: unknown[] = [tenantId];
    if (actorId) {
      clauses.push(`actor_id = $${values.length + 1}`);
      values.push(actorId);
    }
    const result = await this.pool.query(
      `SELECT tenant_id, device_id, actor_id, display_name, platform, app_version, os_version,
              key_protection, status, status_reason, metadata, last_seen_at, last_attested_at,
              created_at, updated_at
         FROM organization_devices
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at, device_id`,
      values,
    );
    return result.rows.map(deviceFromRow);
  }

  async registerDevice(tenantId: string, actorId: string, input: RegisterDeviceInput): Promise<RegisteredDevice> {
    const result = await this.pool.query(
      `INSERT INTO organization_devices
         (tenant_id, device_id, actor_id, display_name, platform, app_version, os_version,
          key_protection, status, metadata, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9::jsonb, now())
       ON CONFLICT (tenant_id, device_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         platform = EXCLUDED.platform,
         app_version = EXCLUDED.app_version,
         os_version = EXCLUDED.os_version,
         key_protection = EXCLUDED.key_protection,
         metadata = EXCLUDED.metadata,
         last_seen_at = now(),
         updated_at = now()
       WHERE organization_devices.actor_id = EXCLUDED.actor_id
       RETURNING tenant_id, device_id, actor_id, display_name, platform, app_version, os_version,
                 key_protection, status, status_reason, metadata, last_seen_at, last_attested_at,
                 created_at, updated_at`,
      [
        tenantId,
        input.deviceId,
        actorId,
        input.displayName,
        input.platform,
        input.appVersion,
        input.osVersion,
        input.keyProtection,
        JSON.stringify(input.metadata),
      ],
    );
    if (!result.rowCount) {
      throw new AppError("DEVICE_KEY_MISMATCH", "Device is already registered to another actor", 409);
    }
    return deviceFromRow(result.rows[0]);
  }

  async getDevice(tenantId: string, deviceId: string): Promise<RegisteredDevice | null> {
    const result = await this.pool.query(
      `SELECT tenant_id, device_id, actor_id, display_name, platform, app_version, os_version,
              key_protection, status, status_reason, metadata, last_seen_at, last_attested_at,
              created_at, updated_at
         FROM organization_devices
        WHERE tenant_id = $1 AND device_id = $2`,
      [tenantId, deviceId],
    );
    return result.rowCount ? deviceFromRow(result.rows[0]) : null;
  }

  async updateDeviceStatus(
    tenantId: string,
    deviceId: string,
    _actorId: string,
    input: UpdateDeviceStatusInput,
  ): Promise<RegisteredDevice> {
    const result = await this.pool.query(
      `UPDATE organization_devices
          SET status = $3, status_reason = $4, updated_at = now()
        WHERE tenant_id = $1 AND device_id = $2
        RETURNING tenant_id, device_id, actor_id, display_name, platform, app_version, os_version,
                  key_protection, status, status_reason, metadata, last_seen_at, last_attested_at,
                  created_at, updated_at`,
      [tenantId, deviceId, input.status, input.reason ?? null],
    );
    if (!result.rowCount) throw new AppError("NOT_FOUND", "Device not found", 404);
    return deviceFromRow(result.rows[0]);
  }

  async listSigningKeys(tenantId: string, deviceId?: string): Promise<RegisteredKey[]> {
    const clauses = ["tenant_id = $1"];
    const values: unknown[] = [tenantId];
    if (deviceId) {
      clauses.push(`device_id = $${values.length + 1}`);
      values.push(deviceId);
    }
    const result = await this.pool.query(
      `SELECT tenant_id, key_id, device_id, actor_id, algorithm, public_key_base64, status,
              status_reason, revoked_at, revoked_by_actor_id, created_at, updated_at
         FROM organization_signing_keys
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at, key_id`,
      values,
    );
    return result.rows.map(signingKeyFromRow);
  }

  async registerSigningKey(
    tenantId: string,
    actorId: string,
    deviceId: string,
    deviceKey: DeviceSigningKey,
  ): Promise<RegisteredKey> {
    await this.assertRegisteredDevice(this.pool, tenantId, deviceId, actorId);
    const result = await this.pool.query(
      `WITH existing_device AS (
         SELECT key_id FROM organization_signing_keys WHERE tenant_id = $1 AND device_id = $2
       )
       INSERT INTO organization_signing_keys
         (tenant_id, key_id, device_id, actor_id, algorithm, public_key_base64, status)
       SELECT $1, $3, $2, $4, $5, $6, 'active'
       WHERE NOT EXISTS (SELECT 1 FROM existing_device WHERE key_id <> $3)
       ON CONFLICT (tenant_id, key_id) DO UPDATE SET
         algorithm = EXCLUDED.algorithm,
         public_key_base64 = EXCLUDED.public_key_base64,
         updated_at = now()
       WHERE organization_signing_keys.device_id = EXCLUDED.device_id
         AND organization_signing_keys.actor_id = EXCLUDED.actor_id
         AND organization_signing_keys.algorithm = EXCLUDED.algorithm
         AND organization_signing_keys.public_key_base64 = EXCLUDED.public_key_base64
       RETURNING tenant_id, key_id, device_id, actor_id, algorithm, public_key_base64, status,
                 status_reason, revoked_at, revoked_by_actor_id, created_at, updated_at`,
      [
        tenantId,
        deviceId,
        deviceKey.keyId,
        actorId,
        deviceKey.algorithm,
        deviceKey.publicKeyBase64,
      ],
    );
    if (!result.rowCount) {
      throw new AppError("DEVICE_KEY_MISMATCH", "Device signing binding cannot be changed", 409);
    }
    return signingKeyFromRow(result.rows[0]);
  }

  async getSigningKey(tenantId: string, keyId: string): Promise<RegisteredKey | null> {
    const result = await this.pool.query(
      `SELECT tenant_id, key_id, device_id, actor_id, algorithm, public_key_base64, status,
              status_reason, revoked_at, revoked_by_actor_id, created_at, updated_at
         FROM organization_signing_keys
        WHERE tenant_id = $1 AND key_id = $2`,
      [tenantId, keyId],
    );
    return result.rowCount ? signingKeyFromRow(result.rows[0]) : null;
  }

  async revokeSigningKey(tenantId: string, keyId: string, actorId: string, reason: string): Promise<RegisteredKey> {
    const result = await this.pool.query(
      `UPDATE organization_signing_keys
          SET status = 'revoked',
              status_reason = $4,
              revoked_at = now(),
              revoked_by_actor_id = $3,
              updated_at = now()
        WHERE tenant_id = $1 AND key_id = $2
        RETURNING tenant_id, key_id, device_id, actor_id, algorithm, public_key_base64, status,
                  status_reason, revoked_at, revoked_by_actor_id, created_at, updated_at`,
      [tenantId, keyId, actorId, reason],
    );
    if (!result.rowCount) throw new AppError("NOT_FOUND", "Signing key not found", 404);
    return signingKeyFromRow(result.rows[0]);
  }

  async listAttestationChallenges(tenantId: string, deviceId?: string): Promise<AttestationChallenge[]> {
    const clauses = ["tenant_id = $1"];
    const values: unknown[] = [tenantId];
    if (deviceId) {
      clauses.push(`device_id = $${values.length + 1}`);
      values.push(deviceId);
    }
    const result = await this.pool.query(
      `SELECT challenge_id, tenant_id, device_id, actor_id, key_id, provider, challenge, status,
              metadata, expires_at, completed_at, created_at, updated_at
         FROM device_attestation_challenges
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at, challenge_id`,
      values,
    );
    return result.rows.map(attestationChallengeFromRow);
  }

  async createAttestationChallenge(
    tenantId: string,
    actorId: string,
    input: CreateAttestationChallengeInput,
  ): Promise<AttestationChallenge> {
    await this.assertRegisteredDevice(this.pool, tenantId, input.deviceId, actorId);
    if (input.keyId) {
      const key = await this.getSigningKey(tenantId, input.keyId);
      if (!key || key.actorId !== actorId || key.deviceId !== input.deviceId) {
        throw new AppError("NOT_FOUND", "Signing key not found", 404);
      }
    }
    const result = await this.pool.query(
      `INSERT INTO device_attestation_challenges
         (challenge_id, tenant_id, device_id, actor_id, key_id, provider, challenge, status,
          metadata, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending', $7::jsonb, $8::timestamptz)
       RETURNING challenge_id, tenant_id, device_id, actor_id, key_id, provider, challenge, status,
                 metadata, expires_at, completed_at, created_at, updated_at`,
      [
        tenantId,
        input.deviceId,
        actorId,
        input.keyId ?? null,
        input.provider,
        input.challenge,
        JSON.stringify(input.metadata),
        input.expiresAt,
      ],
    );
    return attestationChallengeFromRow(result.rows[0]);
  }

  async listAttestations(tenantId: string, deviceId?: string): Promise<AttestationRecord[]> {
    const clauses = ["tenant_id = $1"];
    const values: unknown[] = [tenantId];
    if (deviceId) {
      clauses.push(`device_id = $${values.length + 1}`);
      values.push(deviceId);
    }
    const result = await this.pool.query(
      `SELECT attestation_id, tenant_id, device_id, actor_id, key_id, challenge_id, provider, status,
              verified, reason, provider_reference, evidence, payload_digest, created_at
         FROM device_attestations
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at, attestation_id`,
      values,
    );
    return result.rows.map(attestationRecordFromRow);
  }

  async recordAttestation(tenantId: string, actorId: string, input: RecordAttestationInput): Promise<AttestationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.assertRegisteredDevice(client, tenantId, input.deviceId, actorId);
      if (input.keyId) {
        const key = await this.getSigningKey(tenantId, input.keyId);
        if (!key) throw new AppError("NOT_FOUND", "Signing key not found", 404);
        await this.assertRegisteredKey(client, tenantId, actorId, input.deviceId, {
          keyId: key.keyId,
          algorithm: key.algorithm as DeviceSigningKey["algorithm"],
          publicKeyBase64: key.publicKeyBase64,
        });
      }
      if (input.challengeId) {
        const challengeResult = await client.query(
          `SELECT challenge_id, tenant_id, device_id, actor_id, key_id, provider, challenge, status,
                  metadata, expires_at, completed_at, created_at, updated_at
             FROM device_attestation_challenges
            WHERE tenant_id = $1 AND challenge_id = $2
            FOR UPDATE`,
          [tenantId, input.challengeId],
        );
        if (!challengeResult.rowCount) throw new AppError("NOT_FOUND", "Attestation challenge not found", 404);
        const challenge = attestationChallengeFromRow(challengeResult.rows[0]);
        if (
          challenge.deviceId !== input.deviceId ||
          challenge.actorId !== actorId ||
          challenge.provider !== input.provider
        ) {
          throw new AppError("NOT_FOUND", "Attestation challenge not found", 404);
        }
        if (
          challenge.status !== "pending" ||
          (challenge.keyId !== null && challenge.keyId !== (input.keyId ?? null))
        ) {
          throw new AppError("INVALID_ATTESTATION_CHALLENGE", "Attestation challenge is invalid or already used", 409);
        }
        if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
          throw new AppError("ATTESTATION_CHALLENGE_EXPIRED", "Attestation challenge has expired", 409);
        }
        await client.query(
          `UPDATE device_attestation_challenges
              SET status = 'completed', completed_at = now(), updated_at = now()
            WHERE tenant_id = $1 AND challenge_id = $2`,
          [tenantId, input.challengeId],
        );
      }
      const result = await client.query(
        `INSERT INTO device_attestations
           (attestation_id, tenant_id, device_id, actor_id, key_id, challenge_id, provider, status,
            verified, reason, provider_reference, evidence, payload_digest)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
         RETURNING attestation_id, tenant_id, device_id, actor_id, key_id, challenge_id, provider, status,
                   verified, reason, provider_reference, evidence, payload_digest, created_at`,
        [
          tenantId,
          input.deviceId,
          actorId,
          input.keyId ?? null,
          input.challengeId ?? null,
          input.provider,
          input.status,
          input.verified,
          input.reason,
          input.providerReference ?? null,
          JSON.stringify(input.evidence),
          input.payloadDigest,
        ],
      );
      await client.query(
        `UPDATE organization_devices
            SET last_attested_at = now(), updated_at = now()
          WHERE tenant_id = $1 AND device_id = $2`,
        [tenantId, input.deviceId],
      );
      await client.query("COMMIT");
      return attestationRecordFromRow(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getTrustState(tenantId: string, scopeType: TrustScopeType, scopeId: string): Promise<TrustStateRecord | null> {
    const result = await this.pool.query(
      `SELECT tenant_id, scope_type, scope_id, state, reason, details, updated_by_actor_id,
              created_at, updated_at
         FROM organization_trust_state
        WHERE tenant_id = $1 AND scope_type = $2 AND scope_id = $3`,
      [tenantId, scopeType, scopeId],
    );
    return result.rowCount ? trustStateFromRow(result.rows[0]) : null;
  }

  async setTrustState(tenantId: string, actorId: string, input: SetTrustStateInput): Promise<TrustStateRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const stateResult = await client.query(
        `INSERT INTO organization_trust_state
           (tenant_id, scope_type, scope_id, state, reason, details, updated_by_actor_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (tenant_id, scope_type, scope_id) DO UPDATE SET
           state = EXCLUDED.state,
           reason = EXCLUDED.reason,
           details = EXCLUDED.details,
           updated_by_actor_id = EXCLUDED.updated_by_actor_id,
           updated_at = now()
         RETURNING tenant_id, scope_type, scope_id, state, reason, details, updated_by_actor_id,
                   created_at, updated_at`,
        [
          tenantId,
          input.scopeType,
          input.scopeId,
          input.state,
          input.reason,
          JSON.stringify(input.details),
          actorId,
        ],
      );
      await client.query(
        `INSERT INTO organization_trust_history
           (entry_id, tenant_id, scope_type, scope_id, state, reason, details, actor_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          tenantId,
          input.scopeType,
          input.scopeId,
          input.state,
          input.reason,
          JSON.stringify(input.details),
          actorId,
        ],
      );
      await client.query("COMMIT");
      return trustStateFromRow(stateResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listTrustHistory(
    tenantId: string,
    filters: Partial<Pick<TrustStateRecord, "scopeType" | "scopeId">> = {},
  ): Promise<TrustHistoryEntry[]> {
    const clauses = ["tenant_id = $1"];
    const values: unknown[] = [tenantId];
    if (filters.scopeType) {
      clauses.push(`scope_type = $${values.length + 1}`);
      values.push(filters.scopeType);
    }
    if (filters.scopeId) {
      clauses.push(`scope_id = $${values.length + 1}`);
      values.push(filters.scopeId);
    }
    const result = await this.pool.query(
      `SELECT entry_id, tenant_id, scope_type, scope_id, state, reason, details, actor_id, created_at
         FROM organization_trust_history
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at, entry_id`,
      values,
    );
    return result.rows.map(trustHistoryFromRow);
  }

  async appendSignedEvents(
    tenantId: string,
    deviceKey: DeviceSigningKey & { deviceId: string; actorId: string },
    events: SignedEvent[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.assertRegisteredDevice(client, tenantId, deviceKey.deviceId, deviceKey.actorId);
      await this.assertRegisteredKey(client, tenantId, deviceKey.actorId, deviceKey.deviceId, deviceKey);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${tenantId}:key:${deviceKey.keyId}`],
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${tenantId}:device:${deviceKey.deviceId}`],
      );
      const keyResult = await client.query(
        `SELECT device_id, actor_id, key_id, algorithm, public_key_base64
         FROM device_signing_keys
         WHERE tenant_id = $1 AND (device_id = $2 OR key_id = $3)
         FOR UPDATE`,
        [tenantId, deviceKey.deviceId, deviceKey.keyId],
      );
      if (keyResult.rows.some((storedKey) =>
        String(storedKey.device_id) !== deviceKey.deviceId ||
        storedKey.actor_id !== deviceKey.actorId ||
        storedKey.key_id !== deviceKey.keyId ||
        storedKey.algorithm !== deviceKey.algorithm ||
        storedKey.public_key_base64 !== deviceKey.publicKeyBase64
      )) {
        throw new AppError("DEVICE_KEY_MISMATCH", "Device signing binding cannot be changed", 409);
      }
      if (!keyResult.rowCount) {
        await client.query(
          `INSERT INTO device_signing_keys
             (tenant_id, device_id, actor_id, key_id, algorithm, public_key_base64)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            tenantId,
            deviceKey.deviceId,
            deviceKey.actorId,
            deviceKey.keyId,
            deviceKey.algorithm,
            deviceKey.publicKeyBase64,
          ],
        );
      }
      for (const event of events) {
        if (
          event.tenantId !== tenantId ||
          event.deviceId !== deviceKey.deviceId ||
          event.actorId !== deviceKey.actorId ||
          event.keyId !== deviceKey.keyId
        ) {
          throw new AppError("INVALID_EVENT_CHAIN", "Signed event batch binding is invalid", 409);
        }
      }
      await client.query(
        `UPDATE organization_devices
            SET last_seen_at = now(), updated_at = now()
          WHERE tenant_id = $1 AND device_id = $2`,
        [tenantId, deviceKey.deviceId],
      );
      const last = await client.query(
        `SELECT sequence, event_hash FROM signed_events
         WHERE tenant_id = $1 AND device_id = $2
         ORDER BY sequence DESC LIMIT 1`,
        [tenantId, deviceKey.deviceId],
      );
      let sequence = last.rowCount ? Number(last.rows[0].sequence) : 0;
      let previousHash = last.rowCount ? String(last.rows[0].event_hash) : GENESIS_HASH;
      const existing = await client.query(
        `SELECT event_id, tenant_id, device_id, sequence, event
         FROM signed_events WHERE event_id = ANY($1::uuid[])`,
        [events.map((event) => event.eventId)],
      );
      if (existing.rowCount) {
        const byId = new Map(existing.rows.map((row) => [String(row.event_id), row]));
        const replayStart = sequence - events.length + 1;
        const exactTailReplay = existing.rowCount === events.length && events.every((event, index) => {
          const stored = byId.get(event.eventId);
          return (
            stored &&
            String(stored.tenant_id) === tenantId &&
            String(stored.device_id) === deviceKey.deviceId &&
            Number(stored.sequence) === replayStart + index &&
            canonicalJson(stored.event) === canonicalJson(event)
          );
        });
        if (!exactTailReplay || events.at(-1)?.sequence !== sequence) {
          throw new AppError("INVALID_EVENT_CHAIN", "Signed event replay is not an exact chain tail", 409);
        }
        await client.query("COMMIT");
        return;
      }
      for (const event of events) {
        if (event.sequence !== sequence + 1 || event.prevHash !== previousHash) {
          throw new AppError("INVALID_EVENT_CHAIN", "Signed event chain is not contiguous", 409);
        }
        const eventHash = signedEventHash(event);
        if (event.eventHash !== eventHash) {
          throw new AppError("INVALID_EVENT_CHAIN", "Signed event hash is invalid", 409);
        }
        await client.query(
          `INSERT INTO signed_events
             (event_id, tenant_id, device_id, actor_id, key_id, sequence, prev_hash,
              event_hash, event_type, aggregate_id, reported_utc, payload_hash, event)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
          [
            event.eventId, tenantId, event.deviceId, event.actorId, event.keyId,
            event.sequence, event.prevHash, eventHash, event.eventType,
            event.aggregateId, event.reportedUtc, event.payloadHash, JSON.stringify(event),
          ],
        );
        sequence = event.sequence;
        previousHash = event.eventHash;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) throw error;
      if ((error as { code?: string }).code === "23505") {
        throw new AppError("INVALID_EVENT_CHAIN", "Signed event already exists or chain raced", 409);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordChange(type: ResourceType, resource: Resource): Promise<void> {
    await this.pool.query(
      `INSERT INTO sync_changes (tenant_id, resource_type, resource_id, operation, payload)
       VALUES ($1, $2, $3, 'upsert', $4::jsonb)`,
      [resource.tenantId, type, resource.id, JSON.stringify(resource)],
    );
  }
}
