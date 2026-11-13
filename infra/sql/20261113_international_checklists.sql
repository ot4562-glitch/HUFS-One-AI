-- Add owner-only guide records to the existing consent/RLS/CAS/tombstone store.
-- Apply after self workspace and tombstone migrations. No guide/data is seeded.
BEGIN;
ALTER TABLE api_self_workspace_records DROP CONSTRAINT api_self_workspace_records_kind_check;
ALTER TABLE api_self_workspace_records ADD CONSTRAINT api_self_workspace_records_kind_check
  CHECK(kind IN ('EXPERIENCE','STUDY_PLAN','BOOKMARK','ACTION_PLAN','GUIDE_CHECKLIST'));
ALTER TABLE api_self_workspace_events DROP CONSTRAINT api_self_workspace_events_kind_check;
ALTER TABLE api_self_workspace_events ADD CONSTRAINT api_self_workspace_events_kind_check
  CHECK(kind IN ('EXPERIENCE','STUDY_PLAN','BOOKMARK','ACTION_PLAN','GUIDE_CHECKLIST'));
-- Existing owner RLS, personal-storage row locks, audit and withdrawal purges
-- cover all kinds. Do not grant public access or bypass the workspace authority.
COMMIT;
