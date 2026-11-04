-- Private, independently reviewed #119 claim/evidence attestations. Apply only
-- after temporal_evidence, source_review, verified_source_rights, self_account.
-- No roles, grants, seeds, provider-result promotion, writers or activation.
BEGIN;
CREATE TABLE api_opportunity_revision_claim_approvals (
  approval_id text PRIMARY KEY CHECK(approval_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  opportunity_id text NOT NULL CHECK(opportunity_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  source_id text NOT NULL,
  revision_id text NOT NULL,
  permission_ref text NOT NULL CHECK(permission_ref ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  content_sha256 char(64) NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
  -- Exact field values + source-span manifest, canonically hashed with
  -- canonicalProjectionHash, never PostgreSQL jsonb::text or model confidence.
  payload_json jsonb NOT NULL CHECK(jsonb_typeof(payload_json)='object'
    AND octet_length(payload_json::text)<=250000
    AND jsonb_typeof(payload_json->'claims')='array'
    AND jsonb_array_length(payload_json->'claims') BETWEEN 1 AND 3
    AND jsonb_typeof(payload_json->'evidence')='array'
    AND jsonb_array_length(payload_json->'evidence') BETWEEN 1 AND 90),
  payload_sha256 char(64) NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
  consent_version text NOT NULL CHECK(length(consent_version) BETWEEN 1 AND 128),
  reviewed_by text NOT NULL CHECK(length(reviewed_by) BETWEEN 1 AND 200 AND reviewed_by<>actor_id),
  reviewed_at timestamptz NOT NULL,
  starts_at timestamptz NOT NULL CHECK(starts_at>=reviewed_at),
  expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
  UNIQUE(actor_id,opportunity_id,revision_id),
  FOREIGN KEY(source_id,revision_id) REFERENCES source_revisions_vnext(source_id,revision_id)
);
CREATE TABLE api_opportunity_revision_claim_revocations (
  approval_id text PRIMARY KEY REFERENCES api_opportunity_revision_claim_approvals(approval_id),
  revoked_at timestamptz NOT NULL,
  revoked_by text NOT NULL CHECK(length(revoked_by) BETWEEN 1 AND 200),
  reason_ref text NOT NULL CHECK(length(reason_ref) BETWEEN 1 AND 128)
);
-- The operator must review the actual original pixels and exact OCR lines,
-- dimensions, transform, pages and normalized geometry independently. This is
-- NOT a sink for provider output: provider/API roles receive no INSERT rights.
-- payload_json: {assetId,originalSha256,transformVersion,pageCount,width,height,
--   ocrLines:[{id,text,pageIndex,bboxNorm:[left,top,right,bottom]}]}.
CREATE TABLE api_reviewed_revision_image_evidence (
  evidence_id text PRIMARY KEY CHECK(evidence_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  revision_id text NOT NULL REFERENCES source_revisions_vnext(revision_id),
  asset_id text NOT NULL CHECK(asset_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  payload_json jsonb NOT NULL CHECK(jsonb_typeof(payload_json)='object'
    AND octet_length(payload_json::text)<=500000
    AND jsonb_typeof(payload_json->'ocrLines')='array'
    AND jsonb_array_length(payload_json->'ocrLines') BETWEEN 1 AND 2000),
  payload_sha256 char(64) NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
  reviewed_by text NOT NULL CHECK(length(reviewed_by) BETWEEN 1 AND 200),
  reviewed_at timestamptz NOT NULL,
  review_ref text NOT NULL CHECK(review_ref ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  UNIQUE(revision_id,asset_id)
);
CREATE TABLE api_revision_image_evidence_revocations (
  evidence_id text PRIMARY KEY REFERENCES api_reviewed_revision_image_evidence(evidence_id),
  revoked_at timestamptz NOT NULL,
  revoked_by text NOT NULL CHECK(length(revoked_by) BETWEEN 1 AND 200),
  reason_ref text NOT NULL CHECK(length(reason_ref) BETWEEN 1 AND 128)
);
CREATE TRIGGER immutable_revision_claim_approval BEFORE UPDATE OR DELETE ON api_opportunity_revision_claim_approvals
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
CREATE TRIGGER immutable_revision_claim_revocation BEFORE UPDATE OR DELETE ON api_opportunity_revision_claim_revocations
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
CREATE TRIGGER immutable_revision_image_evidence BEFORE UPDATE OR DELETE ON api_reviewed_revision_image_evidence
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
CREATE TRIGGER immutable_revision_image_revocation BEFORE UPDATE OR DELETE ON api_revision_image_evidence_revocations
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
ALTER TABLE api_opportunity_revision_claim_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_opportunity_revision_claim_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY revision_claim_owner ON api_opportunity_revision_claim_approvals FOR SELECT
  USING(actor_id=current_setting('hufs.self_actor',true));
REVOKE ALL ON api_opportunity_revision_claim_approvals,api_opportunity_revision_claim_revocations,
  api_reviewed_revision_image_evidence,api_revision_image_evidence_revocations FROM PUBLIC;
-- Independent private provisioning role only; API reader is SELECT-only and
-- must also have separately reviewed source metadata/paragraph/rights access.
COMMIT;
