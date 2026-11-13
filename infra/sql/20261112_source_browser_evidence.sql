-- #445 private DOM snapshots. Apply after PDF evidence and verified source rights.
-- No source, permission, runtime image or human approval is seeded.
BEGIN;
ALTER TABLE source_originals_vnext ADD COLUMN IF NOT EXISTS browser_evidence jsonb;
ALTER TABLE source_originals_vnext ADD COLUMN IF NOT EXISTS browser_evidence_sha256 char(64);
ALTER TABLE source_originals_vnext ADD COLUMN IF NOT EXISTS browser_dom_bytes bytea;
ALTER TABLE source_review_attestations_vnext ADD COLUMN IF NOT EXISTS browser_evidence_sha256 char(64);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='source_originals_vnext'::regclass
    AND conname='source_browser_bundle_complete') THEN
    ALTER TABLE source_originals_vnext ADD CONSTRAINT source_browser_bundle_complete CHECK (
      (browser_evidence IS NULL AND browser_evidence_sha256 IS NULL AND browser_dom_bytes IS NULL)
      OR (browser_evidence IS NOT NULL AND browser_evidence_sha256 ~ '^[a-f0-9]{64}$'
        AND browser_dom_bytes IS NOT NULL AND octet_length(browser_dom_bytes) BETWEEN 1 AND 262144
        AND jsonb_typeof(browser_evidence)='object'
        AND octet_length(browser_evidence::text)<=500000
        AND browser_evidence->>'version'='source-browser-v1'
        AND browser_evidence->>'reviewState'='NEEDS_REVIEW'
        AND browser_evidence->>'domSha256'=encode(sha256(browser_dom_bytes),'hex')
        AND browser_evidence->>'domByteLength'=octet_length(browser_dom_bytes)::text
        AND jsonb_typeof(browser_evidence->'resources')='array'
        AND jsonb_array_length(browser_evidence->'resources')<=16) IS TRUE);
  END IF;
END $$;

-- Resource dependencies use retained immutable originals and the exact current
-- rights receipt. This helper is private to the root-owned trigger; the view
-- below uses the same predicate inline, without granting an oracle to readers.
CREATE OR REPLACE FUNCTION source_browser_resources_valid(b jsonb) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
  SELECT jsonb_typeof(b->'resources')='array' AND jsonb_array_length(b->'resources')<=16
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b->'resources')='array'
        THEN b->'resources' ELSE '[]'::jsonb END) resource
      LEFT JOIN source_revisions_vnext rr ON rr.revision_id=resource->>'revisionId'
      LEFT JOIN source_originals_vnext ro ON ro.revision_id=rr.revision_id
      LEFT JOIN source_ingest_heads rh ON rh.source_id=rr.source_id
      LEFT JOIN source_rights_receipts rp ON rp.receipt_id=resource->>'rightsReceiptId'
      LEFT JOIN source_rights_revocations rv ON rv.receipt_id=rp.receipt_id
      WHERE (rr.source_id=resource->>'sourceId' AND rr.permission_ref=resource->>'permissionRef'
        AND rr.original_sha256=resource->>'originalSha256'
        AND ro.original_sha256=rr.original_sha256
        AND encode(sha256(ro.original_bytes),'hex')=rr.original_sha256
        AND octet_length(ro.original_bytes)::text=resource->>'byteLength'
        AND rh.revision_id=rr.revision_id AND rr.status IN ('ACTIVE','NEEDS_REVIEW')
        AND rr.change_kind IN ('NEW','CORRECTED','EXTENDED')
        AND rr.fetched_at<=(b->>'capturedAt')::timestamptz
        AND rp.source_id=rr.source_id AND rp.permission_ref=rr.permission_ref
        AND rp.canonical_url=resource->>'canonicalUrl'
        AND rp.purposes @> ARRAY['COLLECT','STORE','SEARCH']::text[]
        AND rp.reviewed_at<=clock_timestamp() AND rp.starts_at<=clock_timestamp()
        AND rp.expires_at>clock_timestamp() AND rv.receipt_id IS NULL
        AND rp.receipt_id=(SELECT latest.receipt_id FROM source_rights_receipts latest
          WHERE latest.actor_id=rp.actor_id AND latest.source_id=rp.source_id AND latest.permission_ref=rp.permission_ref
          ORDER BY latest.reviewed_at DESC,latest.receipt_id DESC LIMIT 1)) IS NOT TRUE);
