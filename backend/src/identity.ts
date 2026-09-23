export const ADMIN_ROLE = "organization_admin" as const;

export const trustStates = [
  "UNVERIFIED",
  "NOT_CONFIGURED",
  "LOCALLY_TRUSTED",
  "ORGANIZATION_VERIFIED",
  "SUSPENDED",
  "REVOKED",
] as const;

export const deviceStatuses = ["pending", "active", "suspended", "revoked"] as const;
export const keyStatuses = ["active", "revoked"] as const;
export const userStatuses = ["active", "suspended"] as const;
export const attestationChallengeStatuses = ["pending", "completed", "expired"] as const;
export const attestationProviders = ["play_integrity", "app_attest"] as const;
export const attestationStatuses = ["VERIFIED", "UNVERIFIED", "NOT_CONFIGURED"] as const;
export const trustScopeTypes = ["organization", "user", "device", "key"] as const;
export const keyProtectionLevels = [
  "software",
  "tee",
  "strongbox",
  "secure_enclave",
  "unknown",
] as const;
export const devicePlatforms = ["android", "ios"] as const;

export type TrustState = (typeof trustStates)[number];
export type DeviceStatus = (typeof deviceStatuses)[number];
export type KeyStatus = (typeof keyStatuses)[number];
export type UserStatus = (typeof userStatuses)[number];
export type AttestationChallengeStatus = (typeof attestationChallengeStatuses)[number];
export type AttestationProviderName = (typeof attestationProviders)[number];
export type AttestationStatus = (typeof attestationStatuses)[number];
export type TrustScopeType = (typeof trustScopeTypes)[number];
export type KeyProtectionLevel = (typeof keyProtectionLevels)[number];
export type DevicePlatform = (typeof devicePlatforms)[number];

export const blockingTrustStates: ReadonlySet<TrustState> = new Set<TrustState>([
  "SUSPENDED",
  "REVOKED",
]);

export interface OrganizationUser {
  tenantId: string;
  actorId: string;
  subjectId: string | null;
  displayName: string | null;
  email: string | null;
  roles: string[];
  status: UserStatus;
  lastAuthenticatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisteredDevice {
  tenantId: string;
  deviceId: string;
  actorId: string;
  displayName: string;
  platform: DevicePlatform;
  appVersion: string;
  osVersion: string;
  keyProtection: KeyProtectionLevel;
  status: DeviceStatus;
  statusReason: string | null;
  metadata: Record<string, unknown>;
  lastSeenAt: string | null;
  lastAttestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisteredKey {
  tenantId: string;
  keyId: string;
  deviceId: string;
  actorId: string;
  algorithm: string;
  publicKeyBase64: string;
  status: KeyStatus;
  statusReason: string | null;
  revokedAt: string | null;
  revokedByActorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttestationChallenge {
  challengeId: string;
  tenantId: string;
  deviceId: string;
  actorId: string;
  keyId: string | null;
  provider: AttestationProviderName;
  challenge: string;
  status: AttestationChallengeStatus;
  metadata: Record<string, unknown>;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttestationRecord {
  attestationId: string;
  tenantId: string;
  deviceId: string;
  actorId: string;
  keyId: string | null;
  challengeId: string | null;
  provider: AttestationProviderName;
  status: AttestationStatus;
  verified: boolean;
  reason: string;
  providerReference: string | null;
  evidence: Record<string, unknown>;
  payloadDigest: string;
  createdAt: string;
}

export interface TrustStateRecord {
  tenantId: string;
  scopeType: TrustScopeType;
  scopeId: string;
  state: TrustState;
  reason: string;
  details: Record<string, unknown>;
  updatedByActorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrustHistoryEntry {
  entryId: string;
  tenantId: string;
  scopeType: TrustScopeType;
  scopeId: string;
  state: TrustState;
  reason: string;
  details: Record<string, unknown>;
  actorId: string;
  createdAt: string;
}

export interface OrganizationIdentitySnapshot {
  user: OrganizationUser | null;
  devices: RegisteredDevice[];
  keys: RegisteredKey[];
}

function collectStringRoles(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized) output.add(normalized);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringRoles(item, output);
  }
}

export function normalizeRoles(value: unknown): string[] {
  const output = new Set<string>();
  collectStringRoles(value, output);
  return [...output].sort();
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function organizationIdFromClaims(payload: Record<string, unknown>): string | null {
  if (typeof payload.activeOrganizationId === "string" && payload.activeOrganizationId) {
    return payload.activeOrganizationId;
  }
  const organization = objectRecord(payload.o);
  return typeof organization?.id === "string" && organization.id
    ? organization.id
    : null;
}

export function rolesFromClaims(payload: Record<string, unknown>, activeOrganizationId: string): string[] {
  const roles = new Set<string>();
  collectStringRoles(payload.role, roles);
  collectStringRoles(payload.roles, roles);
  collectStringRoles(payload.organizationRole, roles);
  collectStringRoles(payload.organizationRoles, roles);

  const appMetadata = objectRecord(payload.app_metadata);
  if (appMetadata) {
    collectStringRoles(appMetadata.role, roles);
    collectStringRoles(appMetadata.roles, roles);
  }

  const userMetadata = objectRecord(payload.user_metadata);
  if (userMetadata) {
    collectStringRoles(userMetadata.role, roles);
    collectStringRoles(userMetadata.roles, roles);
  }

  const organization = objectRecord(payload.o);
  if (organization?.id === activeOrganizationId) {
    collectStringRoles(organization.role, roles);
    collectStringRoles(organization.roles, roles);
  }

  for (const key of ["orgRoles", "organizationRoleMap", "organizationRolesMap"] as const) {
    const mapping = objectRecord(payload[key]);
    if (!mapping) continue;
    collectStringRoles(mapping[activeOrganizationId], roles);
  }

  return [...roles].sort();
}

export function isOrganizationAdmin(roles: readonly string[]): boolean {
  return roles.includes(ADMIN_ROLE) || roles.includes("admin");
}
