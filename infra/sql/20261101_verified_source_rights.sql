-- Private operator-provisioned source usage and independently verified actor
-- facts. No real approvals, roles, credentials, network or resources are seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS source_rights_receipts (
  receipt_id text PRIMARY KEY CHECK(receipt_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  source_id text NOT NULL CHECK(source_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  permission_ref text NOT NULL CHECK(permission_ref ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  canonical_url text NOT NULL CHECK(length(canonical_url) BETWEEN 9 AND 2048),
  purposes text[] NOT NULL CHECK(cardinality(purposes) BETWEEN 1 AND 4
    AND purposes <@ ARRAY['COLLECT','STORE','SEARCH','EXTERNAL_TRANSFER']::text[]),
  reviewed_by text NOT NULL CHECK(length(reviewed_by) BETWEEN 1 AND 128 AND reviewed_by<>actor_id),
  reviewed_at timestamptz NOT NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  policy_version text NOT NULL CHECK(policy_version ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  CHECK(reviewed_at<=starts_at AND starts_at<expires_at)
);
CREATE INDEX IF NOT EXISTS source_rights_actor_latest
  ON source_rights_receipts(actor_id,source_id,permission_ref,reviewed_at DESC,receipt_id DESC);
CREATE TABLE IF NOT EXISTS source_rights_revocations (
  receipt_id text PRIMARY KEY REFERENCES source_rights_receipts(receipt_id),
  revoked_by text NOT NULL CHECK(length(revoked_by) BETWEEN 1 AND 128),
  revoked_at timestamptz NOT NULL,
  reason_ref text NOT NULL CHECK(length(reason_ref) BETWEEN 1 AND 128)
);
-- Academic facts describe the verified actor, never the source's applicability
-- rules. A newer expired/revoked attestation shadows all earlier attestations.
CREATE TABLE IF NOT EXISTS source_actor_scope_receipts (
  scope_receipt_id text PRIMARY KEY CHECK(scope_receipt_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  scope_json jsonb NOT NULL CHECK(jsonb_typeof(scope_json)='object' AND octet_length(scope_json::text)<=8000),
  reviewed_by text NOT NULL CHECK(length(reviewed_by) BETWEEN 1 AND 128 AND reviewed_by<>actor_id),
  reviewed_at timestamptz NOT NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  scope_version text NOT NULL CHECK(scope_version ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  CHECK(reviewed_at<=starts_at AND starts_at<expires_at)
);
CREATE INDEX IF NOT EXISTS source_actor_scope_latest
  ON source_actor_scope_receipts(actor_id,reviewed_at DESC,scope_receipt_id DESC);
CREATE TABLE IF NOT EXISTS source_actor_scope_revocations (
  scope_receipt_id text PRIMARY KEY REFERENCES source_actor_scope_receipts(scope_receipt_id),
  revoked_by text NOT NULL CHECK(length(revoked_by) BETWEEN 1 AND 128),
  revoked_at timestamptz NOT NULL,
  reason_ref text NOT NULL CHECK(length(reason_ref) BETWEEN 1 AND 128)
);
CREATE OR REPLACE FUNCTION deny_verified_source_rights_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable verified source authority'; END; $$;
REVOKE ALL ON FUNCTION deny_verified_source_rights_mutation() FROM PUBLIC;
CREATE TRIGGER immutable_source_rights_receipt BEFORE UPDATE OR DELETE ON source_rights_receipts
  FOR EACH ROW EXECUTE FUNCTION deny_verified_source_rights_mutation();
CREATE TRIGGER immutable_source_rights_revocation BEFORE UPDATE OR DELETE ON source_rights_revocations
  FOR EACH ROW EXECUTE FUNCTION deny_verified_source_rights_mutation();
CREATE TRIGGER immutable_source_actor_scope_receipt BEFORE UPDATE OR DELETE ON source_actor_scope_receipts
  FOR EACH ROW EXECUTE FUNCTION deny_verified_source_rights_mutation();
CREATE TRIGGER immutable_source_actor_scope_revocation BEFORE UPDATE OR DELETE ON source_actor_scope_revocations
  FOR EACH ROW EXECUTE FUNCTION deny_verified_source_rights_mutation();
REVOKE ALL ON source_rights_receipts,source_rights_revocations,
  source_actor_scope_receipts,source_actor_scope_revocations FROM PUBLIC;
-- The operator explicitly grants INSERT to an independently authenticated
-- approval role and SELECT to dedicated source-authority readers. Browser/API
-- projection roles MUST NOT receive INSERT/UPDATE/DELETE. Approval IDs are
-- external attestation references, not self-reported browser booleans.
COMMIT;
