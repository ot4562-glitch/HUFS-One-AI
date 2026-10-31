-- HUFS One AI TASK-27: privacy-scoped PostgreSQL API projections.
-- DRAFT ONLY. No migration applied or real student data imported.
-- This schema stores approved display-only projections and grants, never raw
-- Google Forms responses, academic CSV rows, ID aliases or original files.
BEGIN;

CREATE TABLE IF NOT EXISTS api_demo_profile_projections (
  subject_id char(3) NOT NULL CHECK(subject_id ~ '^S0[1-5]$'),
  profile_version text NOT NULL,
  profile_json jsonb NOT NULL CHECK (
    jsonb_typeof(profile_json)='object'
    AND octet_length(profile_json::text)<=65536),
  reviewed_at timestamptz NOT NULL,
  current boolean NOT NULL DEFAULT false,
  PRIMARY KEY(subject_id,profile_version)
);
CREATE UNIQUE INDEX IF NOT EXISTS api_profile_one_current_per_subject
  ON api_demo_profile_projections(subject_id) WHERE current=true;

CREATE TABLE IF NOT EXISTS api_demo_snapshot_projections (
  subject_id char(3) NOT NULL CHECK(subject_id ~ '^S0[1-5]$'),
  projection_version text NOT NULL,
  dataset_version text NOT NULL,
  snapshot_json jsonb NOT NULL CHECK (
    jsonb_typeof(snapshot_json)='object'
    AND octet_length(snapshot_json::text)<=65536),
  approved_at timestamptz NOT NULL,
  approved_by text NOT NULL,
  current boolean NOT NULL DEFAULT false,
  PRIMARY KEY(subject_id,projection_version,dataset_version)
);
CREATE UNIQUE INDEX IF NOT EXISTS api_snapshot_one_current_per_subject
  ON api_demo_snapshot_projections(subject_id) WHERE current=true;

CREATE TABLE IF NOT EXISTS api_sharing_grants (
  grant_id text PRIMARY KEY,
  actor_id text NOT NULL, -- independently verified Google OIDC subject
  subject_id char(3) NOT NULL CHECK(subject_id ~ '^S0[1-5]$'),
  allowed_sections text[] NOT NULL DEFAULT ARRAY[]::text[]
    CHECK(allowed_sections <@ ARRAY[
      'FEED','NOTICES','EXPERIENCE','ACADEMICS','FORECAST'
    ]::text[]),
  display_name_allowed boolean NOT NULL DEFAULT false,
  recording_allowed boolean NOT NULL DEFAULT false,
  version text NOT NULL,
  consent_ref text NOT NULL, -- private, purpose-specific section consent
  display_name_consent_ref text,
  recording_consent_ref text,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT grant_period_check CHECK(
    approved_at<expires_at
    AND (revoked_at IS NULL OR revoked_at>=approved_at)),
  CONSTRAINT grant_purpose_consent CHECK(
    (NOT display_name_allowed OR display_name_consent_ref IS NOT NULL)
    AND (NOT recording_allowed OR recording_consent_ref IS NOT NULL)),
  UNIQUE(actor_id,subject_id)
);
CREATE INDEX IF NOT EXISTS api_grant_expiry
  ON api_sharing_grants(actor_id,expires_at)
  WHERE revoked_at IS NULL;

-- Immutable audit records: issuing/revoking a grant is a single transaction
-- that also appends its review trail, never a silent mutable privilege change.
CREATE TABLE IF NOT EXISTS api_grant_events (
  event_id uuid PRIMARY KEY,
  grant_id text NOT NULL REFERENCES api_sharing_grants(grant_id),
  actor_id text NOT NULL,
  subject_id char(3) NOT NULL,
  action text NOT NULL CHECK(action IN (
    'ISSUED','OWNER_REVOKED','OPERATOR_REVOKED')),
  previous_version text,
  next_version text NOT NULL,
  operator_id text NOT NULL,
  consent_ref text,
  event_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS api_grant_events_actor
  ON api_grant_events(actor_id,subject_id,event_at DESC);
CREATE OR REPLACE FUNCTION api_deny_grant_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $
BEGIN
  RAISE EXCEPTION 'immutable grant audit';
END;
$;
REVOKE ALL ON FUNCTION api_deny_grant_audit_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS api_grant_audit_append_only ON api_grant_events;
CREATE TRIGGER api_grant_audit_append_only
  BEFORE UPDATE OR DELETE ON api_grant_events
  FOR EACH ROW EXECUTE FUNCTION api_deny_grant_audit_mutation();

CREATE TABLE IF NOT EXISTS api_approved_safe_packets (
  actor_id text NOT NULL,
  task text NOT NULL CHECK(task IN (
    'experience_skills','opportunity_terms',
    'personal_action_brief','graduation_explanation')),
  packet_ref text NOT NULL,
  packet_json jsonb NOT NULL CHECK(
    jsonb_typeof(packet_json)='object'
    AND octet_length(packet_json::text)<=65536),
  input_class text NOT NULL CHECK(input_class='SYNTHETIC_CLEARED'),
  approval_state text NOT NULL CHECK(approval_state IN (
    'APPROVED','NEEDS_REVIEW','REVOKED')),
  approved_at timestamptz NOT NULL,
  approved_by text NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at>approved_at),
  revoked_at timestamptz,
  PRIMARY KEY(actor_id,task,packet_ref)
);
CREATE INDEX IF NOT EXISTS api_packet_current
  ON api_approved_safe_packets(actor_id,task,expires_at)
  WHERE revoked_at IS NULL AND approval_state='APPROVED';

REVOKE ALL ON TABLE api_demo_profile_projections FROM PUBLIC;
REVOKE ALL ON TABLE api_demo_snapshot_projections FROM PUBLIC;
REVOKE ALL ON TABLE api_sharing_grants FROM PUBLIC;
REVOKE ALL ON TABLE api_grant_events FROM PUBLIC;
REVOKE ALL ON TABLE api_approved_safe_packets FROM PUBLIC;

-- IMPORTANT: use separate NOLOGIN owner, admin writer and API read-only
-- database roles. Grant the API role SELECT only on these four tables after
-- operator approval and actual TLS/role verification; never grant raw tables.
-- APP writer must be a reviewed offline/admin-only process. No student/browser
-- SQL or direct PostgREST/RLS-bypassing public role may mutate these grants.
-- Revocation changes grant version and revoked_at in one transaction.
-- Cache/projection version changes must be checked again on every API access.
COMMIT;
