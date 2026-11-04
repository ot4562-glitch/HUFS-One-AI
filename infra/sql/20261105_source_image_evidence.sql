-- Additive private IMAGE evidence storage. Apply after temporal_evidence and
-- 20261101_source_review.sql, before deploying the updated source reader/writer.
-- No live OCR, renderer, role, grant, resource or automatic approval is created.
-- PNG/JPEG identity raster v1 only. PDF approval awaits a reviewed renderer.
BEGIN;
ALTER TABLE source_paragraphs_vnext ADD COLUMN IF NOT EXISTS image_span jsonb;
ALTER TABLE source_originals_vnext ADD COLUMN IF NOT EXISTS image_evidence jsonb;
ALTER TABLE source_originals_vnext ADD COLUMN IF NOT EXISTS image_evidence_sha256 char(64);
ALTER TABLE source_review_attestations_vnext ADD COLUMN IF NOT EXISTS image_evidence_sha256 char(64);

ALTER TABLE source_paragraphs_vnext DROP CONSTRAINT IF EXISTS source_image_span_object;
ALTER TABLE source_paragraphs_vnext ADD CONSTRAINT source_image_span_object
  CHECK(image_span IS NULL OR (jsonb_typeof(image_span)='object'
    AND octet_length(image_span::text)<=500000));
ALTER TABLE source_originals_vnext DROP CONSTRAINT IF EXISTS source_image_evidence_pair;
ALTER TABLE source_originals_vnext ADD CONSTRAINT source_image_evidence_pair CHECK(
  (image_evidence IS NULL AND image_evidence_sha256 IS NULL)
  OR (image_evidence IS NOT NULL AND image_evidence_sha256 IS NOT NULL
    AND jsonb_typeof(image_evidence)='object'
    AND octet_length(image_evidence::text)<=500000
    AND image_evidence_sha256 ~ '^[0123456789abcdef]{64}$'));
ALTER TABLE source_review_attestations_vnext DROP CONSTRAINT IF EXISTS source_image_review_hash;
ALTER TABLE source_review_attestations_vnext ADD CONSTRAINT source_image_review_hash
  CHECK(image_evidence_sha256 IS NULL OR image_evidence_sha256 ~ '^[0123456789abcdef]{64}$');

-- Existing immutable UPDATE/DELETE triggers continue to protect these columns.
-- INSERT guards run with the caller's existing private role, never SECURITY
-- DEFINER. The writer/reviewer already need SELECT on their bound source rows.
CREATE OR REPLACE FUNCTION guard_source_image_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.media_kind='PDF' THEN
    RAISE EXCEPTION 'approved PDF renderer unavailable';
  END IF;
  IF NEW.media_kind='IMAGE' AND (NEW.status='ACTIVE' OR NEW.last_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'image revision requires independent review';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS source_image_revision_insert ON source_revisions_vnext;
CREATE TRIGGER source_image_revision_insert BEFORE INSERT ON source_revisions_vnext
  FOR EACH ROW EXECUTE FUNCTION guard_source_image_revision();

CREATE OR REPLACE FUNCTION guard_source_image_paragraph()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r source_revisions_vnext%ROWTYPE; s jsonb;
BEGIN
  SELECT * INTO STRICT r FROM source_revisions_vnext WHERE revision_id=NEW.revision_id;
  s:=NEW.image_span;
  IF r.media_kind='IMAGE' THEN
    -- The private writer/reviewer already serialize on the source head. Seal
    -- paragraphs when the immutable original bundle is inserted. This guard
    -- also rejects later direct INSERTs; it is not a hostile concurrent-writer
    -- lock protocol. A private ingest role needs SELECT(revision_id) on originals.
    IF EXISTS(SELECT 1 FROM source_originals_vnext WHERE revision_id=r.revision_id) THEN
      RAISE EXCEPTION 'image paragraphs are sealed';
    END IF;
    IF (jsonb_typeof(s)='object' AND s->>'kind'='IMAGE'
      AND s->>'sourceRevisionId'=r.revision_id
      AND s->>'originalSha256'=r.original_sha256
      AND s->>'quote'=NEW.paragraph_text
      AND s->>'assetId' ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND s->>'pageIndex'='0' AND s->>'transformVersion'='raster-identity-v1'
      AND s->>'extractionEngine'='CLOVA_OCR_GENERAL'
      AND jsonb_typeof(s->'ocrLineIds')='array'
      AND jsonb_typeof(s->'bboxNorm')='array') IS NOT TRUE THEN
      RAISE EXCEPTION 'image paragraph binding unavailable';
    END IF;
    IF jsonb_array_length(s->'ocrLineIds') NOT BETWEEN 1 AND 60
      OR jsonb_array_length(s->'bboxNorm')<>4
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(s->'bboxNorm') v WHERE jsonb_typeof(v)<>'number')
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(s->'ocrLineIds') v WHERE jsonb_typeof(v)<>'string') THEN
      RAISE EXCEPTION 'image paragraph geometry unavailable';
    END IF;
    IF ((s->'bboxNorm'->>0)::numeric>=0 AND (s->'bboxNorm'->>1)::numeric>=0
      AND (s->'bboxNorm'->>2)::numeric<=1 AND (s->'bboxNorm'->>3)::numeric<=1
      AND (s->'bboxNorm'->>0)::numeric<(s->'bboxNorm'->>2)::numeric
      AND (s->'bboxNorm'->>1)::numeric<(s->'bboxNorm'->>3)::numeric) IS NOT TRUE THEN
      RAISE EXCEPTION 'image paragraph geometry unavailable';
    END IF;
  ELSIF s IS NOT NULL OR r.media_kind='PDF' THEN
    RAISE EXCEPTION 'unexpected image evidence';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS source_image_paragraph_insert ON source_paragraphs_vnext;
