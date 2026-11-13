-- #445/#449 private immutable execution provenance, not deployment authority.
-- Apply after temporal evidence and source HTTP observations. No data is seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS source_ingest_runtime_receipts (
  source_id text NOT NULL,
  revision_id text NOT NULL REFERENCES source_revisions_vnext(revision_id),
  checked_at timestamptz NOT NULL,
  event_kind text NOT NULL CHECK(event_kind IN ('REVISION','OBSERVATION')),
  response_status integer NOT NULL CHECK(response_status IN (200,304)),
  manifest jsonb NOT NULL,
  PRIMARY KEY(source_id,revision_id,checked_at,event_kind),
  CHECK((jsonb_typeof(manifest)='object'
    AND octet_length(manifest::text)<=4096
    AND (manifest-ARRAY['gitSha','buildSha','migrationVersion','adapterVersion','datasetRevision','schemaVersion'])='{}'::jsonb
    AND jsonb_typeof(manifest->'gitSha')='string' AND manifest->>'gitSha' ~ '^[a-f0-9]{40}$'
    AND jsonb_typeof(manifest->'buildSha')='string' AND manifest->>'buildSha' ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(manifest->'migrationVersion')='string' AND manifest->>'migrationVersion' ~ '^[A-Za-z0-9_.:-]{1,128}$'
    AND jsonb_typeof(manifest->'adapterVersion')='string' AND manifest->>'adapterVersion' ~ '^[A-Za-z0-9_.:-]{1,128}$'
    AND jsonb_typeof(manifest->'datasetRevision')='string' AND manifest->>'datasetRevision' ~ '^[A-Za-z0-9_.:-]{1,128}$'
    AND jsonb_typeof(manifest->'schemaVersion')='number'
    AND (manifest->>'schemaVersion')::numeric BETWEEN 1 AND 9007199254740991
    AND trunc((manifest->>'schemaVersion')::numeric)=(manifest->>'schemaVersion')::numeric) IS TRUE)
);
REVOKE ALL ON source_ingest_runtime_receipts FROM PUBLIC;

CREATE OR REPLACE FUNCTION guard_source_runtime_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Immutable source runtime receipt'; END IF;
  IF NOT EXISTS(SELECT 1 FROM source_revisions_vnext r
    JOIN source_originals_vnext o ON o.revision_id=r.revision_id
    WHERE r.revision_id=NEW.revision_id AND r.source_id=NEW.source_id
      AND o.original_sha256=r.original_sha256
      AND (CASE WHEN NEW.event_kind='REVISION'
        THEN NEW.response_status=200 AND NEW.checked_at=r.fetched_at
        ELSE EXISTS(SELECT 1 FROM source_check_observations observed
          WHERE observed.source_id=NEW.source_id AND observed.revision_id=NEW.revision_id
            AND observed.checked_at=NEW.checked_at AND observed.response_status=NEW.response_status) END)) THEN
    RAISE EXCEPTION 'Source runtime receipt is not bound to persisted evidence';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION guard_source_runtime_receipt() FROM PUBLIC;
DROP TRIGGER IF EXISTS source_runtime_receipt_write ON source_ingest_runtime_receipts;
CREATE TRIGGER source_runtime_receipt_write BEFORE INSERT OR UPDATE OR DELETE ON source_ingest_runtime_receipts
  FOR EACH ROW EXECUTE FUNCTION guard_source_runtime_receipt();
DROP TRIGGER IF EXISTS source_runtime_receipt_truncate ON source_ingest_runtime_receipts;
CREATE TRIGGER source_runtime_receipt_truncate BEFORE TRUNCATE ON source_ingest_runtime_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION guard_source_runtime_receipt();
COMMIT;
