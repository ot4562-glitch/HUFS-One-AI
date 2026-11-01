-- Conditional HTTP metadata is version-bound, never an authority for verification.
-- Apply after 20261031_temporal_evidence.sql in a reviewed empty or migrated DB.
BEGIN;
CREATE TABLE IF NOT EXISTS source_http_validators (
  source_id text PRIMARY KEY REFERENCES source_ingest_heads(source_id),
  revision_id text NOT NULL,
  canonical_url text NOT NULL CHECK(length(canonical_url) BETWEEN 9 AND 2048),
  etag text CHECK(etag IS NULL OR length(etag) BETWEEN 1 AND 200),
  last_modified text CHECK(last_modified IS NULL OR length(last_modified) BETWEEN 1 AND 200),
  observed_at timestamptz NOT NULL,
  CONSTRAINT validator_revision_source FOREIGN KEY(source_id,revision_id)
    REFERENCES source_revisions_vnext(source_id,revision_id)
);
REVOKE ALL ON TABLE source_http_validators FROM PUBLIC;
-- A dedicated operator writer gets SELECT/INSERT/UPDATE after rights review.
-- Read-only source history roles may get SELECT; public/reviewer roles get none.
COMMIT;
