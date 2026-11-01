-- TASK-19: bounded, explicit, server-owned source inspection scheduling.
-- No raw pages, student data, URLs, tokens, model content or credentials stored.
-- Run only after separately reviewing the operator role and source-rights registry.
BEGIN;
CREATE TABLE IF NOT EXISTS source_ingest_jobs (
  job_id uuid PRIMARY KEY,
  actor_ref text NOT NULL CHECK(char_length(actor_ref) BETWEEN 1 AND 128),
  source_id text NOT NULL CHECK(char_length(source_id) BETWEEN 1 AND 128),
  permission_ref text NOT NULL CHECK(char_length(permission_ref) BETWEEN 1 AND 128),
  request_key text NOT NULL CHECK(char_length(request_key) BETWEEN 1 AND 128),
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN (
    'PENDING','LEASED','NEW_DRAFT','CHANGED_DRAFT','UNCHANGED',
    'BLOCKED_RIGHTS','NEEDS_REVIEW')),
  queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 1),
  lease_token uuid,
  lease_until timestamptz,
  outcome_revision_id text,
  CONSTRAINT source_ingest_revision_same_source FOREIGN KEY(source_id,outcome_revision_id)
    REFERENCES source_revisions_vnext(source_id,revision_id),
  last_error_code text CHECK(last_error_code IN ('SOURCE_FAILURE','UNKNOWN_COMPLETION','RIGHTS_DENIED')),
  UNIQUE(source_id,request_key),
  CONSTRAINT source_ingest_lease_state CHECK (
    (state='LEASED' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (state<>'LEASED' AND lease_token IS NULL AND lease_until IS NULL)),
  CONSTRAINT source_ingest_result_bound CHECK (
    (state IN ('NEW_DRAFT','CHANGED_DRAFT','UNCHANGED') AND outcome_revision_id IS NOT NULL)
    OR (state NOT IN ('NEW_DRAFT','CHANGED_DRAFT','UNCHANGED') AND outcome_revision_id IS NULL))
);
CREATE INDEX IF NOT EXISTS source_ingest_due ON source_ingest_jobs(queued_at,job_id)
  WHERE state='PENDING';
CREATE INDEX IF NOT EXISTS source_ingest_leased ON source_ingest_jobs(lease_until)
  WHERE state='LEASED';
REVOKE ALL ON TABLE source_ingest_jobs FROM PUBLIC;
COMMIT;