CREATE TRIGGER source_image_paragraph_insert BEFORE INSERT ON source_paragraphs_vnext
  FOR EACH ROW EXECUTE FUNCTION guard_source_image_paragraph();

CREATE OR REPLACE FUNCTION guard_source_image_original()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r source_revisions_vnext%ROWTYPE; b jsonb;
BEGIN
  SELECT * INTO STRICT r FROM source_revisions_vnext WHERE revision_id=NEW.revision_id;
  b:=NEW.image_evidence;
  IF r.media_kind='IMAGE' THEN
    IF (NEW.original_sha256=r.original_sha256 AND NEW.captured_at>=r.fetched_at
      AND NEW.image_evidence_sha256 IS NOT NULL
      AND b->>'version'='source-image-v1' AND b->>'sourceId'=r.source_id
      AND b->>'sourceRevisionId'=r.revision_id AND b->>'permissionRef'=r.permission_ref
      AND b->>'originalSha256'=r.original_sha256 AND b->>'rasterSha256'=r.original_sha256
      AND b->>'assetId' ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND b->>'format' IN ('png','jpeg') AND b->>'transformVersion'='raster-identity-v1'
      AND b->>'reviewState'='NEEDS_REVIEW'
      AND b->>'transformReceiptId' ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND b->>'externalAiReceiptId' ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND b->>'processingPolicyVersion' ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND jsonb_typeof(b->'width')='number' AND jsonb_typeof(b->'height')='number'
      AND jsonb_typeof(b->'ocrFields')='array') IS NOT TRUE THEN
      RAISE EXCEPTION 'image original binding unavailable';
    END IF;
    IF ((b->>'width')::numeric BETWEEN 1 AND 2240
      AND (b->>'height')::numeric BETWEEN 1 AND 2240
      AND trunc((b->>'width')::numeric)=(b->>'width')::numeric
      AND trunc((b->>'height')::numeric)=(b->>'height')::numeric
      AND (b->>'width')::numeric*(b->>'height')::numeric<=4000000
      AND jsonb_array_length(b->'ocrFields') BETWEEN 1 AND 2000) IS NOT TRUE THEN
      RAISE EXCEPTION 'image original dimensions unavailable';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM source_paragraphs_vnext WHERE revision_id=r.revision_id)
      OR EXISTS(SELECT 1 FROM source_paragraphs_vnext p WHERE p.revision_id=r.revision_id
        AND (p.image_span->>'assetId'=b->>'assetId'
          AND p.image_span->>'originalSha256'=b->>'originalSha256'
          AND p.image_span->>'transformVersion'=b->>'transformVersion') IS NOT TRUE)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(b->'ocrFields') f
        WHERE (f->>'sourceRevisionId'=r.revision_id AND f->>'assetId'=b->>'assetId'
          AND f->>'originalSha256'=r.original_sha256
          AND f->>'transformVersion'=b->>'transformVersion') IS NOT TRUE) THEN
      RAISE EXCEPTION 'image original paragraphs unavailable';
    END IF;
  ELSIF b IS NOT NULL OR NEW.image_evidence_sha256 IS NOT NULL OR r.media_kind='PDF' THEN
    RAISE EXCEPTION 'unexpected image original';
  END IF;
  -- Canonical field normalization / SHA calculation and visual bbox review are
  -- performed by the private application/reviewer, not inferred by this trigger.
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS source_image_original_insert ON source_originals_vnext;
CREATE TRIGGER source_image_original_insert BEFORE INSERT ON source_originals_vnext
  FOR EACH ROW EXECUTE FUNCTION guard_source_image_original();

