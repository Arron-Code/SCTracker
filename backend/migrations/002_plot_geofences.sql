ALTER TABLE coffee_plots
  ADD COLUMN IF NOT EXISTS geofence_center geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS geofence_radius_meters double precision;

CREATE INDEX IF NOT EXISTS coffee_plots_geofence_center_gix
  ON coffee_plots USING gist (geofence_center);

CREATE OR REPLACE FUNCTION normalize_plot_geofence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payload ? 'geofence'
     AND (NEW.payload->'geofence'->>'enabled')::boolean IS TRUE THEN
    NEW.geofence_center := ST_SetSRID(
      ST_MakePoint(
        (NEW.payload->'geofence'->'center'->>0)::double precision,
        (NEW.payload->'geofence'->'center'->>1)::double precision
      ),
      4326
    )::geography;
    NEW.geofence_radius_meters :=
      (NEW.payload->'geofence'->>'radiusMeters')::double precision;
  ELSE
    NEW.geofence_center := NULL;
    NEW.geofence_radius_meters := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coffee_plots_normalize_geofence ON coffee_plots;
CREATE TRIGGER coffee_plots_normalize_geofence
BEFORE INSERT OR UPDATE OF payload ON coffee_plots
FOR EACH ROW EXECUTE FUNCTION normalize_plot_geofence();

UPDATE coffee_plots SET payload = payload WHERE payload ? 'geofence';
