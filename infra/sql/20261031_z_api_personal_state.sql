-- HUFS One AI / TASK-27 / Agent 2.
-- Apply ONLY after 20261031_api_projections.sql, into an approved isolated DB.
-- NEVER auto-apply at service startup; never load raw CSV/Forms into this schema.
BEGIN;

CREATE TABLE IF NOT EXISTS api_personal_records (
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  subject_id char(3) NOT NULL CHECK(subject_id ~ '^S0[1-5]$'),
  kind text NOT NULL CHECK(kind IN (
    'EXPERIENCE','BOOKMARK','READ_RECEIPT','PREFERENCES',
    'COURSE_PLAN','APPLICATION_DRAFT')),
  item_id text NOT NULL CHECK(item_id ~ '^[A-Za-z0-9_-]{1,90}$'),
  value_json jsonb NOT NULL CHECK(
    jsonb_typeof(value_json)='object'
    AND octet_length(value_json::text)<=8192),
  data_mode text NOT NULL CHECK(data_mode IN ('SYNTHETIC','OWNER_CONSENTED')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  CONSTRAINT api_personal_payload_mode CHECK (
    deleted_at IS NOT NULL OR value_json->>'dataMode'=data_mode),
  PRIMARY KEY(actor_id,subject_id,kind,item_id),
  -- Sharing a demo subject never grants edit rights to its original owner.
  -- On revocation retain no publicly available projection or access path.
  FOREIGN KEY(actor_id,subject_id)
    REFERENCES api_sharing_grants(actor_id,subject_id)
);
CREATE INDEX IF NOT EXISTS api_personal_active_list
  ON api_personal_records(actor_id,subject_id,kind,item_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS api_personal_events (
  event_id uuid PRIMARY KEY,
  actor_id text NOT NULL,
  subject_id char(3) NOT NULL,
  kind text NOT NULL CHECK(kind IN (
    'EXPERIENCE','BOOKMARK','READ_RECEIPT','PREFERENCES',
    'COURSE_PLAN','APPLICATION_DRAFT')),
  item_id text NOT NULL,
  action text NOT NULL CHECK(action IN ('CREATED','UPDATED','DELETED')),
  version integer NOT NULL CHECK(version>0),
  event_at timestamptz NOT NULL,
  -- No original student records, raw value_json, or personal strings in audit.
  FOREIGN KEY(actor_id,subject_id,kind,item_id)
    REFERENCES api_personal_records(actor_id,subject_id,kind,item_id)
);
CREATE INDEX IF NOT EXISTS api_personal_events_history
  ON api_personal_events(actor_id,subject_id,kind,item_id,event_at DESC);

CREATE OR REPLACE FUNCTION api_deny_personal_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable personal state audit';
END;
$$;
REVOKE ALL ON FUNCTION api_deny_personal_audit_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS api_personal_audit_append_only ON api_personal_events;
CREATE TRIGGER api_personal_audit_append_only
  BEFORE UPDATE OR DELETE ON api_personal_events
  FOR EACH ROW EXECUTE FUNCTION api_deny_personal_audit_mutation();

REVOKE ALL ON TABLE api_personal_records FROM PUBLIC;
REVOKE ALL ON TABLE api_personal_events FROM PUBLIC;

-- Access boundary is enforced twice: SQL actor_id/subject_id predicates and
-- a freshly locked grant row (actor, subject, version, scope, expiry) within
-- each API transaction. Owner consent for real data is an independent gate.
-- The application must not connect as the table owner/superuser.
COMMIT;
