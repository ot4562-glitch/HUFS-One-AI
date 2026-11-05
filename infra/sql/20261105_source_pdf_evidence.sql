-- Additive PDF evidence persistence. Apply AFTER 20261105_source_image_evidence.sql
-- and BEFORE deploying the PDF reader/writer. No renderer, credentials, roles,
-- grants, network resources or automatic human approval are created.
-- source-image-v1 semantics are retained. PDF v1 is bounded to four full pages,
-- MediaBox=CropBox, rotation=0, UserUnit=1. Unsupported transforms fail closed.
BEGIN;
CREATE TABLE IF NOT EXISTS source_pdf_rasters_vnext (
  revision_id text NOT NULL REFERENCES source_revisions_vnext(revision_id),
  page_index integer NOT NULL CHECK(page_index BETWEEN 0 AND 3),
  asset_id text NOT NULL CHECK(asset_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  raster_sha256 char(64) NOT NULL CHECK(raster_sha256 ~ '^[0123456789abcdef]{64}$'),
  raster_bytes bytea NOT NULL CHECK(octet_length(raster_bytes) BETWEEN 33 AND 262144),
  width integer NOT NULL CHECK(width BETWEEN 1 AND 2240),
  height integer NOT NULL CHECK(height BETWEEN 1 AND 2240),
  PRIMARY KEY(revision_id,page_index), UNIQUE(revision_id,asset_id),
  CHECK(width*height<=4000000),
  CHECK(encode(sha256(raster_bytes),'hex')=raster_sha256),
  CHECK(substring(raster_bytes from 1 for 8)=decode('89504e470d0a1a0a','hex')
    AND substring(raster_bytes from 13 for 4)=decode('49484452','hex')),
  CHECK(get_byte(raster_bytes,16)::bigint*16777216+get_byte(raster_bytes,17)*65536
    +get_byte(raster_bytes,18)*256+get_byte(raster_bytes,19)=width),
  CHECK(get_byte(raster_bytes,20)::bigint*16777216+get_byte(raster_bytes,21)*65536
    +get_byte(raster_bytes,22)*256+get_byte(raster_bytes,23)=height)
);
-- Full PNG decoding/CRC/deflate checks are performed by the bounded private
-- application before INSERT and again by the independent review service.
DROP TRIGGER IF EXISTS immutable_source_pdf_raster ON source_pdf_rasters_vnext;
CREATE TRIGGER immutable_source_pdf_raster BEFORE UPDATE OR DELETE ON source_pdf_rasters_vnext
  FOR EACH ROW EXECUTE FUNCTION deny_source_history_mutation();
CREATE OR REPLACE FUNCTION guard_source_pdf_raster()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r source_revisions_vnext%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM source_revisions_vnext WHERE revision_id=NEW.revision_id;
  IF r.media_kind<>'PDF' OR r.status='ACTIVE' OR r.last_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'PDF raster requires an unreviewed PDF revision';
  END IF;
  -- Writer/reviewer serialize on the same source head. The immutable original
  -- bundle seals page/paragraph INSERTs; this is not a hostile-admin lock model.
  IF EXISTS(SELECT 1 FROM source_originals_vnext WHERE revision_id=NEW.revision_id) THEN
    RAISE EXCEPTION 'PDF page rasters are sealed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS source_pdf_raster_insert ON source_pdf_rasters_vnext;
CREATE TRIGGER source_pdf_raster_insert BEFORE INSERT ON source_pdf_rasters_vnext
  FOR EACH ROW EXECUTE FUNCTION guard_source_pdf_raster();

CREATE OR REPLACE FUNCTION guard_source_image_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.media_kind IN ('IMAGE','PDF') AND (NEW.status='ACTIVE' OR NEW.last_verified_at IS NOT NULL) THEN
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
  IF r.media_kind IN ('IMAGE','PDF') THEN
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
      AND ((r.media_kind='IMAGE' AND s->>'pageIndex'='0'
        AND s->>'transformVersion'='raster-identity-v1') OR (r.media_kind='PDF'
        AND jsonb_typeof(s->'pageIndex')='number' AND s->>'pageIndex' ~ '^[0-3]$'
        AND s->>'transformVersion'='pdf-full-page-v1'))
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
  ELSIF s IS NOT NULL THEN
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
DECLARE r source_revisions_vnext%ROWTYPE; b jsonb; v_page jsonb; page_position bigint;
  page_width numeric; page_height numeric; raster_width numeric; raster_height numeric;
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
  ELSIF r.media_kind='PDF' THEN
    IF (NEW.original_sha256=r.original_sha256 AND NEW.captured_at=r.fetched_at
      AND octet_length(NEW.original_bytes) BETWEEN 1 AND 262144
      AND substring(NEW.original_bytes from 1 for 5)=decode('255044462d','hex')
      AND encode(sha256(NEW.original_bytes),'hex')=r.original_sha256
      AND NEW.image_evidence_sha256 IS NOT NULL
      AND b->>'version'='source-pdf-v1' AND b->>'sourceId'=r.source_id
      AND b->>'sourceRevisionId'=r.revision_id AND b->>'permissionRef'=r.permission_ref
      AND b->>'originalSha256'=r.original_sha256
      AND jsonb_typeof(b->'originalByteLength')='number'
      AND b->>'originalByteLength'=octet_length(NEW.original_bytes)::text
      AND b->>'transformVersion'='pdf-full-page-v1' AND b->>'reviewState'='NEEDS_REVIEW'
      AND b->>'transformReceiptId' ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND b->>'externalAiReceiptId' ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND b->>'processingPolicyVersion' ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND b->'renderer'->>'id'='poppler-pdf-v1'
      AND b->'renderer'->>'version' ~ '^[!-~]{1,128}$'
      AND b->'renderer'->>'artifactSha256' ~ '^[0123456789abcdef]{64}$'
      AND b->'renderer'->>'policyVersion' ~ '^[A-Za-z0-9_.:-]{1,128}$'
      AND jsonb_typeof(b->'pageCount')='number' AND b->>'pageCount' ~ '^[1-4]$'
      AND jsonb_typeof(b->'pages')='array') IS NOT TRUE THEN
      RAISE EXCEPTION 'PDF original binding unavailable';
    END IF;
    IF jsonb_array_length(b->'pages')<>(b->>'pageCount')::integer
      OR (SELECT count(*) FROM source_pdf_rasters_vnext WHERE revision_id=r.revision_id)
        <>(b->>'pageCount')::integer
      OR (SELECT octet_length(NEW.original_bytes)+coalesce(sum(octet_length(raster_bytes)),0)
        FROM source_pdf_rasters_vnext WHERE revision_id=r.revision_id)>1048576 THEN
      RAISE EXCEPTION 'PDF page set unavailable';
    END IF;
    FOR v_page,page_position IN SELECT value,ordinality FROM jsonb_array_elements(b->'pages') WITH ORDINALITY LOOP
      IF (jsonb_typeof(v_page)='object' AND jsonb_typeof(v_page->'pageIndex')='number'
        AND v_page->>'pageIndex'=(page_position-1)::text
        AND v_page->>'assetId' ~ '^[A-Za-z0-9_.:-]{1,128}$'
        AND v_page->>'rasterSha256' ~ '^[0123456789abcdef]{64}$' AND v_page->>'format'='png'
        AND jsonb_typeof(v_page->'rasterByteLength')='number'
        AND jsonb_typeof(v_page->'width')='number' AND jsonb_typeof(v_page->'height')='number'
        AND jsonb_typeof(v_page->'mediaBox')='array' AND jsonb_typeof(v_page->'cropBox')='array'
        AND v_page->'mediaBox'=v_page->'cropBox' AND v_page->>'rotation'='0' AND v_page->>'userUnit'='1'
        AND jsonb_typeof(v_page->'rasterToPageNorm')='array'
        AND jsonb_typeof(v_page->'rasterToPdfPoints')='array'
        AND jsonb_typeof(v_page->'ocrFields')='array') IS NOT TRUE THEN
        RAISE EXCEPTION 'PDF page binding unavailable';
      END IF;
      IF jsonb_array_length(v_page->'mediaBox')<>4
        OR jsonb_array_length(v_page->'rasterToPageNorm')<>6
        OR jsonb_array_length(v_page->'rasterToPdfPoints')<>6
        OR jsonb_array_length(v_page->'ocrFields') NOT BETWEEN 1 AND 2000
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_page->'mediaBox') v WHERE jsonb_typeof(v)<>'number')
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_page->'rasterToPageNorm') v WHERE jsonb_typeof(v)<>'number')
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_page->'rasterToPdfPoints') v WHERE jsonb_typeof(v)<>'number') THEN
        RAISE EXCEPTION 'PDF page geometry unavailable';
      END IF;
      raster_width:=(v_page->>'width')::numeric; raster_height:=(v_page->>'height')::numeric;
      page_width:=(v_page->'mediaBox'->>2)::numeric-(v_page->'mediaBox'->>0)::numeric;
      page_height:=(v_page->'mediaBox'->>3)::numeric-(v_page->'mediaBox'->>1)::numeric;
      IF (raster_width BETWEEN 1 AND 2240 AND raster_height BETWEEN 1 AND 2240
        AND trunc(raster_width)=raster_width AND trunc(raster_height)=raster_height
        AND raster_width*raster_height<=4000000
        AND page_width>0 AND page_width<=14400 AND page_height>0 AND page_height<=14400
        AND abs(raster_width-raster_height*page_width/page_height)<=1.01
        AND abs(raster_height-raster_width*page_height/page_width)<=1.01
        AND (v_page->>'rasterByteLength')::numeric BETWEEN 1 AND 262144
        AND trunc((v_page->>'rasterByteLength')::numeric)=(v_page->>'rasterByteLength')::numeric) IS NOT TRUE
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_page->'mediaBox') v WHERE abs(v::text::numeric)>14400) THEN
        RAISE EXCEPTION 'PDF page dimensions unavailable';
      END IF;
      -- PDF page bbox coordinates are top-left/y-down normalized; native PDF
      -- points use the separate y-up matrix. Canonical application parsing also
      -- checks exact matrices, OCR fields and line/quote/bbox reconstruction.
      IF (abs((v_page->'rasterToPageNorm'->>0)::numeric-1/raster_width)<=0.000000001
        AND (v_page->'rasterToPageNorm'->>1)::numeric=0 AND (v_page->'rasterToPageNorm'->>2)::numeric=0
        AND abs((v_page->'rasterToPageNorm'->>3)::numeric-1/raster_height)<=0.000000001
        AND (v_page->'rasterToPageNorm'->>4)::numeric=0 AND (v_page->'rasterToPageNorm'->>5)::numeric=0
        AND abs((v_page->'rasterToPdfPoints'->>0)::numeric-page_width/raster_width)<=0.000000001
        AND (v_page->'rasterToPdfPoints'->>1)::numeric=0 AND (v_page->'rasterToPdfPoints'->>2)::numeric=0
        AND abs((v_page->'rasterToPdfPoints'->>3)::numeric+page_height/raster_height)<=0.000000001
        AND (v_page->'rasterToPdfPoints'->>4)::numeric=(v_page->'mediaBox'->>0)::numeric
        AND (v_page->'rasterToPdfPoints'->>5)::numeric=(v_page->'mediaBox'->>3)::numeric) IS NOT TRUE THEN
        RAISE EXCEPTION 'PDF transform provenance unavailable';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM source_pdf_rasters_vnext q
        WHERE q.revision_id=r.revision_id AND q.page_index=page_position-1
          AND q.asset_id=v_page->>'assetId' AND q.raster_sha256=v_page->>'rasterSha256'
          AND octet_length(q.raster_bytes)::text=v_page->>'rasterByteLength'
          AND q.width=raster_width AND q.height=raster_height)
        OR NOT EXISTS(SELECT 1 FROM source_paragraphs_vnext q
          WHERE q.revision_id=r.revision_id AND q.image_span->>'pageIndex'=(page_position-1)::text)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_page->'ocrFields') f
          WHERE (f->>'sourceRevisionId'=r.revision_id AND f->>'assetId'=v_page->>'assetId'
            AND f->>'originalSha256'=v_page->>'rasterSha256' AND f->>'pageIndex'='0'
            AND f->>'transformVersion'='raster-identity-v1') IS NOT TRUE) THEN
        RAISE EXCEPTION 'PDF raster evidence unavailable';
      END IF;
    END LOOP;
    IF (SELECT count(*) FROM source_paragraphs_vnext WHERE revision_id=r.revision_id) NOT BETWEEN 1 AND 200
      OR EXISTS(SELECT 1 FROM source_paragraphs_vnext q
        WHERE q.revision_id=r.revision_id AND NOT EXISTS(
          SELECT 1 FROM jsonb_array_elements(b->'pages') AS page_row(value)
          WHERE q.image_span->>'assetId'=page_row.value->>'assetId'
            AND q.image_span->>'pageIndex'=page_row.value->>'pageIndex'
            AND q.image_span->>'originalSha256'=b->>'originalSha256'
            AND q.image_span->>'transformVersion'=b->>'transformVersion')) THEN
      RAISE EXCEPTION 'PDF paragraph evidence unavailable';
    END IF;
  ELSIF b IS NOT NULL OR NEW.image_evidence_sha256 IS NOT NULL THEN
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
  IF r.media_kind IN ('IMAGE','PDF') THEN
    IF (o.image_evidence IS NOT NULL AND o.image_evidence_sha256 IS NOT NULL
      AND NEW.image_evidence_sha256=o.image_evidence_sha256
      AND NEW.original_sha256=r.original_sha256 AND NEW.original_sha256=o.original_sha256
      AND NEW.content_sha256=r.content_sha256 AND NEW.checked_at>=r.fetched_at) IS NOT TRUE THEN
      RAISE EXCEPTION 'independent image review binding unavailable';
    END IF;
    IF r.media_kind='PDF' AND (o.image_evidence->>'version'='source-pdf-v1'
      AND (SELECT count(*)::text FROM source_pdf_rasters_vnext WHERE revision_id=r.revision_id)
        =o.image_evidence->>'pageCount') IS NOT TRUE THEN
      RAISE EXCEPTION 'independent PDF review binding unavailable';
    END IF;
  ELSIF NEW.image_evidence_sha256 IS NOT NULL THEN
    RAISE EXCEPTION 'unapproved media review';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS source_image_review_insert ON source_review_attestations_vnext;
