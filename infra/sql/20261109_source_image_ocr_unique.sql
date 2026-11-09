-- #381: fail closed on duplicate or malformed OCR field IDs at immutable IMAGE original INSERT.
-- Additive, review-only migration after 20261105_source_image_evidence.sql.
-- This does NOT call CLOVA, approve a source, import student data or alter existing originals.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_source_image_ocr_field_ids()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp
AS $$
DECLARE n integer; unique_n integer; bad_n integer;
BEGIN
  -- Images are immutable once inserted. Verify IDs at the lasting write boundary,
  -- independent of the private TypeScript normalization path.
  -- The existing IMAGE/PDF insert guards enforce the version for their media kind.
  -- This additional field-ID policy applies ONLY to source-image-v1: PDF bundles
  -- have distinct page/OCR structures and must not be rejected as IMAGE fields.
  IF NEW.image_evidence IS NULL
    OR NEW.image_evidence->>'version' IS DISTINCT FROM 'source-image-v1' THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.image_evidence) IS DISTINCT FROM 'object'
    OR jsonb_typeof(NEW.image_evidence->'ocrFields') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid OCR field ID list';
  END IF;
  SELECT count(*)::integer,count(DISTINCT item->>'id')::integer,
    count(*) FILTER(WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR COALESCE(item->>'id','') !~ '^[A-Za-z0-9_.:-]{1,128}$')::integer
    INTO n,unique_n,bad_n
    FROM jsonb_array_elements(NEW.image_evidence->'ocrFields') AS fields(item);
  IF n NOT BETWEEN 1 AND 2000 OR unique_n<>n OR bad_n<>0 THEN
    RAISE EXCEPTION 'duplicate or invalid OCR field ID';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS source_image_ocr_field_ids_insert ON public.source_originals_vnext;
CREATE TRIGGER source_image_ocr_field_ids_insert
  BEFORE INSERT ON public.source_originals_vnext
  FOR EACH ROW EXECUTE FUNCTION public.guard_source_image_ocr_field_ids();
REVOKE ALL ON FUNCTION public.guard_source_image_ocr_field_ids() FROM PUBLIC;
-- Keep existing original-hash, approval and immutable-history triggers unchanged.
-- Apply/verify in the approved private PostgreSQL migration workflow; not automatically.
COMMIT;