CREATE OR REPLACE FUNCTION guard_source_image_review()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r source_revisions_vnext%ROWTYPE; o source_originals_vnext%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM source_revisions_vnext WHERE revision_id=NEW.revision_id;
  SELECT * INTO STRICT o FROM source_originals_vnext WHERE revision_id=NEW.revision_id;
  IF r.media_kind='IMAGE' THEN
    IF (o.image_evidence IS NOT NULL AND o.image_evidence_sha256 IS NOT NULL
      AND NEW.image_evidence_sha256=o.image_evidence_sha256
      AND NEW.original_sha256=r.original_sha256 AND NEW.original_sha256=o.original_sha256
      AND NEW.content_sha256=r.content_sha256 AND NEW.checked_at>=r.fetched_at) IS NOT TRUE THEN
      RAISE EXCEPTION 'independent image review binding unavailable';
    END IF;
  ELSIF NEW.image_evidence_sha256 IS NOT NULL OR r.media_kind='PDF' THEN
    RAISE EXCEPTION 'unapproved media review';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS source_image_review_insert ON source_review_attestations_vnext;
CREATE TRIGGER source_image_review_insert BEFORE INSERT ON source_review_attestations_vnext
  FOR EACH ROW EXECUTE FUNCTION guard_source_image_review();

-- Preserve the existing view's column order/types and text behavior. Old IMAGE
-- rows without retained proof can never become usable TEXT or bypass review.
-- Choosing the latest revision BEFORE status filtering remains the reader's job.
CREATE OR REPLACE VIEW source_effective_revisions_vnext AS
SELECT r.revision_id,r.source_id,r.supersedes,r.original_sha256,r.content_sha256,
  r.media_kind,r.source_class,r.permission_ref,r.provenance,
  CASE WHEN r.media_kind IN ('IMAGE','PDF') AND r.status IN ('ACTIVE','NEEDS_REVIEW')
    THEN CASE WHEN r.media_kind='IMAGE' AND reviewed.valid
      AND o.image_evidence IS NOT NULL AND o.image_evidence_sha256 IS NOT NULL
      AND a.image_evidence_sha256=o.image_evidence_sha256 THEN 'ACTIVE' ELSE 'NEEDS_REVIEW' END
    WHEN r.status='NEEDS_REVIEW' AND reviewed.valid THEN 'ACTIVE'
    ELSE r.status END AS status,
  r.change_kind,r.published_at,r.fetched_at,
  greatest(r.last_checked_at,h.last_checked_at,observed.last_checked_at) AS last_checked_at,
  CASE WHEN r.media_kind IN ('IMAGE','PDF') THEN
      CASE WHEN r.media_kind='IMAGE' AND r.status IN ('ACTIVE','NEEDS_REVIEW') AND reviewed.valid
        AND o.image_evidence IS NOT NULL AND o.image_evidence_sha256 IS NOT NULL
        AND a.image_evidence_sha256=o.image_evidence_sha256 THEN a.checked_at ELSE NULL END
    WHEN r.status='NEEDS_REVIEW' AND reviewed.valid THEN a.checked_at
    ELSE r.last_verified_at END AS last_verified_at,
  r.valid_from,r.valid_until,r.scope_campuses,r.scope_majors,r.scope_colleges,
  r.scope_major_roles,r.scope_admission_types,r.scope_enrollment_states,
  r.scope_graduation_terms,r.cohort_min,r.cohort_max
FROM source_revisions_vnext r
LEFT JOIN source_review_attestations_vnext a ON a.revision_id=r.revision_id
LEFT JOIN source_originals_vnext o ON o.revision_id=r.revision_id
LEFT JOIN source_ingest_heads h ON h.source_id=r.source_id AND h.revision_id=r.revision_id
LEFT JOIN LATERAL (
  SELECT max(checked_at) AS last_checked_at FROM source_check_observations
  WHERE revision_id=r.revision_id
) observed ON true
CROSS JOIN LATERAL (SELECT a.decision='APPROVED'
  AND a.original_sha256=r.original_sha256 AND a.content_sha256=r.content_sha256
  AND a.checked_at>=r.fetched_at AND r.change_kind IN ('NEW','CORRECTED','EXTENDED')
  AND r.provenance IN ('SYNTHETIC','REAL_APPROVED')
  AND r.source_class IN ('SYNTHETIC','LICENSED_EXTERNAL') AS valid) reviewed;

REVOKE ALL ON FUNCTION guard_source_image_revision(),guard_source_image_paragraph(),
  guard_source_image_original(),guard_source_image_review() FROM PUBLIC;
REVOKE ALL ON source_originals_vnext,source_review_attestations_vnext,
  source_effective_revisions_vnext FROM PUBLIC;
-- Private ingest prerequisites: SELECT on revision/paragraph metadata and
-- SELECT(revision_id) on originals for the invoker guards, plus its existing
-- INSERT grants. Review retains its existing private original-read permission.
-- No grants to public/API projection roles and no original bytes in the view.
COMMIT;
