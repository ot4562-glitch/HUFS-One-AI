-- Independent synthetic-only EMPTY_DEMO settings; never replaces real self profiles/intake.
-- Apply only to an approved database. Grant SELECT,INSERT,UPDATE to the dedicated
-- trusted API role (non-owner, non-superuser, NOBYPASSRLS); never grant DELETE/TRUNCATE.
BEGIN;
CREATE TABLE IF NOT EXISTS api_demo_profiles (
  actor_id text PRIMARY KEY CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  synthetic_namespace text NOT NULL DEFAULT 'EMPTY_DEMO' CHECK(synthetic_namespace='EMPTY_DEMO'),
  data_mode text NOT NULL DEFAULT 'SYNTHETIC' CHECK(data_mode='SYNTHETIC'),
  version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740990),
  value_json jsonb NOT NULL CHECK(jsonb_typeof(value_json)='object' AND pg_column_size(value_json)<4096),
  last_operation text NOT NULL CHECK(last_operation ~ '^[a-f0-9]{64}$'),
  last_expected_version bigint NOT NULL CHECK(last_expected_version=version-1),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE api_demo_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_demo_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY api_demo_profile_exact_actor ON api_demo_profiles FOR ALL
 USING(actor_id=current_setting('hufs.demo_profile_actor',true))
 WITH CHECK(actor_id=current_setting('hufs.demo_profile_actor',true));
REVOKE ALL ON TABLE api_demo_profiles FROM PUBLIC;
COMMIT;
