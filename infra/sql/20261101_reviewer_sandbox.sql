-- REVIEWER-only synthetic interaction history, distinct from student records.
-- This migration is review-only; no cloud/production DB is touched by import.
BEGIN;
CREATE TABLE IF NOT EXISTS reviewer_sandbox_state (
  invite_id text NOT NULL,
  actor_id text NOT NULL,
  subject_id text NOT NULL CHECK(subject_id IN ('S01','S02','S03','S04','S05')),
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(invite_id,actor_id,subject_id),
  FOREIGN KEY(invite_id,actor_id)
    REFERENCES reviewer_enrollments(invite_id,actor_id) ON DELETE CASCADE,
  CONSTRAINT sandbox_actions_array CHECK (
    jsonb_typeof(actions)='array' AND jsonb_array_length(actions)<=200
    AND pg_column_size(actions)<=65536)
);
REVOKE ALL ON TABLE reviewer_sandbox_state FROM PUBLIC;
ALTER TABLE reviewer_sandbox_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviewer_sandbox_state FORCE ROW LEVEL SECURITY;
CREATE POLICY reviewer_sandbox_exact_scope ON reviewer_sandbox_state
  FOR ALL USING (
    invite_id=current_setting('hufs.reviewer_invite',true)
    AND actor_id=current_setting('hufs.reviewer_actor',true)
    AND subject_id=current_setting('hufs.reviewer_subject',true))
  WITH CHECK (
    invite_id=current_setting('hufs.reviewer_invite',true)
    AND actor_id=current_setting('hufs.reviewer_actor',true)
    AND subject_id=current_setting('hufs.reviewer_subject',true));
-- Least-privileged caller can ask for authorization but cannot browse identities
-- or invitation digests. The row lock serializes reads/writes with revoke.
CREATE OR REPLACE FUNCTION reviewer_sandbox_allowed(p_invite text,p_actor text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $
  SELECT EXISTS(SELECT 1 FROM reviewer_invitations i
    JOIN reviewer_enrollments e ON e.invite_id=i.id
    WHERE i.id=p_invite AND e.actor_id=p_actor AND i.revoked_at IS NULL
      AND i.starts_at<=clock_timestamp() AND i.ends_at>clock_timestamp()
    FOR UPDATE OF i);
$;
REVOKE ALL ON FUNCTION reviewer_sandbox_allowed(text,text) FROM PUBLIC;
-- Dedicated trusted API role gets function EXECUTE and table SELECT/INSERT/UPDATE
-- after security review; it does NOT get reviewer identity/invitation tables.
-- Never grant to anonymous/public browser/database connections.
COMMIT;
