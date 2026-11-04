-- #132: extend the existing EMPTY_DEMO row, exact actor RLS and single CAS version.
-- Apply after 20261103_demo_profile.sql. No personal or reviewer tables are touched.
BEGIN;
ALTER TABLE api_demo_profiles ADD COLUMN workspace_json jsonb NOT NULL DEFAULT
  '{"bookmarks":[],"experiences":[],"planCourseIds":[],"search":"","notifications":false,"experienceOverlay":"OFF"}'::jsonb
  CHECK(jsonb_typeof(workspace_json)='object' AND octet_length(workspace_json::text)<=65536);
CREATE FUNCTION api_demo_profile_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.actor_id IS DISTINCT FROM OLD.actor_id
      OR NEW.synthetic_namespace IS DISTINCT FROM OLD.synthetic_namespace
      OR NEW.data_mode IS DISTINCT FROM OLD.data_mode THEN
      RAISE EXCEPTION 'synthetic profile identity is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at THEN
      RAISE EXCEPTION 'synthetic profile version must advance exactly once' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION api_demo_profile_guard() FROM PUBLIC;
CREATE TRIGGER api_demo_profile_monotonic BEFORE UPDATE ON api_demo_profiles
  FOR EACH ROW EXECUTE FUNCTION api_demo_profile_guard();
COMMENT ON COLUMN api_demo_profiles.workspace_json IS
  'SYNTHETIC EMPTY_DEMO only; same version and RESET as settings; never official owner academic facts.';
COMMIT;
