import type {
  OperationalRequest,
  OutboxOperation,
  PullResponse,
  PushResponse,
} from "./domain";

type SuccessEnvelope<T> = { data: T; meta?: Record<string, unknown> };
type ErrorEnvelope = {
  error: { code: string; message: string; details?: unknown };
};

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type AccessTokenProvider = () => Promise<string | null>;
export type DeviceIdProvider = () => string | null;
let accessTokenProvider: AccessTokenProvider | null = null;
let deviceIdProvider: DeviceIdProvider | null = null;

export function configureApiAuth(provider: AccessTokenProvider | null) {
  accessTokenProvider = provider;
}

export function configureApiDevice(provider: DeviceIdProvider | null) {
  deviceIdProvider = provider;
}

export function getApiBaseUrl(): string | null {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiError("NOT_CONFIGURED", "EXPO_PUBLIC_API_URL is not configured.", 0);
  }
  if (!accessTokenProvider) {
    throw new ApiError(
      "AUTH_NOT_CONFIGURED",
      "Neon Auth token provider is not configured.",
      0,
    );
  }
  const token = await accessTokenProvider();
  if (!token) {
    throw new ApiError("AUTH_REQUIRED", "Sign in and select an organization.", 401);
  }
  const deviceId = deviceIdProvider?.() ?? null;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      ...(deviceId ? { "X-Device-Id": deviceId } : {}),
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !body ||
    typeof body !== "object" ||
    !("data" in body)
  ) {
    const errorBody = body as ErrorEnvelope | null;
    throw new ApiError(
      errorBody?.error?.code ?? "HTTP_ERROR",
      errorBody?.error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      errorBody?.error?.details,
    );
  }
  return (body as SuccessEnvelope<T>).data;
}

export function pushOperations(
  deviceId: string,
  operations: OutboxOperation[],
  deviceKey?: { keyId: string; algorithm: "P256-SHA256"; publicKeyBase64: string },
) {
  return request<PushResponse>("/api/v1/sync/push", {
    method: "POST",
    headers: { "Idempotency-Key": operations.map((item) => item.idempotencyKey).join(",") },
    body: JSON.stringify({ deviceId, ...(deviceKey ? { deviceKey } : {}), operations }),
  });
}

export function pullChanges(cursor: string | null) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<PullResponse>(`/api/v1/sync/pull${query}`);
}

export type TrustState =
  | "UNVERIFIED"
  | "NOT_CONFIGURED"
  | "LOCALLY_TRUSTED"
  | "ORGANIZATION_VERIFIED"
  | "SUSPENDED"
  | "REVOKED";

export type AttestationProvider = "play_integrity" | "app_attest";

export type DeviceRegistration = {
  deviceId: string;
  displayName: string;
  platform: "android" | "ios";
  appVersion: string;
  osVersion: string;
  keyProtection: "software" | "tee" | "strongbox" | "secure_enclave" | "unknown";
  metadata: Record<string, unknown>;
  deviceKey: { keyId: string; algorithm: "P256-SHA256"; publicKeyBase64: string };
};

export function registerDevice(input: DeviceRegistration) {
  return request<{
    device: { deviceId: string; status: "pending" | "active" | "suspended" | "revoked" };
    key?: { keyId: string; status: "active" | "revoked" };
  }>("/api/v1/devices/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createAttestationChallenge(input: {
  deviceId: string;
  provider: AttestationProvider;
  keyId?: string;
  metadata?: Record<string, unknown>;
}) {
  return request<{
    challengeId: string;
    challenge: string;
    expiresAt: string;
    verificationConfigured: boolean;
  }>("/api/v1/devices/attestation/challenges", {
    method: "POST",
    body: JSON.stringify({ ...input, metadata: input.metadata ?? {} }),
  });
}

export function submitDeviceAttestation(input: {
  deviceId: string;
  provider: AttestationProvider;
  keyId?: string;
  challengeId: string;
  proof: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return request<{
    attestationId: string;
    status: "VERIFIED" | "UNVERIFIED" | "NOT_CONFIGURED";
    verified: boolean;
    reason: string;
  }>("/api/v1/devices/attestations", {
    method: "POST",
    body: JSON.stringify({ ...input, metadata: input.metadata ?? {} }),
  });
}

export async function uploadDocument(asset: {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  idempotencyKey: string;
}) {
  const initiation = await request<{
    documentId: string;
    uploadUrl: string;
    headers?: Record<string, string>;
  }>("/api/v1/documents/uploads", {
    method: "POST",
    headers: { "Idempotency-Key": asset.idempotencyKey },
    body: JSON.stringify({
      fileName: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
      sha256: asset.sha256,
    }),
  });
  const blob = await fetch(asset.uri).then((response) => response.blob());
  const upload = await fetch(initiation.uploadUrl, {
    method: "PUT",
    headers: initiation.headers,
    body: blob,
  });
  if (!upload.ok) {
    throw new ApiError("UPLOAD_FAILED", `Upload failed with status ${upload.status}.`, upload.status);
  }
  return request<{ id: string; status: string }>(
    `/api/v1/documents/uploads/${encodeURIComponent(initiation.documentId)}/complete`,
    {
      method: "POST",
      headers: { "Idempotency-Key": asset.idempotencyKey },
      body: JSON.stringify({}),
    },
  );
}

export function requestOperation(
  kind: OperationalRequest["kind"],
  subjectId: string,
  idempotencyKey: string,
) {
  const paths = {
    satellite: "/api/v1/satellite/analyses",
    evidence_pack: "/api/v1/evidence-packs",
    dds: "/api/v1/dds/drafts",
  };
  return request<OperationalRequest>(paths[kind], {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ subjectId }),
  });
}

export function validateDds(id: string, idempotencyKey: string) {
  return request<OperationalRequest>(`/api/v1/dds/drafts/${encodeURIComponent(id)}/validate`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({}),
  });
}

export function submitDds(id: string, idempotencyKey: string) {
  return request<OperationalRequest>(`/api/v1/dds/drafts/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({}),
  });
}

export function getOperation(kind: OperationalRequest["kind"], id: string) {
  const roots = {
    satellite: "/api/v1/satellite/analyses",
    evidence_pack: "/api/v1/evidence-packs",
    dds: "/api/v1/dds/drafts",
  };
  return request<OperationalRequest>(`${roots[kind]}/${encodeURIComponent(id)}`);
}
