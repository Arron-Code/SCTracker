import { randomUUID } from "node:crypto";
import pg from "pg";
import { AppError } from "./errors.js";
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

  private bucket(type: ResourceType): Map<string, Resource> {
    const existing = this.resources.get(type);
    if (existing) return existing;
    const created = new Map<string, Resource>();
    this.resources.set(type, created);
    return created;
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

  async appendSignedEvents(
    tenantId: string,
    deviceKey: DeviceSigningKey & { deviceId: string; actorId: string },
    events: SignedEvent[],
  ): Promise<void> {
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

export class PgRepository implements Repository {
  constructor(private readonly pool: pg.Pool) {}

  static connect(connectionString: string): PgRepository {
    return new PgRepository(new Pool({ connectionString, max: 20 }));
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

  async appendSignedEvents(
    tenantId: string,
    deviceKey: DeviceSigningKey & { deviceId: string; actorId: string },
    events: SignedEvent[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
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