CREATE TRIGGER source_image_review_insert BEFORE INSERT ON source_review_attestations_vnext
  FOR EACH ROW EXECUTE FUNCTION guard_source_image_review();

-- Existing view column order/types and TEXT/IMAGE behavior are preserved.
-- Only opaque page asset IDs are appended: never PDF/PNG bytes or full OCR.
-- View-owner permissions read private proof, without granting raw access to its
-- readers. Current rights, latest-before-filter and historical asOf remain the
-- reader's responsibility; independent review never rewrites a source revision.
CREATE OR REPLACE VIEW source_effective_revisions_vnext AS
SELECT r.revision_id,r.source_id,r.supersedes,r.original_sha256,r.content_sha256,
  r.media_kind,r.source_class,r.permission_ref,r.provenance,
  CASE WHEN r.media_kind IN ('IMAGE','PDF') AND r.status IN ('ACTIVE','NEEDS_REVIEW')
    THEN CASE WHEN reviewed.valid AND media.bound THEN 'ACTIVE' ELSE 'NEEDS_REVIEW' END
    WHEN r.status='NEEDS_REVIEW' AND reviewed.valid THEN 'ACTIVE'
    ELSE r.status END AS status,
  r.change_kind,r.published_at,r.fetched_at,
  greatest(r.last_checked_at,h.last_checked_at,observed.last_checked_at) AS last_checked_at,
  CASE WHEN r.media_kind IN ('IMAGE','PDF') THEN
      CASE WHEN r.status IN ('ACTIVE','NEEDS_REVIEW') AND reviewed.valid AND media.bound
        THEN a.checked_at ELSE NULL END
    WHEN r.status='NEEDS_REVIEW' AND reviewed.valid THEN a.checked_at
    ELSE r.last_verified_at END AS last_verified_at,
  r.valid_from,r.valid_until,r.scope_campuses,r.scope_majors,r.scope_colleges,
  r.scope_major_roles,r.scope_admission_types,r.scope_enrollment_states,
  r.scope_graduation_terms,r.cohort_min,r.cohort_max,
  CASE WHEN r.media_kind='PDF' AND media.bound THEN pdf.assets ELSE NULL::text[] END AS pdf_page_assets
