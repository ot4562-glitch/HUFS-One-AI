-- A13 owner-private profile and granular preferences; isolated from demo SharingGrant.
-- Review only. Apply on an approved PRIVATE DB with a dedicated non-owner,
-- non-superuser role. No CSV, Forms or Google secrets are migrated.
BEGIN;
CREATE TABLE IF NOT EXISTS api_self_consents (
  actor_id text PRIMARY KEY CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  version bigint NOT NULL CHECK(version > 0),
  choices_json jsonb NOT NULL CHECK(jsonb_typeof(choices_json)='object'
    AND pg_column_size(choices_json)<4096),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS api_self_profiles (
  actor_id text PRIMARY KEY CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  version bigint NOT NULL CHECK(version > 0),
  profile_json jsonb NOT NULL CHECK(jsonb_typeof(profile_json)='object'
    AND pg_column_size(profile_json)<4096),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS api_self_consent_events (
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  version bigint NOT NULL CHECK(version > 0),
  changed_purposes text[] NOT NULL CHECK(cardinality(changed_purposes) BETWEEN 1 AND 5),
  logged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,version),
  FOREIGN KEY(actor_id) REFERENCES api_self_consents(actor_id)
);
CREATE OR REPLACE FUNCTION api_self_no_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  RAISE EXCEPTION 'owner consent audit cannot be mutated';
END;
$body$;
REVOKE ALL ON FUNCTION api_self_no_audit_mutation() FROM PUBLIC;
CREATE TRIGGER api_self_consent_immutable
 BEFORE UPDATE OR DELETE ON api_self_consent_events
 FOR EACH ROW EXECUTE FUNCTION api_self_no_audit_mutation();

ALTER TABLE api_self_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_self_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE api_self_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_self_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE api_self_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_self_consent_events FORCE ROW LEVEL SECURITY;
CREATE POLICY api_self_consent_exact_actor ON api_self_consents FOR ALL
 USING(actor_id=current_setting('hufs.self_actor',true))
 WITH CHECK(actor_id=current_setting('hufs.self_actor',true));
CREATE POLICY api_self_profile_exact_actor ON api_self_profiles FOR ALL
 USING(actor_id=current_setting('hufs.self_actor',true))
 WITH CHECK(actor_id=current_setting('hufs.self_actor',true));
CREATE POLICY api_self_event_exact_actor ON api_self_consent_events FOR INSERT
 WITH CHECK(actor_id=current_setting('hufs.self_actor',true));
REVOKE ALL ON TABLE api_self_consents,api_self_profiles,api_self_consent_events FROM PUBLIC;
-- Dedicated trusted API role: SELECT,INSERT,UPDATE on consents/profiles,
-- DELETE only on profiles for personalStorage withdrawal; INSERT events only.
-- The server must verify BETA/owner identity and separate store/provider rights.
COMMIT;
