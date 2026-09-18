CREATE TABLE IF NOT EXISTS organization_users (
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  subject_id text,
  display_name text,
  email text,
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_authenticated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, actor_id),
  CHECK (jsonb_typeof(roles) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_users_tenant_subject_idx
  ON organization_users (tenant_id, subject_id)
  WHERE subject_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS organization_devices (
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  display_name text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  app_version text NOT NULL,
  os_version text NOT NULL,
  key_protection text NOT NULL CHECK (
    key_protection IN ('software', 'tee', 'strongbox', 'secure_enclave', 'unknown')
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  status_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  last_attested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, device_id),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS organization_devices_tenant_actor_idx
  ON organization_devices (tenant_id, actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_signing_keys (
  tenant_id uuid NOT NULL,
  key_id text NOT NULL,
  device_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  algorithm text NOT NULL CHECK (algorithm = 'P256-SHA256'),
  public_key_base64 text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  status_reason text,
  revoked_at timestamptz,
  revoked_by_actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key_id),
  UNIQUE (tenant_id, device_id),
  FOREIGN KEY (tenant_id, device_id)
    REFERENCES organization_devices (tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS organization_signing_keys_tenant_device_idx
  ON organization_signing_keys (tenant_id, device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS device_attestation_challenges (
  challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  key_id text,
  provider text NOT NULL CHECK (provider IN ('play_integrity', 'app_attest')),
  challenge text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, device_id)
    REFERENCES organization_devices (tenant_id, device_id),
  FOREIGN KEY (tenant_id, key_id)
    REFERENCES organization_signing_keys (tenant_id, key_id),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS device_attestation_challenges_tenant_device_idx
  ON device_attestation_challenges (tenant_id, device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS device_attestations (
  attestation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  key_id text,
  challenge_id uuid,
  provider text NOT NULL CHECK (provider IN ('play_integrity', 'app_attest')),
  status text NOT NULL CHECK (status IN ('VERIFIED', 'UNVERIFIED', 'NOT_CONFIGURED')),
  verified boolean NOT NULL,
  reason text NOT NULL,
  provider_reference text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, device_id)
    REFERENCES organization_devices (tenant_id, device_id),
  FOREIGN KEY (tenant_id, key_id)
    REFERENCES organization_signing_keys (tenant_id, key_id),
  FOREIGN KEY (challenge_id)
    REFERENCES device_attestation_challenges (challenge_id),
  CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE INDEX IF NOT EXISTS device_attestations_tenant_device_idx
  ON device_attestations (tenant_id, device_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS device_attestations_challenge_idx
  ON device_attestations (challenge_id)
  WHERE challenge_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS organization_trust_state (
  tenant_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('organization', 'user', 'device', 'key')),
  scope_id text NOT NULL,
  state text NOT NULL CHECK (
    state IN (
      'UNVERIFIED',
      'NOT_CONFIGURED',
      'LOCALLY_TRUSTED',
      'ORGANIZATION_VERIFIED',
      'SUSPENDED',
      'REVOKED'
    )
  ),
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope_type, scope_id),
  CHECK (jsonb_typeof(details) = 'object')
);

CREATE TABLE IF NOT EXISTS organization_trust_history (
  entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('organization', 'user', 'device', 'key')),
  scope_id text NOT NULL,
  state text NOT NULL CHECK (
    state IN (
      'UNVERIFIED',
      'NOT_CONFIGURED',
      'LOCALLY_TRUSTED',
      'ORGANIZATION_VERIFIED',
      'SUSPENDED',
      'REVOKED'
    )
  ),
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS organization_trust_history_tenant_scope_idx
  ON organization_trust_history (tenant_id, scope_type, scope_id, created_at DESC);

INSERT INTO organization_users (tenant_id, actor_id, roles, last_authenticated_at)
SELECT DISTINCT tenant_id, actor_id, '[]'::jsonb, created_at
FROM device_signing_keys
ON CONFLICT (tenant_id, actor_id) DO NOTHING;

INSERT INTO organization_devices
  (tenant_id, device_id, actor_id, display_name, platform, app_version, os_version,
   key_protection, status, metadata, last_seen_at, created_at, updated_at)
SELECT tenant_id, device_id, actor_id, 'Migrated SCTracker device', 'android', '0.2.0',
       'unknown', 'software', 'active', '{"migratedFrom":"device_signing_keys"}'::jsonb,
       created_at, created_at, created_at
FROM device_signing_keys
ON CONFLICT (tenant_id, device_id) DO NOTHING;

INSERT INTO organization_signing_keys
  (tenant_id, key_id, device_id, actor_id, algorithm, public_key_base64, status,
   created_at, updated_at)
SELECT tenant_id, key_id, device_id, actor_id, algorithm, public_key_base64, 'active',
       created_at, created_at
FROM device_signing_keys
ON CONFLICT (tenant_id, key_id) DO NOTHING;

DROP TRIGGER IF EXISTS device_attestations_append_only ON device_attestations;
CREATE TRIGGER device_attestations_append_only
BEFORE UPDATE OR DELETE ON device_attestations
FOR EACH ROW EXECUTE FUNCTION prevent_signed_event_mutation();

DROP TRIGGER IF EXISTS organization_trust_history_append_only ON organization_trust_history;
CREATE TRIGGER organization_trust_history_append_only
BEFORE UPDATE OR DELETE ON organization_trust_history
FOR EACH ROW EXECUTE FUNCTION prevent_signed_event_mutation();

COMMENT ON TABLE organization_users IS 'Centrally managed organization-scoped user directory';
COMMENT ON TABLE organization_devices IS 'Authenticated device registry scoped to a tenant';
COMMENT ON TABLE organization_signing_keys IS 'Tenant-scoped device signing keys and revocation state';
COMMENT ON TABLE device_attestations IS 'Append-only device attestation verification records';
COMMENT ON TABLE organization_trust_history IS 'Append-only tenant-scoped trust history';
