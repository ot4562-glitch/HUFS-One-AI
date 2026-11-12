-- #445: preserve the original Korean document format; never relabel HWP as TEXT.
-- Code-only forward migration. NCP execution requires separate operator acceptance.
-- Existing raw originals, review gates, privileges and RLS policies are unchanged.
BEGIN;
ALTER TABLE source_revisions_vnext
  DROP CONSTRAINT source_revisions_vnext_media_kind_check;
ALTER TABLE source_revisions_vnext
  ADD CONSTRAINT source_revisions_vnext_media_kind_check
  CHECK(media_kind IN ('HTML','IMAGE','PDF','TEXT','HWP','HWPX'));

-- Defense for private INSERT-only ingestion SQL roles as well as the TS writer.
-- Real approval INSERTs an attestation and is derived by the effective view;
-- it never inserts or rewrites an already verified document revision.
CREATE FUNCTION guard_source_korean_document_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.media_kind IN ('HWP','HWPX')
    AND (NEW.status='ACTIVE' OR NEW.last_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'document revision requires independent original review';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER source_korean_document_revision_insert
  BEFORE INSERT ON source_revisions_vnext FOR EACH ROW
  EXECUTE FUNCTION guard_source_korean_document_revision();
COMMIT;
