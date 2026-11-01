-- Owner workspace separate from shared demo overlay and REVIEWER sandbox.
-- Apply only after 20261101_self_account.sql with reviewed non-owner role.
BEGIN;
CREATE TABLE IF NOT EXISTS api_self_workspace_records (
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  kind text NOT NULL CHECK(kind IN ('EXPERIENCE','STUDY_PLAN','BOOKMARK','ACTION_PLAN')),
  item_id text NOT NULL CHECK(item_id ~ '^[A-Za-z0-9_-]{1,90}$'),
  version bigint NOT NULL CHECK(version>0),
  value_json jsonb NOT NULL CHECK(jsonb_typeof(value_json)='object'
    AND pg_column_size(value_json)<=8192
    AND value_json->>'kind'=kind
    AND value_json->>'dataMode' IN ('SYNTHETIC','OWNER_CONSENTED')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  PRIMARY KEY(actor_id,kind,item_id)
);
CREATE INDEX IF NOT EXISTS api_self_workspace_active
  ON api_self_workspace_records(actor_id,kind,item_id)
  WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS api_self_workspace_events (
  actor_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('EXPERIENCE','STUDY_PLAN','BOOKMARK','ACTION_PLAN')),
  item_id text NOT NULL,
  version bigint NOT NULL CHECK(version>0),
  action text NOT NULL CHECK(action IN ('CREATED','UPDATED','DELETED')),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,kind,item_id,version)
);
CREATE TRIGGER api_self_workspace_audit_immutable
  BEFORE UPDATE OR DELETE ON api_self_workspace_events
  FOR EACH ROW EXECUTE FUNCTION api_self_no_audit_mutation();
ALTER TABLE api_self_workspace_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_self_workspace_records FORCE ROW LEVEL SECURITY;
ALTER TABLE api_self_workspace_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_self_workspace_events FORCE ROW LEVEL SECURITY;
CREATE POLICY api_workspace_owner ON api_self_workspace_records
  FOR ALL USING(actor_id=current_setting('hufs.self_actor',true))
  WITH CHECK(actor_id=current_setting('hufs.self_actor',true));
CREATE POLICY api_workspace_audit_owner ON api_self_workspace_events
  FOR INSERT WITH CHECK(actor_id=current_setting('hufs.self_actor',true));
REVOKE ALL ON TABLE api_self_workspace_records,api_self_workspace_events FROM PUBLIC;
-- Dedicated self role: SELECT/INSERT/UPDATE/DELETE workspace records;
-- INSERT events, no read/update/delete events. DELETE only to honor withdrawal.
COMMIT;
