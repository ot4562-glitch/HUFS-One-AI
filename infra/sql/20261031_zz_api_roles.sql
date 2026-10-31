-- HUFS One AI / DB operator-only explicit role grants. NOT AUTO-MIGRATED.
-- Apply AFTER 20261031_api_projections.sql and
-- 20261031_z_api_personal_state.sql, only after human DB ownership approval.
-- Production login/secret/SSL provisioning is the infrastructure owner's job.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hufs_api_data_owner') THEN
    CREATE ROLE hufs_api_data_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hufs_api_projection_reader') THEN
    CREATE ROLE hufs_api_projection_reader NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hufs_api_personal_writer') THEN
    CREATE ROLE hufs_api_personal_writer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hufs_api_grant_admin') THEN
    CREATE ROLE hufs_api_grant_admin NOLOGIN;
  END IF;
END;
$$;
-- The data owner must never be used as an API LOGIN role.
ALTER TABLE api_demo_profile_projections OWNER TO hufs_api_data_owner;
ALTER TABLE api_demo_snapshot_projections OWNER TO hufs_api_data_owner;
ALTER TABLE api_sharing_grants OWNER TO hufs_api_data_owner;
ALTER TABLE api_grant_events OWNER TO hufs_api_data_owner;
ALTER TABLE api_approved_safe_packets OWNER TO hufs_api_data_owner;
ALTER TABLE api_personal_records OWNER TO hufs_api_data_owner;
ALTER TABLE api_personal_events OWNER TO hufs_api_data_owner;
ALTER FUNCTION api_deny_grant_audit_mutation() OWNER TO hufs_api_data_owner;
ALTER FUNCTION api_deny_personal_audit_mutation() OWNER TO hufs_api_data_owner;
ALTER FUNCTION api_lock_authorized_personal_grant(text,char(3),text,text[])
  OWNER TO hufs_api_data_owner;
GRANT USAGE ON SCHEMA public TO
  hufs_api_projection_reader,hufs_api_personal_writer,hufs_api_grant_admin;
GRANT SELECT ON
  api_demo_profile_projections,api_demo_snapshot_projections,
  api_sharing_grants,api_approved_safe_packets
  TO hufs_api_projection_reader;
GRANT EXECUTE ON FUNCTION
  api_lock_authorized_personal_grant(text,char(3),text,text[])
  TO hufs_api_personal_writer,hufs_api_projection_reader;
GRANT SELECT,INSERT,UPDATE ON api_personal_records TO hufs_api_personal_writer;
GRANT INSERT ON api_personal_events TO hufs_api_personal_writer;
GRANT SELECT,INSERT,UPDATE ON api_sharing_grants TO hufs_api_grant_admin;
GRANT INSERT ON api_grant_events TO hufs_api_grant_admin;
-- No GRANT DELETE on personal records, no GRANT UPDATE/DELETE on audit tables,
-- no privilege on source/revision/raw intake tables or unrelated auth schema.
-- Only infra operators may GRANT these NOLOGIN roles to separate LOGIN users;
-- use distinct connection pools for reads, personal writes, and grant admin.
COMMIT;
