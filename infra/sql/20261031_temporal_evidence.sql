-- HUFS One AI TASK-19/21: review-gated, immutable source revisions, retrieval,
-- conditional checks and cache invalidation events. DRAFT, not applied to any DB.
-- Never grant PostgREST/public/anonymous roles access to these raw text tables.
BEGIN;
CREATE TABLE IF NOT EXISTS source_revisions_vnext (
  revision_id text PRIMARY KEY,
  source_id text NOT NULL,
  supersedes text REFERENCES source_revisions_vnext(revision_id),
  original_sha256 char(64) NOT NULL CHECK(original_sha256 ~ '^[0123456789abcdef]{64}$'),
  content_sha256 char(64) NOT NULL CHECK(content_sha256 ~ '^[0123456789abcdef]{64}$'),
  media_kind text NOT NULL CHECK(media_kind IN ('HTML','IMAGE','PDF','TEXT')),
  source_class text NOT NULL CHECK(source_class IN (
    'SYNTHETIC','LICENSED_EXTERNAL','PERSONAL_CONSENTED','RESEARCH_REFERENCE_ONLY')),
  permission_ref text NOT NULL,
  provenance text NOT NULL CHECK(provenance IN ('SYNTHETIC','REAL_APPROVED','RESEARCH_ONLY')),
  status text NOT NULL CHECK(status IN (
    'ACTIVE','NEEDS_REVIEW','STALE','RETRACTED','BLOCKED_RIGHTS')),
  change_kind text NOT NULL CHECK(change_kind IN (
    'NEW','CORRECTED','EXTENDED','CANCELLED','UNKNOWN')),
  published_at timestamptz,
  fetched_at timestamptz NOT NULL,
  last_checked_at timestamptz NOT NULL,
  last_verified_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  scope_campuses text[],
  scope_majors text[],
  cohort_min integer,
  cohort_max integer,
  CONSTRAINT source_revision_time CHECK (
    last_checked_at>=fetched_at
    AND (last_verified_at IS NULL OR last_verified_at>=fetched_at)
    AND (valid_from IS NULL OR valid_until IS NULL OR valid_until>valid_from)
    AND (cohort_min IS NULL OR cohort_max IS NULL OR cohort_min<=cohort_max)),
  CONSTRAINT source_revision_active_rights CHECK (
    status!='ACTIVE'
    OR (last_verified_at IS NOT NULL
      AND source_class!='RESEARCH_REFERENCE_ONLY'
      AND provenance!='RESEARCH_ONLY'
      AND change_kind!='CANCELLED')),
  CONSTRAINT source_revision_chain CHECK (
    (change_kind='NEW' AND supersedes IS NULL)
    OR (change_kind!='NEW' AND supersedes IS NOT NULL)),
  CONSTRAINT source_revision_no_self CHECK (
    supersedes IS NULL OR supersedes<>revision_id),
  UNIQUE(source_id,fetched_at),
  UNIQUE(source_id,revision_id),
  CONSTRAINT revision_same_source FOREIGN KEY(source_id,supersedes)
    REFERENCES source_revisions_vnext(source_id,revision_id)
);
CREATE TABLE IF NOT EXISTS source_paragraphs_vnext (
  revision_id text NOT NULL REFERENCES source_revisions_vnext(revision_id),
  paragraph_id text NOT NULL,
  paragraph_text text NOT NULL CHECK (
    char_length(paragraph_text)>0 AND char_length(paragraph_text)<=20000),
  PRIMARY KEY(revision_id,paragraph_id)
);
-- Evidence is append-only: no updates/deletes to previous revision or quote.
-- New approvals, corrections and revocations must create a successor revision.
CREATE OR REPLACE FUNCTION deny_source_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable evidence history';
END;
$$;
REVOKE ALL ON FUNCTION deny_source_history_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS immutable_source_revision ON source_revisions_vnext;
CREATE TRIGGER immutable_source_revision
  BEFORE UPDATE OR DELETE ON source_revisions_vnext
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
DROP TRIGGER IF EXISTS immutable_source_paragraph ON source_paragraphs_vnext;
CREATE TRIGGER immutable_source_paragraph
  BEFORE UPDATE OR DELETE ON source_paragraphs_vnext
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
-- A HEAD row must be locked before every insert/update in a short transaction.
CREATE TABLE IF NOT EXISTS source_ingest_heads (
  source_id text PRIMARY KEY,
  revision_id text REFERENCES source_revisions_vnext(revision_id),
  fetched_at timestamptz,
  last_checked_at timestamptz
);
-- HTTP 304/unchanged observations NEVER update a source revision's
-- independent verification or publish flags.
CREATE TABLE IF NOT EXISTS source_check_observations (
  source_id text NOT NULL,
  checked_at timestamptz NOT NULL,
  revision_id text NOT NULL REFERENCES source_revisions_vnext(revision_id),
  response_status integer NOT NULL CHECK(response_status IN (200,304)),
  PRIMARY KEY(source_id,checked_at)
);
CREATE TABLE IF NOT EXISTS source_invalidation_events (
  event_id text PRIMARY KEY,
  source_id text NOT NULL,
  previous_revision_id text REFERENCES source_revisions_vnext(revision_id),
  new_revision_id text NOT NULL REFERENCES source_revisions_vnext(revision_id),
  reason text NOT NULL CHECK(reason IN (
    'CORRECTED','EXTENDED','CANCELLED','RIGHTS_REVOKED','VERIFICATION_STALE')),
  changed_at timestamptz NOT NULL,
  permission_policy_version text NOT NULL,
  invalidates text[] NOT NULL,
  CONSTRAINT invalidation_must_block_retrieval CHECK (
    invalidates @> ARRAY['RETRIEVAL','CLAIMS']::text[])
);
-- Durable, per-target outbox. A revision and five cache invalidations are
-- committed in ONE transaction. Consumers must be idempotent (event_id,target).
CREATE TABLE IF NOT EXISTS source_invalidation_deliveries (
  event_id text NOT NULL REFERENCES source_invalidation_events(event_id),
  target text NOT NULL CHECK(target IN (
    'RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE')),
  state text NOT NULL DEFAULT 'PENDING'
    CHECK(state IN ('PENDING','LEASED','DELIVERED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  PRIMARY KEY(event_id,target),
  CONSTRAINT delivery_lease_consistent CHECK (
    (state='PENDING' AND lease_token IS NULL AND lease_until IS NULL
      AND delivered_at IS NULL)
    OR (state='LEASED' AND lease_token IS NOT NULL AND lease_until IS NOT NULL
      AND delivered_at IS NULL)
    OR (state='DELIVERED' AND lease_token IS NULL AND lease_until IS NULL
      AND delivered_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS source_delivery_retry
  ON source_invalidation_deliveries(next_attempt_at,event_id,target)
  WHERE state IN ('PENDING','LEASED');
CREATE INDEX IF NOT EXISTS source_revisions_asof
  ON source_revisions_vnext(source_id,fetched_at DESC,revision_id DESC)
  INCLUDE(published_at);
CREATE INDEX IF NOT EXISTS source_revisions_permission
  ON source_revisions_vnext(permission_ref)
  WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS source_check_latest
  ON source_check_observations(source_id,checked_at DESC);

REVOKE ALL ON TABLE source_revisions_vnext FROM PUBLIC;
REVOKE ALL ON TABLE source_paragraphs_vnext FROM PUBLIC;
REVOKE ALL ON TABLE source_ingest_heads FROM PUBLIC;
REVOKE ALL ON TABLE source_check_observations FROM PUBLIC;
REVOKE ALL ON TABLE source_invalidation_events FROM PUBLIC;
REVOKE ALL ON TABLE source_invalidation_deliveries FROM PUBLIC;
-- A narrowly scoped API role gets SELECT on revisions/paragraphs only.
-- The ingest service uses a distinct writer role with INSERT into revisions
-- and inserts/updates HEAD + check observations. Neither role can DELETE
-- revision records or rewrite reviewed source paragraphs.
-- GRANT only after operator review and actual PostgreSQL transaction tests.
COMMIT;
