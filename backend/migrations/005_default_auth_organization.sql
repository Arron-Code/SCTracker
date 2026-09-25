INSERT INTO neon_auth.organization (name, slug, "createdAt", metadata)
VALUES (
  'SCTracker Standard',
  'sctracker-standard',
  CURRENT_TIMESTAMP,
  '{"managedBy":"sctracker","purpose":"fallback"}'
)
ON CONFLICT (slug) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS member_user_organization_uidx
  ON neon_auth.member ("userId", "organizationId");

INSERT INTO neon_auth.member ("organizationId", "userId", role, "createdAt")
SELECT fallback.id, auth_user.id, 'member', CURRENT_TIMESTAMP
FROM neon_auth."user" AS auth_user
CROSS JOIN neon_auth.organization AS fallback
WHERE fallback.slug = 'sctracker-standard'
  AND NOT EXISTS (
    SELECT 1
    FROM neon_auth.member AS existing
    WHERE existing."userId" = auth_user.id
  )
ON CONFLICT ("userId", "organizationId") DO NOTHING;

CREATE OR REPLACE FUNCTION neon_auth.assign_default_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = neon_auth, pg_temp
AS '
DECLARE
  fallback_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM neon_auth.member
    WHERE "userId" = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id
  INTO fallback_id
  FROM neon_auth.organization
  WHERE slug = ''sctracker-standard'';

  INSERT INTO neon_auth.member ("organizationId", "userId", role, "createdAt")
  VALUES (fallback_id, NEW.id, ''member'', CURRENT_TIMESTAMP)
  ON CONFLICT ("userId", "organizationId") DO NOTHING;

  RETURN NEW;
END;
';

DROP TRIGGER IF EXISTS user_assign_default_organization ON neon_auth."user";
CREATE TRIGGER user_assign_default_organization
AFTER INSERT ON neon_auth."user"
FOR EACH ROW
EXECUTE FUNCTION neon_auth.assign_default_organization();

CREATE OR REPLACE FUNCTION neon_auth.activate_session_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = neon_auth, pg_temp
AS '
DECLARE
  organization_id uuid;
BEGIN
  IF NEW."activeOrganizationId" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT member."organizationId"
  INTO organization_id
  FROM neon_auth.member
  WHERE member."userId" = NEW."userId"
  ORDER BY member."createdAt", member.id
  LIMIT 1;

  IF organization_id IS NULL THEN
    SELECT id
    INTO organization_id
    FROM neon_auth.organization
    WHERE slug = ''sctracker-standard'';

    INSERT INTO neon_auth.member ("organizationId", "userId", role, "createdAt")
    VALUES (organization_id, NEW."userId", ''member'', CURRENT_TIMESTAMP)
    ON CONFLICT ("userId", "organizationId") DO NOTHING;
  END IF;

  NEW."activeOrganizationId" = organization_id::text;
  RETURN NEW;
END;
';

DROP TRIGGER IF EXISTS session_activate_organization ON neon_auth.session;
CREATE TRIGGER session_activate_organization
BEFORE INSERT ON neon_auth.session
FOR EACH ROW
EXECUTE FUNCTION neon_auth.activate_session_organization();

UPDATE neon_auth.session AS auth_session
SET
  "activeOrganizationId" = (
    SELECT member."organizationId"::text
    FROM neon_auth.member
    WHERE member."userId" = auth_session."userId"
    ORDER BY member."createdAt", member.id
    LIMIT 1
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE auth_session."activeOrganizationId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM neon_auth.member
    WHERE member."userId" = auth_session."userId"
  );