FROM source_revisions_vnext r
LEFT JOIN source_review_attestations_vnext a ON a.revision_id=r.revision_id
LEFT JOIN source_originals_vnext o ON o.revision_id=r.revision_id
LEFT JOIN source_ingest_heads h ON h.source_id=r.source_id AND h.revision_id=r.revision_id
LEFT JOIN LATERAL (
  SELECT max(checked_at) AS last_checked_at FROM source_check_observations
  WHERE revision_id=r.revision_id
) observed ON true
LEFT JOIN LATERAL (
  SELECT array_agg(p.asset_id ORDER BY p.page_index) AS assets,count(*) AS n,
    bool_and((p.page_index::text=o.image_evidence->'pages'->p.page_index->>'pageIndex'
      AND p.asset_id=o.image_evidence->'pages'->p.page_index->>'assetId'
      AND p.raster_sha256=o.image_evidence->'pages'->p.page_index->>'rasterSha256'
      AND p.width::text=o.image_evidence->'pages'->p.page_index->>'width'
      AND p.height::text=o.image_evidence->'pages'->p.page_index->>'height'
      AND octet_length(p.raster_bytes)::text=o.image_evidence->'pages'->p.page_index->>'rasterByteLength') IS TRUE) AS valid
  FROM source_pdf_rasters_vnext p WHERE p.revision_id=r.revision_id
) pdf ON r.media_kind='PDF'
CROSS JOIN LATERAL (SELECT o.image_evidence IS NOT NULL AND o.image_evidence_sha256 IS NOT NULL
  AND a.image_evidence_sha256=o.image_evidence_sha256
  AND (r.media_kind='IMAGE' OR (r.media_kind='PDF' AND o.image_evidence->>'version'='source-pdf-v1'
    AND pdf.valid IS TRUE AND pdf.n BETWEEN 1 AND 4
    AND pdf.n::text=o.image_evidence->>'pageCount'
    AND pdf.n=jsonb_array_length(CASE WHEN jsonb_typeof(o.image_evidence->'pages')='array'
      THEN o.image_evidence->'pages' ELSE '[]'::jsonb END))) AS bound) media
