CREATE TABLE IF NOT EXISTS device_signing_keys (
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  key_id text NOT NULL,
  algorithm text NOT NULL CHECK (algorithm = 'P256-SHA256'),
  public_key_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key_id),
  UNIQUE (tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS device_signing_keys_tenant_device_idx
  ON device_signing_keys (tenant_id, device_id);

CREATE TABLE IF NOT EXISTS signed_events (
  event_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  key_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  prev_hash text NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  reported_utc timestamptz NOT NULL,
  payload_hash text NOT NULL,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, device_id, sequence),
  FOREIGN KEY (tenant_id, key_id)
    REFERENCES device_signing_keys (tenant_id, key_id),
  FOREIGN KEY (tenant_id, device_id)
    REFERENCES device_signing_keys (tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS signed_events_tenant_device_chain_idx
  ON signed_events (tenant_id, device_id, sequence DESC);

CREATE OR REPLACE FUNCTION prevent_signed_event_mutation()
RETURNS trigger LANGUAGE plpgsql
AS 'BEGIN RAISE EXCEPTION ''signed events are append-only''; END;';

DROP TRIGGER IF EXISTS signed_events_append_only ON signed_events;
CREATE TRIGGER signed_events_append_only
BEFORE UPDATE OR DELETE ON signed_events
FOR EACH ROW EXECUTE FUNCTION prevent_signed_event_mutation();

COMMENT ON COLUMN device_signing_keys.tenant_id IS 'Tenant discriminator for device signing keys';
COMMENT ON COLUMN signed_events.tenant_id IS 'Tenant discriminator for signed event chains';
