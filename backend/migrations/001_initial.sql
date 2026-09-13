CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  external_subject text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_subject)
);

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_id uuid REFERENCES actors(id),
  public_key text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suppliers_tenant_created_idx ON suppliers (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_invitations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_invitations_tenant_created_idx
  ON supplier_invitations (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS coffee_plots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coffee_plots_geometry_type CHECK (
    geom IS NULL OR GeometryType(geom) IN ('POINT', 'POLYGON', 'MULTIPOLYGON')
  ),
  CONSTRAINT coffee_plots_geometry_valid CHECK (geom IS NULL OR ST_IsValid(geom))
);
CREATE INDEX IF NOT EXISTS coffee_plots_tenant_created_idx ON coffee_plots (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coffee_plots_geom_gix ON coffee_plots USING gist (geom);

CREATE OR REPLACE FUNCTION normalize_plot_geometry()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payload ? 'geometry' THEN
    NEW.geom := ST_Force2D(
      ST_Multi(
        ST_CollectionExtract(
          ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(NEW.payload->>'geometry'), 4326)),
          CASE WHEN (NEW.payload->'geometry'->>'type') = 'Point' THEN 1 ELSE 3 END
        )
      )
    );
    IF (NEW.payload->'geometry'->>'type') = 'Point' THEN
      NEW.geom := ST_SetSRID(ST_GeomFromGeoJSON(NEW.payload->>'geometry'), 4326);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER coffee_plots_normalize_geometry
BEFORE INSERT OR UPDATE OF payload ON coffee_plots
FOR EACH ROW EXECUTE FUNCTION normalize_plot_geometry();

CREATE TABLE IF NOT EXISTS lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plot_id uuid REFERENCES coffee_plots(id),
  reference text NOT NULL,
  produced_quantity_kg numeric(18,6) NOT NULL CHECK (produced_quantity_kg > 0),
  harvested_at date,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference)
);

CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  reference text NOT NULL,
  input_quantity_kg numeric(18,6) NOT NULL CHECK (input_quantity_kg > 0),
  output_quantity_kg numeric(18,6) NOT NULL CHECK (output_quantity_kg > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference),
  CHECK (output_quantity_kg <= input_quantity_kg)
);

CREATE TABLE IF NOT EXISTS batch_inputs (
  tenant_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES batches(id),
  source_lot_id uuid REFERENCES lots(id),
  source_batch_id uuid REFERENCES batches(id),
  quantity_kg numeric(18,6) NOT NULL CHECK (quantity_kg > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_lot_id IS NULL) <> (source_batch_id IS NULL))
);
CREATE INDEX IF NOT EXISTS batch_inputs_batch_idx ON batch_inputs (tenant_id, batch_id);

CREATE TABLE IF NOT EXISTS shipments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipments_tenant_created_idx ON shipments (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shipment_lineage (
  tenant_id uuid NOT NULL,
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  source_lot_id uuid REFERENCES lots(id),
  source_batch_id uuid REFERENCES batches(id),
  quantity_kg numeric(18,6) NOT NULL CHECK (quantity_kg > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_lot_id IS NULL) <> (source_batch_id IS NULL))
);
CREATE INDEX IF NOT EXISTS shipment_lineage_source_lot_idx ON shipment_lineage (tenant_id, source_lot_id);
CREATE INDEX IF NOT EXISTS shipment_lineage_source_batch_idx ON shipment_lineage (tenant_id, source_batch_id);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_tenant_created_idx ON documents (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_completed_document_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'complete' AND NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'completed evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER documents_immutable_after_completion
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION prevent_completed_document_mutation();

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analysis_jobs_queue_idx ON analysis_jobs (status, created_at)
  WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS evidence_packs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_packs_queue_idx ON evidence_packs (status, created_at)
  WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS dds_submissions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dds_submissions_queue_idx ON dds_submissions (status, created_at)
  WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS audit_log (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_tenant_sequence_idx ON audit_log (tenant_id, sequence);

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit records are append-only';
END;
$$;
CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TABLE IF NOT EXISTS idempotency_keys (
  tenant_id uuid NOT NULL,
  key text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS sync_changes (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('upsert')),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_changes_tenant_cursor_idx ON sync_changes (tenant_id, sequence);

COMMENT ON COLUMN suppliers.tenant_id IS 'RLS-ready tenant discriminator';
COMMENT ON COLUMN coffee_plots.tenant_id IS 'RLS-ready tenant discriminator';
COMMENT ON COLUMN shipments.tenant_id IS 'RLS-ready tenant discriminator';
COMMENT ON COLUMN documents.tenant_id IS 'RLS-ready tenant discriminator';
COMMENT ON COLUMN analysis_jobs.tenant_id IS 'RLS-ready tenant discriminator';
COMMENT ON COLUMN evidence_packs.tenant_id IS 'RLS-ready tenant discriminator';
COMMENT ON COLUMN dds_submissions.tenant_id IS 'RLS-ready tenant discriminator';
