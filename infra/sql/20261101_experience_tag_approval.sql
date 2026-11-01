-- Owner-local, explicitly selected topics. Apply AFTER self_account/workspace.
-- No AI invocation, publication, student imports or recommendation activation.
BEGIN;
CREATE TABLE IF NOT EXISTS api_experience_tag_approvals (
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  kind text NOT NULL DEFAULT 'EXPERIENCE' CHECK(kind='EXPERIENCE'),
  experience_id text NOT NULL CHECK(experience_id ~ '^[A-Za-z0-9_-]{1,90}$'),
  version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
  content_version bigint NOT NULL CHECK(content_version BETWEEN 1 AND 9007199254740991),
  consent_version bigint NOT NULL CHECK(consent_version BETWEEN 1 AND 9007199254740991),
  state text NOT NULL CHECK(state IN ('ACTIVE','REVOKED','INVALIDATED')),
  topics text[] NOT NULL CHECK(array_position(topics,NULL) IS NULL
    AND topics <@ ARRAY[
      'TRADE_OVERSEAS','GLOBAL_SALES','LANGUAGE_TRANSLATION','INTL_ORGANIZATION',
      'INTL_COOPERATION','DIPLOMACY_PUBLIC','FINANCE_INVESTMENT','ACCOUNTING_TAX',
      'ECONOMIC_RESEARCH','DATA_ANALYTICS','AI_ML','SOFTWARE_DEV',
      'CYBERSECURITY','CLOUD_INFRA','PRODUCT_UX','MARKETING_BRAND',
      'MEDIA_CONTENT','EDUCATION_TUTORING','HR_ORG','CONSULTING_STRATEGY',
      'STARTUP_ENTREPRENEUR','PUBLIC_POLICY','ESG_SUSTAINABILITY','CULTURE_TOURISM'
    ]::text[]
    AND ((state='ACTIVE' AND cardinality(topics) BETWEEN 1 AND 5)
      OR (state<>'ACTIVE' AND cardinality(topics)=0))),
  provenance text NOT NULL DEFAULT 'LOCAL_USER_SELECTION'
    CHECK(provenance='LOCAL_USER_SELECTION'),
  approved_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(actor_id,experience_id),
  FOREIGN KEY(actor_id,kind,experience_id)
    REFERENCES api_self_workspace_records(actor_id,kind,item_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS api_experience_tag_events (
  actor_id text NOT NULL,
  experience_id text NOT NULL,
  version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
  content_version bigint NOT NULL CHECK(content_version>0),
  consent_version bigint NOT NULL CHECK(consent_version>0),
  action text NOT NULL CHECK(action IN ('APPROVED','REVOKED','INVALIDATED')),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- A storage withdrawal purges private approvals. A later, newly consented
  -- record may restart its approval version; the prior metadata audit remains.
  PRIMARY KEY(actor_id,experience_id,consent_version,version)
);
CREATE TRIGGER api_experience_tag_audit_immutable
  BEFORE UPDATE OR DELETE ON api_experience_tag_events
  FOR EACH ROW EXECUTE FUNCTION api_self_no_audit_mutation();
ALTER TABLE api_experience_tag_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_experience_tag_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE api_experience_tag_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_experience_tag_events FORCE ROW LEVEL SECURITY;
CREATE POLICY api_experience_tag_owner ON api_experience_tag_approvals
  FOR ALL USING(actor_id=current_setting('hufs.self_actor',true))
  WITH CHECK(actor_id=current_setting('hufs.self_actor',true));
CREATE POLICY api_experience_tag_audit_owner ON api_experience_tag_events
  FOR INSERT WITH CHECK(actor_id=current_setting('hufs.self_actor',true));
REVOKE ALL ON TABLE api_experience_tag_approvals,api_experience_tag_events FROM PUBLIC;
-- Reviewed non-owner self API role: SELECT/INSERT/UPDATE/DELETE approvals,
-- INSERT events only. Existing self account/workspace mutations also require
-- this migration and these grants for same-transaction invalidation.
COMMIT;