$$;
REVOKE ALL ON FUNCTION source_browser_resources_valid(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION guard_source_browser_original() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r source_revisions_vnext%ROWTYPE; b jsonb := NEW.browser_evidence;
BEGIN
  IF b IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO STRICT r FROM source_revisions_vnext WHERE revision_id=NEW.revision_id;
  IF (r.media_kind='HTML' AND r.status='NEEDS_REVIEW' AND r.last_verified_at IS NULL
    AND b->>'sourceId'=r.source_id AND b->>'sourceRevisionId'=r.revision_id
    AND b->>'permissionRef'=r.permission_ref AND b->>'originalSha256'=r.original_sha256
    AND b->>'originalByteLength'=octet_length(NEW.original_bytes)::text
    AND b->>'paragraphsSha256'=r.content_sha256
    AND encode(sha256(NEW.original_bytes),'hex')=r.original_sha256
    AND (b->>'capturedAt')::timestamptz<=r.fetched_at
    AND source_browser_resources_valid(b)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Source browser evidence requires independent review';
  END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION guard_source_browser_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE o source_originals_vnext%ROWTYPE;
BEGIN
  SELECT * INTO STRICT o FROM source_originals_vnext WHERE revision_id=NEW.revision_id;
  IF o.browser_evidence IS NOT NULL THEN
    IF (NEW.browser_evidence_sha256=o.browser_evidence_sha256
      AND source_browser_resources_valid(o.browser_evidence)) IS NOT TRUE THEN
      RAISE EXCEPTION 'Source browser review bundle changed';
    END IF;
  ELSIF NEW.browser_evidence_sha256 IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected source browser review';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION guard_source_browser_original(),guard_source_browser_review() FROM PUBLIC;
DROP TRIGGER IF EXISTS source_browser_original_insert ON source_originals_vnext;
CREATE TRIGGER source_browser_original_insert BEFORE INSERT ON source_originals_vnext
  FOR EACH ROW EXECUTE FUNCTION guard_source_browser_original();
DROP TRIGGER IF EXISTS source_browser_review_insert ON source_review_attestations_vnext;
CREATE TRIGGER source_browser_review_insert BEFORE INSERT ON source_review_attestations_vnext
  FOR EACH ROW EXECUTE FUNCTION guard_source_browser_review();

-- Preserve every existing view column, image/PDF rule and temporal boundary.
CREATE OR REPLACE VIEW source_effective_revisions_vnext AS
SELECT r.revision_id,r.source_id,r.supersedes,r.original_sha256,r.content_sha256,
  r.media_kind,r.source_class,r.permission_ref,r.provenance,
  CASE WHEN o.browser_evidence IS NOT NULL AND r.status IN ('ACTIVE','NEEDS_REVIEW')
    THEN CASE WHEN reviewed.valid AND browser.bound THEN 'ACTIVE' ELSE 'NEEDS_REVIEW' END
    WHEN r.media_kind IN ('IMAGE','PDF') AND r.status IN ('ACTIVE','NEEDS_REVIEW')
    THEN CASE WHEN reviewed.valid AND media.bound THEN 'ACTIVE' ELSE 'NEEDS_REVIEW' END
    WHEN r.status='NEEDS_REVIEW' AND reviewed.valid THEN 'ACTIVE'
    ELSE r.status END AS status,
  r.change_kind,r.published_at,r.fetched_at,
  greatest(r.last_checked_at,h.last_checked_at,observed.last_checked_at) AS last_checked_at,
  CASE WHEN o.browser_evidence IS NOT NULL THEN
      CASE WHEN r.status IN ('ACTIVE','NEEDS_REVIEW') AND reviewed.valid AND browser.bound
        THEN a.checked_at ELSE NULL END
    WHEN r.media_kind IN ('IMAGE','PDF') THEN
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
CROSS JOIN LATERAL (SELECT o.browser_evidence IS NOT NULL
  AND o.browser_evidence_sha256=a.browser_evidence_sha256
  AND o.browser_evidence->>'domSha256'=encode(sha256(o.browser_dom_bytes),'hex')
  AND o.browser_evidence->>'paragraphsSha256'=r.content_sha256
  AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.browser_evidence->'resources')='array'
        THEN o.browser_evidence->'resources' ELSE '[]'::jsonb END) resource
      LEFT JOIN source_revisions_vnext rr ON rr.revision_id=resource->>'revisionId'
      LEFT JOIN source_originals_vnext ro ON ro.revision_id=rr.revision_id
      LEFT JOIN source_ingest_heads rh ON rh.source_id=rr.source_id
      LEFT JOIN source_rights_receipts rp ON rp.receipt_id=resource->>'rightsReceiptId'
      LEFT JOIN source_rights_revocations rv ON rv.receipt_id=rp.receipt_id
      WHERE (rr.source_id=resource->>'sourceId' AND rr.permission_ref=resource->>'permissionRef'
        AND rr.original_sha256=resource->>'originalSha256'
        AND ro.original_sha256=rr.original_sha256
        AND encode(sha256(ro.original_bytes),'hex')=rr.original_sha256
        AND octet_length(ro.original_bytes)::text=resource->>'byteLength'
        AND rh.revision_id=rr.revision_id AND rr.status IN ('ACTIVE','NEEDS_REVIEW')
        AND rr.change_kind IN ('NEW','CORRECTED','EXTENDED')
        AND rr.fetched_at<=(o.browser_evidence->>'capturedAt')::timestamptz
        AND rp.source_id=rr.source_id AND rp.permission_ref=rr.permission_ref
        AND rp.canonical_url=resource->>'canonicalUrl'
        AND rp.purposes @> ARRAY['COLLECT','STORE','SEARCH']::text[]
        AND rp.reviewed_at<=clock_timestamp() AND rp.starts_at<=clock_timestamp()
        AND rp.expires_at>clock_timestamp() AND rv.receipt_id IS NULL
        AND rp.receipt_id=(SELECT latest.receipt_id FROM source_rights_receipts latest
          WHERE latest.actor_id=rp.actor_id AND latest.source_id=rp.source_id AND latest.permission_ref=rp.permission_ref
          ORDER BY latest.reviewed_at DESC,latest.receipt_id DESC LIMIT 1)) IS NOT TRUE) AS bound) browser
CROSS JOIN LATERAL (SELECT a.decision='APPROVED'
  AND a.original_sha256=r.original_sha256 AND a.content_sha256=r.content_sha256
  AND a.checked_at>=r.fetched_at AND r.change_kind IN ('NEW','CORRECTED','EXTENDED')
  AND r.provenance IN ('SYNTHETIC','REAL_APPROVED')
  AND r.source_class IN ('SYNTHETIC','LICENSED_EXTERNAL') AS valid) reviewed;

REVOKE ALL ON source_originals_vnext,source_review_attestations_vnext,source_effective_revisions_vnext FROM PUBLIC;
-- Private head readers need only these two fields, never original/DOM bytes.
-- Explicitly grant this view to the private ingestion head-reader role.
CREATE OR REPLACE VIEW source_browser_revision_metadata_vnext AS
  SELECT revision_id,browser_evidence->>'renderingSha256' AS rendering_sha256
  FROM source_originals_vnext WHERE browser_evidence IS NOT NULL;
REVOKE ALL ON source_browser_revision_metadata_vnext FROM PUBLIC;
COMMIT;
