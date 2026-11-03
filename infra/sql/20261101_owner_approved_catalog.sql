-- Read-only owner catalog/academic inputs. Apply only to an approved private DB
-- after source_review, verified_source_rights, self_account and self_workspace.
-- No intake promotion, imports, seeds, roles, HTTP approval or runtime activation.
BEGIN;
CREATE TABLE IF NOT EXISTS api_owner_approved_projections (
  projection_id text PRIMARY KEY,
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  kind text NOT NULL CHECK(kind IN ('TRANSCRIPT','COURSE','OFFERING','OPPORTUNITY','PLAN_INPUT')),
  entity_id text NOT NULL CHECK(length(entity_id) BETWEEN 1 AND 128),
  version text NOT NULL CHECK(version ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  payload_json jsonb NOT NULL CHECK(jsonb_typeof(payload_json)='object' AND pg_column_size(payload_json)<=250000),
  -- SHA256 of the exported canonicalProjectionHash serializer, NOT jsonb::text.
  payload_sha256 char(64) NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
  sources_json jsonb NOT NULL CHECK(jsonb_typeof(sources_json)='array'
    AND jsonb_array_length(sources_json) BETWEEN 1 AND 100),
  reviewed_by text NOT NULL CHECK(length(reviewed_by)>0 AND reviewed_by<>actor_id),
  reviewed_at timestamptz NOT NULL,
  as_of timestamptz NOT NULL CHECK(reviewed_at<=as_of),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
  UNIQUE(actor_id,kind,entity_id,projection_id)
);
CREATE TABLE IF NOT EXISTS api_owner_approved_heads (
  actor_id text NOT NULL,kind text NOT NULL,entity_id text NOT NULL,
  projection_id text NOT NULL,
  PRIMARY KEY(actor_id,kind,entity_id),
  FOREIGN KEY(actor_id,kind,entity_id,projection_id)
    REFERENCES api_owner_approved_projections(actor_id,kind,entity_id,projection_id)
);
CREATE TABLE IF NOT EXISTS api_owner_projection_revocations (
  projection_id text PRIMARY KEY REFERENCES api_owner_approved_projections(projection_id),
  revoked_by text NOT NULL CHECK(length(revoked_by)>0),
  revoked_at timestamptz NOT NULL,reason_ref text NOT NULL CHECK(length(reason_ref)>0)
);
CREATE TRIGGER immutable_owner_approved_projection BEFORE UPDATE OR DELETE ON api_owner_approved_projections
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
CREATE TRIGGER immutable_owner_projection_revocation BEFORE UPDATE OR DELETE ON api_owner_projection_revocations
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
ALTER TABLE api_owner_approved_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_owner_approved_projections FORCE ROW LEVEL SECURITY;
ALTER TABLE api_owner_approved_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_owner_approved_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY approved_projection_owner ON api_owner_approved_projections FOR SELECT
  USING(actor_id=current_setting('hufs.self_actor',true));
CREATE POLICY approved_head_owner ON api_owner_approved_heads FOR SELECT
  USING(actor_id=current_setting('hufs.self_actor',true));
REVOKE ALL ON api_owner_approved_projections,api_owner_approved_heads,api_owner_projection_revocations FROM PUBLIC;
-- Provisioning is a separately reviewed private operator role. The API role is
-- SELECT-only on these three tables and source metadata/review/rights tables;
-- never give API/owner/reviewer roles INSERT, head UPDATE, approval or raw bytes.
COMMIT;