CROSS JOIN LATERAL (SELECT a.decision='APPROVED'
  AND a.original_sha256=r.original_sha256 AND a.content_sha256=r.content_sha256
  AND a.checked_at>=r.fetched_at AND r.change_kind IN ('NEW','CORRECTED','EXTENDED')
  AND r.provenance IN ('SYNTHETIC','REAL_APPROVED')
  AND r.source_class IN ('SYNTHETIC','LICENSED_EXTERNAL') AS valid) reviewed;

REVOKE ALL ON source_pdf_rasters_vnext,source_originals_vnext,
  source_review_attestations_vnext,source_effective_revisions_vnext FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_source_pdf_raster(),guard_source_image_revision(),
  guard_source_image_paragraph(),guard_source_image_original(),guard_source_image_review() FROM PUBLIC;
-- Deployment must separately review existing private role grants:
-- ingest INSERT/SELECT on page rasters, SELECT on revision/paragraph metadata and
-- SELECT(revision_id) on originals; review SELECT on retained originals/pages.
-- No raw-page access is granted to browser/API projection/evidence-reader roles.
-- A matching renderer hash is an identity binding, not proof that its runtime
-- libraries/fonts or the resulting PDF/page correspondence were approved.
-- The independent human reviewer must attest the exact original + canonical
-- bundle + retained raster/bbox correspondence through the trusted review port.
COMMIT;
