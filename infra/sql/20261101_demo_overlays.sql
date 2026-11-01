-- Private BETA demo overlays: immutable source profiles remain in separate tables.
-- Apply after review using a dedicated non-owner, non-BYPASSRLS application role.
BEGIN;
CREATE TABLE api_demo_overlays (
  actor_id text NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 200 AND actor_id !~ '[[:cntrl:]]'),
  session_id_hash text NOT NULL CHECK(length(session_id_hash) BETWEEN 1 AND 200 AND session_id_hash !~ '[[:cntrl:]]'),
  demo_run_id text NOT NULL CHECK(length(demo_run_id) BETWEEN 1 AND 200 AND demo_run_id !~ '[[:cntrl:]]'),
  demo_subject_id text NOT NULL CHECK(demo_subject_id IN ('S01','S02','S03','S04','S05')),
  dataset_version text NOT NULL CHECK(length(dataset_version) BETWEEN 1 AND 200 AND dataset_version !~ '[[:cntrl:]]'),
  projection_version text NOT NULL CHECK(length(projection_version) BETWEEN 1 AND 200 AND projection_version !~ '[[:cntrl:]]'),
  sharing_grant_version text NOT NULL CHECK(length(sharing_grant_version) BETWEEN 1 AND 200 AND sharing_grant_version !~ '[[:cntrl:]]'),
  version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740990),
  value_json jsonb NOT NULL CHECK(jsonb_typeof(value_json)='object'
    AND pg_column_size(value_json)<=32768
    AND value_json - ARRAY['interestTopics','desiredJobTopics','hiddenOpportunityIds']::text[]='{}'::jsonb
    AND CASE WHEN value_json ? 'interestTopics' THEN
      jsonb_typeof(value_json->'interestTopics')='array' AND jsonb_array_length(value_json->'interestTopics')<=5
      ELSE true END
    AND CASE WHEN value_json ? 'desiredJobTopics' THEN
      jsonb_typeof(value_json->'desiredJobTopics')='array' AND jsonb_array_length(value_json->'desiredJobTopics')<=3
      ELSE true END
    AND CASE WHEN value_json ? 'hiddenOpportunityIds' THEN
      jsonb_typeof(value_json->'hiddenOpportunityIds')='array' AND jsonb_array_length(value_json->'hiddenOpportunityIds')<=200
      ELSE true END),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id,session_id_hash,demo_run_id,demo_subject_id,
    dataset_version,projection_version,sharing_grant_version)
);
ALTER TABLE api_demo_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_demo_overlays FORCE ROW LEVEL SECURITY;
CREATE POLICY api_demo_overlay_actor ON api_demo_overlays
  FOR ALL USING(actor_id=current_setting('hufs.demo_actor',true))
  WITH CHECK(actor_id=current_setting('hufs.demo_actor',true));
REVOKE ALL ON TABLE api_demo_overlays FROM PUBLIC;
-- Dedicated runtime role: SELECT,INSERT,UPDATE only; no DELETE, source or real profile access.
-- Reset uses a new version with empty JSON; deleting would re-enable stale version-zero writes.
COMMIT;
