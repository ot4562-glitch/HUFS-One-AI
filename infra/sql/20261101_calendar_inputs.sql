-- Calendar #52 / scope-safe derived inputs #39. Apply only after the reviewed
-- 20261031_api_projections.sql and 20261031_temporal_evidence.sql migrations.
-- DRAFT: operator application/roles and real-data consent are separate gates.
BEGIN;
CREATE TABLE IF NOT EXISTS api_calendar_input_projections (
  actor_id text NOT NULL,
  subject_id char(3) NOT NULL CHECK(subject_id ~ '^S0[1-5]$'),
  dataset_version text NOT NULL,
  projection_version text NOT NULL,
  dataset_mode text NOT NULL CHECK(dataset_mode IN ('SYNTHETIC','REAL_CONSENTED','MIXED')),
  as_of timestamptz NOT NULL,
  -- Normalized approved profile/noticeStudent/provenance/opportunities/notices only.
  -- No source originals, raw transcripts, Forms exports, credentials or LLM text.
  input_json jsonb NOT NULL CHECK(jsonb_typeof(input_json)='object'
    AND octet_length(input_json::text)<=262144),
  source_ids text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK(cardinality(source_ids)<=100),
  consent_ref text NOT NULL CHECK(char_length(consent_ref)>0),
  approval_state text NOT NULL DEFAULT 'NEEDS_REVIEW'
    CHECK(approval_state IN ('APPROVED','NEEDS_REVIEW','REVOKED')),
  approved_by text NOT NULL CHECK(char_length(approved_by)>0 AND approved_by<>actor_id),
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at>approved_at),
  revoked_at timestamptz,
  current boolean NOT NULL DEFAULT false,
  CHECK(approval_state<>'APPROVED' OR approved_at<=as_of),
  PRIMARY KEY(actor_id,subject_id,dataset_version,projection_version),
  FOREIGN KEY(actor_id,subject_id) REFERENCES api_sharing_grants(actor_id,subject_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS api_calendar_one_current_projection
  ON api_calendar_input_projections(actor_id,subject_id) WHERE current=true;

CREATE TABLE IF NOT EXISTS api_calendar_source_permissions (
  actor_id text NOT NULL,
  subject_id char(3) NOT NULL CHECK(subject_id ~ '^S0[1-5]$'),
  source_id text NOT NULL REFERENCES source_ingest_heads(source_id),
  permission_ref text NOT NULL CHECK(char_length(permission_ref)>0),
  -- This table is authority for the DEMO_CALENDAR purpose only, never ingestion/AI/egress.
  purpose text NOT NULL DEFAULT 'DEMO_CALENDAR' CHECK(purpose='DEMO_CALENDAR'),
  policy_version text NOT NULL CHECK(char_length(policy_version)>0),
  approval_state text NOT NULL DEFAULT 'NEEDS_REVIEW'
    CHECK(approval_state IN ('APPROVED','NEEDS_REVIEW','REVOKED')),
  approved_by text NOT NULL CHECK(char_length(approved_by)>0 AND approved_by<>actor_id),
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at>approved_at),
  revoked_at timestamptz,
  PRIMARY KEY(actor_id,subject_id,source_id,permission_ref),
  FOREIGN KEY(actor_id,subject_id) REFERENCES api_sharing_grants(actor_id,subject_id)
);

-- Reviewed contents are immutable. To amend normalized inputs/provenance/source coverage,
-- create and approve a new projection_version; current/revoke may change immediately.
CREATE OR REPLACE FUNCTION api_calendar_protect_approved_inputs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (
    NEW.input_json IS DISTINCT FROM OLD.input_json OR NEW.source_ids IS DISTINCT FROM OLD.source_ids
    OR NEW.as_of IS DISTINCT FROM OLD.as_of OR NEW.dataset_mode IS DISTINCT FROM OLD.dataset_mode
    OR NEW.consent_ref IS DISTINCT FROM OLD.consent_ref
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.actor_id IS DISTINCT FROM OLD.actor_id OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
    OR NEW.dataset_version IS DISTINCT FROM OLD.dataset_version OR NEW.projection_version IS DISTINCT FROM OLD.projection_version
  ) THEN RAISE EXCEPTION 'approved calendar inputs require a new projection version'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION api_calendar_protect_approved_inputs() FROM PUBLIC;
DROP TRIGGER IF EXISTS api_calendar_approved_input_immutable ON api_calendar_input_projections;
CREATE TRIGGER api_calendar_approved_input_immutable BEFORE UPDATE ON api_calendar_input_projections
  FOR EACH ROW EXECUTE FUNCTION api_calendar_protect_approved_inputs();
REVOKE ALL ON TABLE api_calendar_input_projections FROM PUBLIC;
REVOKE ALL ON TABLE api_calendar_source_permissions FROM PUBLIC;
-- FOR SHARE needs UPDATE privilege in PostgreSQL. Keep locks in this constrained definer
-- function owned by the NOLOGIN migration owner; the runtime API keeps SELECT-only tables.
-- Bind the approved projection to current actor/subject/grant/consent and versions before
-- locking its source heads/rights. Locks last until the adapter's surrounding COMMIT.
CREATE OR REPLACE FUNCTION api_lock_authorized_calendar_inputs(
  p_actor text,p_subject char(3),p_grant text,p_dataset text,p_projection text,p_now timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_sources text[];
BEGIN
  SELECT p.source_ids INTO v_sources
  FROM public.api_sharing_grants g
  JOIN public.api_calendar_input_projections p ON p.actor_id=g.actor_id AND p.subject_id=g.subject_id
  JOIN public.api_demo_snapshot_projections s ON s.subject_id=p.subject_id
    AND s.dataset_version=p.dataset_version AND s.projection_version=p.projection_version
  WHERE g.actor_id=p_actor AND g.subject_id=p_subject AND g.version=p_grant
    AND g.revoked_at IS NULL AND g.allowed_sections @> ARRAY['FEED','NOTICES']::text[]
    AND g.approved_at<=LEAST(p_now,clock_timestamp()) AND g.expires_at>GREATEST(p_now,clock_timestamp())
    AND p.dataset_version=p_dataset AND p.projection_version=p_projection AND p.current=true
    AND p.approval_state='APPROVED' AND p.revoked_at IS NULL AND p.consent_ref=g.consent_ref
    AND p.approved_by<>p_actor AND p.approved_at<=LEAST(p.as_of,p_now,clock_timestamp())
    AND p.as_of<=LEAST(p_now,clock_timestamp()) AND p.expires_at>GREATEST(p_now,clock_timestamp())
    AND s.current=true AND length(s.approved_by)>0 AND s.approved_by<>p_actor AND s.approved_at<=p.as_of
    AND (s.snapshot_json->>'asOf')::timestamptz=p.as_of
  FOR SHARE OF g,p,s;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.source_ingest_heads WHERE source_id=ANY(v_sources) ORDER BY source_id FOR SHARE;
  PERFORM 1 FROM public.api_calendar_source_permissions
    WHERE actor_id=p_actor AND subject_id=p_subject AND source_id=ANY(v_sources)
    ORDER BY source_id,permission_ref FOR SHARE;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION api_lock_authorized_calendar_inputs(text,char,text,text,text,timestamptz) FROM PUBLIC;
-- Separate operator-owned approval writer and API SELECT-only roles are required.
-- After role review grant EXECUTE on api_lock_authorized_calendar_inputs only to the API role.
-- Source revision ingestion continues to lock source_ingest_heads before immutable inserts.
-- No public/browser writer or automatic import of existing CSV/Forms is authorized.
COMMIT;
