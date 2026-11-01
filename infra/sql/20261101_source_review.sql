-- Private source originals and independent human attestations. No resources,
-- extensions, roles or automatic activation are created by this migration.
BEGIN;
ALTER TABLE source_paragraphs_vnext ADD COLUMN IF NOT EXISTS paragraph_ordinal integer;
-- Existing paragraphs cannot be assigned a trustworthy original order after
-- the fact. Legacy revisions have no preserved originals and cannot be reviewed
-- through this port; explicitly re-ingest with authorized rights instead.
CREATE UNIQUE INDEX IF NOT EXISTS source_paragraph_ordinal
  ON source_paragraphs_vnext(revision_id,paragraph_ordinal);
CREATE INDEX IF NOT EXISTS source_check_revision_latest
  ON source_check_observations(revision_id,checked_at DESC);
CREATE TABLE IF NOT EXISTS source_originals_vnext (
  revision_id text PRIMARY KEY REFERENCES source_revisions_vnext(revision_id),
  original_sha256 char(64) NOT NULL CHECK(original_sha256 ~ '^[0123456789abcdef]{64}$'),
  original_bytes bytea NOT NULL CHECK(octet_length(original_bytes) BETWEEN 1 AND 500000),
  captured_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS source_review_attestations_vnext (
  review_id text PRIMARY KEY,
  revision_id text NOT NULL UNIQUE REFERENCES source_originals_vnext(revision_id),
  reviewer_id text NOT NULL CHECK(length(reviewer_id) BETWEEN 1 AND 128),
  decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
  checked_at timestamptz NOT NULL,
  original_sha256 char(64) NOT NULL CHECK(original_sha256 ~ '^[0123456789abcdef]{64}$'),
  content_sha256 char(64) NOT NULL CHECK(content_sha256 ~ '^[0123456789abcdef]{64}$'),
  permission_policy_version text NOT NULL CHECK(length(permission_policy_version) BETWEEN 1 AND 128)
);
DROP TRIGGER IF EXISTS immutable_source_original ON source_originals_vnext;
CREATE TRIGGER immutable_source_original BEFORE UPDATE OR DELETE ON source_originals_vnext
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
DROP TRIGGER IF EXISTS immutable_source_review ON source_review_attestations_vnext;
CREATE TRIGGER immutable_source_review BEFORE UPDATE OR DELETE ON source_review_attestations_vnext
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
-- Readers apply current live source rights and asOf filters themselves. An
-- attestation never changes fetched_at or rewrites a historical source row.
CREATE OR REPLACE VIEW source_effective_revisions_vnext AS
SELECT r.revision_id,r.source_id,r.supersedes,r.original_sha256,r.content_sha256,
  r.media_kind,r.source_class,r.permission_ref,r.provenance,
  CASE WHEN r.status='NEEDS_REVIEW' AND a.decision='APPROVED'
    AND a.original_sha256=r.original_sha256 AND a.content_sha256=r.content_sha256
    AND a.checked_at>=r.fetched_at AND r.change_kind IN ('NEW','CORRECTED','EXTENDED')
    AND r.provenance IN ('SYNTHETIC','REAL_APPROVED')
    AND r.source_class IN ('SYNTHETIC','LICENSED_EXTERNAL') THEN 'ACTIVE'
    ELSE r.status END AS status,
  r.change_kind,r.published_at,r.fetched_at,
  greatest(r.last_checked_at,h.last_checked_at,o.last_checked_at) AS last_checked_at,
  CASE WHEN r.status='NEEDS_REVIEW' AND a.decision='APPROVED'
    AND a.original_sha256=r.original_sha256 AND a.content_sha256=r.content_sha256
    AND a.checked_at>=r.fetched_at AND r.change_kind IN ('NEW','CORRECTED','EXTENDED')
    AND r.provenance IN ('SYNTHETIC','REAL_APPROVED')
    AND r.source_class IN ('SYNTHETIC','LICENSED_EXTERNAL') THEN a.checked_at
    ELSE r.last_verified_at END AS last_verified_at,
  r.valid_from,r.valid_until,r.scope_campuses,r.scope_majors,r.scope_colleges,
  r.scope_major_roles,r.scope_admission_types,r.scope_enrollment_states,
  r.scope_graduation_terms,r.cohort_min,r.cohort_max
FROM source_revisions_vnext r
LEFT JOIN source_review_attestations_vnext a ON a.revision_id=r.revision_id
LEFT JOIN source_ingest_heads h ON h.source_id=r.source_id AND h.revision_id=r.revision_id
LEFT JOIN LATERAL (
  SELECT max(checked_at) AS last_checked_at FROM source_check_observations
  WHERE revision_id=r.revision_id
) o ON true;
REVOKE ALL ON source_originals_vnext,source_review_attestations_vnext,
  source_effective_revisions_vnext FROM PUBLIC;
-- Grant explicit INSERT/SELECT on originals only to private ingest/review
-- roles, and SELECT on the effective view to authorized evidence/calendar
-- readers. Public/API projection roles must not receive original-byte access.
COMMIT;
