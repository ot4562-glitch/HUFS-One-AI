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
-- Separate operator-owned approval writer and API SELECT-only roles are required.
-- Source revision ingestion continues to lock source_ingest_heads before immutable inserts.
-- No public/browser writer or automatic import of existing CSV/Forms is authorized.
COMMIT;
