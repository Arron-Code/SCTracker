import { randomUUID } from "node:crypto";
import pg from "pg";
import { AppError } from "./errors.js";

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
    const existing = await this.get(type, tenantId, id);
    if (!existing) throw new AppError("NOT_FOUND", `${type} resource not found`, 404);
    if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
      throw new AppError("SYNC_CONFLICT", "Resource changed since it was last synchronized", 409, {
        current: existing,
      });
    }
    const payload = Object.fromEntries(
      Object.entries({ ...existing, ...patch }).filter(
        ([key]) => !["id", "tenantId", "createdAt", "updatedAt"].includes(key),
      ),
    );
    const status = typeof payload.status === "string" ? payload.status : null;
    const result = await this.pool.query(
      `UPDATE ${tableByType[type]} SET payload = $3::jsonb, status = $4, updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, tenant_id, status, payload, created_at, updated_at`,
      [tenantId, id, JSON.stringify(payload), status],
    );
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

  private async recordChange(type: ResourceType, resource: Resource): Promise<void> {
    await this.pool.query(
      `INSERT INTO sync_changes (tenant_id, resource_type, resource_id, operation, payload)
       VALUES ($1, $2, $3, 'upsert', $4::jsonb)`,
      [resource.tenantId, type, resource.id, JSON.stringify(resource)],
    );
  }
}
