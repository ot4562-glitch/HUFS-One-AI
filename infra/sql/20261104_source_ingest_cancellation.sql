-- Forward-only queue state extension. Apply after 20261101_source_ingest_queue.sql.
-- Pending-only cancellation preserves idempotency rows and never retries IO.
-- Proposal only: no automatic migration or operational authority is granted.
BEGIN;
ALTER TABLE source_ingest_jobs DROP CONSTRAINT source_ingest_jobs_state_check;
ALTER TABLE source_ingest_jobs ADD CONSTRAINT source_ingest_jobs_state_check
  CHECK(state IN ('PENDING','LEASED','NEW_DRAFT','CHANGED_DRAFT','UNCHANGED',
    'BLOCKED_RIGHTS','NEEDS_REVIEW','CANCELLED'));
COMMIT;
