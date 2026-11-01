-- Owner-approved local student intake staging, separate from public/demo data.
-- Preview stores NOTHING; apply commits 4 participants atomically after a private
-- actor+purpose authorization and explicit expected version for every participant.
-- Never grant this table to public, reviewer, anonymous, CDN or projection roles.
BEGIN;
CREATE TABLE IF NOT EXISTS api_intake_heads (
  subject_key text PRIMARY KEY CHECK(char_length(subject_key) BETWEEN 2 AND 64),
  current_version bigint NOT NULL DEFAULT 0 CHECK(current_version>=0),
  current_batch_sha256 char(64),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT intake_head_sha_format CHECK(
    current_batch_sha256 IS NULL OR current_batch_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE IF NOT EXISTS api_intake_revisions (
  subject_key text NOT NULL REFERENCES api_intake_heads(subject_key),
  import_version bigint NOT NULL CHECK(import_version>0),
  batch_sha256 char(64) NOT NULL CHECK(batch_sha256 ~ '^[a-f0-9]{64}$'),
  forms_sha256 char(64) NOT NULL CHECK(forms_sha256 ~ '^[a-f0-9]{64}$'),
  course_sha256 char(64) NOT NULL CHECK(course_sha256 ~ '^[a-f0-9]{64}$'),
  actor_ref text NOT NULL CHECK(char_length(actor_ref) BETWEEN 2 AND 128),
  course_rows jsonb NOT NULL CHECK(
    jsonb_typeof(course_rows)='array' AND jsonb_array_length(course_rows)<=500),
  state text NOT NULL DEFAULT 'STUDENT_REVIEW_PENDING'
    CHECK(state='STUDENT_REVIEW_PENDING'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(subject_key,import_version),
  UNIQUE(subject_key,batch_sha256)
);
-- Staged courses may contain private academic data; no source text in logs,
-- reviewer/AI/demo projections, public web, CI, or unaudited backups.
REVOKE ALL ON TABLE api_intake_heads FROM PUBLIC;
REVOKE ALL ON TABLE api_intake_revisions FROM PUBLIC;
CREATE OR REPLACE FUNCTION api_intake_revisions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'intake revision history is immutable';
END;
$$;
CREATE TRIGGER api_intake_revisions_no_update
  BEFORE UPDATE OR DELETE ON api_intake_revisions
  FOR EACH ROW EXECUTE FUNCTION api_intake_revisions_immutable();
REVOKE ALL ON FUNCTION api_intake_revisions_immutable() FROM PUBLIC;
COMMIT;
