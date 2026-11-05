-- #123 synthetic-only publication. Schema only: no live grants, subjects or approvals.
-- Apply with a migration owner. Runtime login must be NOSUPERUSER NOBYPASSRLS,
-- not the table owner, with only the grants listed at the end of this file.
CREATE TABLE synthetic_club_grants (
  actor_id text NOT NULL CHECK (actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  source_ref text NOT NULL CHECK (source_ref ~ '^SYNTHETIC_[A-Z0-9_]{1,110}$'),
  role text NOT NULL CHECK (role IN ('BETA','ADMIN')),
  profile_json jsonb,
  lock_version integer NOT NULL DEFAULT 0 CHECK(lock_version=0),
  grant_version bigint NOT NULL DEFAULT 1 CHECK(grant_version BETWEEN 1 AND 9007199254740991),
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY(actor_id,source_ref), CHECK(ends_at>starts_at),
  CHECK((role='BETA' AND jsonb_typeof(profile_json)='object') OR (role='ADMIN' AND profile_json IS NULL))
);
CREATE TABLE synthetic_club_catalog (
  source_ref text PRIMARY KEY CHECK (source_ref ~ '^SYNTHETIC_[A-Z0-9_]{1,110}$'),
  revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740990),
  as_of timestamptz NOT NULL
);
CREATE TABLE synthetic_club_posts (
  source_ref text NOT NULL REFERENCES synthetic_club_catalog(source_ref),
  club_id text NOT NULL CHECK(club_id ~ '^SYN-CLUB-[0-9]{3}$'),
  version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
  record_json jsonb NOT NULL CHECK(jsonb_typeof(record_json)='object' AND octet_length(record_json::text)<=20000),
  PRIMARY KEY(source_ref,club_id),
  CHECK((record_json->>'version')::bigint=version),
  CHECK(record_json->>'sourceRef'=source_ref),
  CHECK(record_json#>>'{post,id}'=club_id),
  CHECK(record_json#>>'{post,dataMode}'='SYNTHETIC'),
  CHECK(record_json#>>'{post,clubName}' LIKE '가상동아리 %'),
  CHECK(record_json#>>'{post,posterAssetId}' ~ '^SYN-POSTER-CLUB-[0-9]{3}$'),
  CHECK(record_json#>>'{lastActor,role}'='ADMIN')
);
CREATE TABLE synthetic_club_audit (
  source_ref text NOT NULL,club_id text NOT NULL,version bigint NOT NULL,
  action text NOT NULL CHECK(action IN ('CREATE','EDIT','APPROVE','REJECT','REVOKE')),
  actor_id text NOT NULL,actor_role text NOT NULL CHECK(actor_role='ADMIN'),
  as_of timestamptz NOT NULL,recorded_at timestamptz NOT NULL,
  PRIMARY KEY(source_ref,club_id,version),
  FOREIGN KEY(source_ref,club_id) REFERENCES synthetic_club_posts(source_ref,club_id)
);
CREATE TABLE synthetic_club_read_receipts (
  token_digest text PRIMARY KEY CHECK(token_digest ~ '^[0-9a-f]{64}$'),
  actor_id text NOT NULL,source_ref text NOT NULL,
  revision bigint NOT NULL CHECK(revision>=0),as_of timestamptz NOT NULL,expires_at timestamptz NOT NULL,
  profile_digest text NOT NULL CHECK(profile_digest ~ '^[0-9a-f]{64}$'),
  grant_version bigint NOT NULL CHECK(grant_version>=1),
  FOREIGN KEY(actor_id,source_ref) REFERENCES synthetic_club_grants(actor_id,source_ref)
);
CREATE FUNCTION synthetic_club_grant_version() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.actor_id<>OLD.actor_id OR NEW.source_ref<>OLD.source_ref THEN
    RAISE EXCEPTION 'Synthetic grant identity is immutable' USING ERRCODE='23514';
  END IF;
  NEW.grant_version:=CASE WHEN
    ROW(NEW.role,NEW.profile_json,NEW.starts_at,NEW.ends_at,NEW.revoked_at)
    IS DISTINCT FROM ROW(OLD.role,OLD.profile_json,OLD.starts_at,OLD.ends_at,OLD.revoked_at)
    THEN OLD.grant_version+1 ELSE OLD.grant_version END;
  RETURN NEW;
END $$;
CREATE TRIGGER synthetic_club_grant_revision BEFORE UPDATE ON synthetic_club_grants
  FOR EACH ROW EXECUTE FUNCTION synthetic_club_grant_version();
CREATE INDEX synthetic_club_receipt_expiry ON synthetic_club_read_receipts(actor_id,source_ref,expires_at);

ALTER TABLE synthetic_club_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_club_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE synthetic_club_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_club_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE synthetic_club_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_club_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE synthetic_club_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_club_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE synthetic_club_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE synthetic_club_read_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY synthetic_club_own_grant ON synthetic_club_grants FOR SELECT USING (
  actor_id=current_setting('hufs.club_actor',true)
  AND source_ref=current_setting('hufs.club_source',true)
  AND role=current_setting('hufs.club_role',true)
);
-- A harmless, fixed column provides the UPDATE privilege PostgreSQL requires
-- for SELECT FOR SHARE. Runtime cannot change role/profile/expiry or grant rows.
CREATE POLICY synthetic_club_grant_lock ON synthetic_club_grants FOR UPDATE USING (
  actor_id=current_setting('hufs.club_actor',true)
  AND source_ref=current_setting('hufs.club_source',true)
  AND role=current_setting('hufs.club_role',true)
) WITH CHECK (lock_version=0);
CREATE FUNCTION synthetic_club_active(required_role text DEFAULT NULL) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM synthetic_club_grants
    WHERE actor_id=current_setting('hufs.club_actor',true)
      AND source_ref=current_setting('hufs.club_source',true)
      AND role=current_setting('hufs.club_role',true)
      AND (required_role IS NULL OR role=required_role)
      AND revoked_at IS NULL AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp())
$$;
CREATE POLICY synthetic_club_catalog_read ON synthetic_club_catalog FOR SELECT USING (
  source_ref=current_setting('hufs.club_source',true) AND synthetic_club_active());
CREATE POLICY synthetic_club_catalog_revision ON synthetic_club_catalog FOR UPDATE USING (
  source_ref=current_setting('hufs.club_source',true) AND synthetic_club_active('ADMIN'))
  WITH CHECK(source_ref=current_setting('hufs.club_source',true) AND synthetic_club_active('ADMIN'));
CREATE POLICY synthetic_club_posts_read ON synthetic_club_posts FOR SELECT USING (
  source_ref=current_setting('hufs.club_source',true) AND synthetic_club_active()
  AND (current_setting('hufs.club_role',true)='ADMIN' OR (
    record_json#>>'{post,state}'='APPROVED'
    AND EXISTS(SELECT 1 FROM synthetic_club_catalog c WHERE c.source_ref=synthetic_club_posts.source_ref
      AND (record_json#>>'{post,createdAt}')::timestamptz<=(record_json#>>'{post,updatedAt}')::timestamptz
      AND (record_json#>>'{post,updatedAt}')::timestamptz<=(record_json#>>'{post,approvedAt}')::timestamptz
      AND (record_json#>>'{post,approvedAt}')::timestamptz<=c.as_of)
  )));
CREATE POLICY synthetic_club_posts_insert ON synthetic_club_posts FOR INSERT WITH CHECK(
  source_ref=current_setting('hufs.club_source',true) AND synthetic_club_active('ADMIN')
  AND record_json#>>'{lastActor,actorId}'=current_setting('hufs.club_actor',true));
CREATE POLICY synthetic_club_posts_update ON synthetic_club_posts FOR UPDATE USING(
  source_ref=current_setting('hufs.club_source',true) AND synthetic_club_active('ADMIN'))
  WITH CHECK(source_ref=current_setting('hufs.club_source',true) AND synthetic_club_active('ADMIN')
    AND record_json#>>'{lastActor,actorId}'=current_setting('hufs.club_actor',true));
CREATE POLICY synthetic_club_audit_read ON synthetic_club_audit FOR SELECT USING(
  source_ref=current_setting('hufs.club_source',true) AND synthetic_club_active('ADMIN'));
CREATE POLICY synthetic_club_audit_insert ON synthetic_club_audit FOR INSERT WITH CHECK(
  source_ref=current_setting('hufs.club_source',true) AND synthetic_club_active('ADMIN')
  AND actor_id=current_setting('hufs.club_actor',true));
CREATE POLICY synthetic_club_receipt_read ON synthetic_club_read_receipts FOR SELECT USING(
  actor_id=current_setting('hufs.club_actor',true) AND source_ref=current_setting('hufs.club_source',true)
  AND synthetic_club_active('BETA'));
CREATE POLICY synthetic_club_receipt_insert ON synthetic_club_read_receipts FOR INSERT WITH CHECK(
  actor_id=current_setting('hufs.club_actor',true) AND source_ref=current_setting('hufs.club_source',true)
  AND synthetic_club_active('BETA') AND expires_at>clock_timestamp()
  AND expires_at<=clock_timestamp()+interval '31 seconds'
  AND EXISTS(SELECT 1 FROM synthetic_club_catalog c WHERE c.source_ref=synthetic_club_read_receipts.source_ref
    AND c.revision=synthetic_club_read_receipts.revision AND c.as_of=synthetic_club_read_receipts.as_of)
  AND EXISTS(SELECT 1 FROM synthetic_club_grants g WHERE g.actor_id=synthetic_club_read_receipts.actor_id
    AND g.source_ref=synthetic_club_read_receipts.source_ref AND g.grant_version=synthetic_club_read_receipts.grant_version));
CREATE POLICY synthetic_club_receipt_delete ON synthetic_club_read_receipts FOR DELETE USING(
  actor_id=current_setting('hufs.club_actor',true) AND source_ref=current_setting('hufs.club_source',true)
  AND synthetic_club_active('BETA'));

-- A content edit always removes approval, including edits at the same catalog
-- time. Approval decisions may not change content. Audit rows contain metadata.
CREATE FUNCTION synthetic_club_validate_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_as_of timestamptz; v_post jsonb; v_old jsonb; v_action text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Synthetic publication deletion denied' USING ERRCODE='42501'; END IF;
  IF synthetic_club_active('ADMIN') IS NOT TRUE THEN
    RAISE EXCEPTION 'Synthetic publication denied' USING ERRCODE='42501';
  END IF;
  SELECT as_of INTO STRICT v_as_of FROM synthetic_club_catalog WHERE source_ref=NEW.source_ref FOR UPDATE;
  v_post:=NEW.record_json->'post';
  IF ((NEW.record_json->>'asOf')::timestamptz=v_as_of
    AND NEW.record_json#>>'{lastActor,actorId}'=current_setting('hufs.club_actor',true)
    AND (NEW.record_json->>'recordedAt')::timestamptz<=clock_timestamp()
    AND (NEW.record_json->>'recordedAt')::timestamptz>=clock_timestamp()-interval '10 seconds'
    AND (v_post->>'createdAt')::timestamptz<=(v_post->>'updatedAt')::timestamptz
    AND (v_post->>'updatedAt')::timestamptz<=v_as_of) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid synthetic publication metadata' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF (NEW.version=1 AND v_post->>'state'='REVIEW_PENDING' AND NOT(v_post?'approvedAt')
      AND (v_post->>'createdAt')::timestamptz=v_as_of AND (v_post->>'updatedAt')::timestamptz=v_as_of) IS NOT TRUE THEN
      RAISE EXCEPTION 'New synthetic publication must await review' USING ERRCODE='23514';
    END IF;
    IF (SELECT count(*) FROM synthetic_club_posts WHERE source_ref=NEW.source_ref)>=100 THEN
      RAISE EXCEPTION 'Synthetic publication quota' USING ERRCODE='23514';
    END IF;
    v_action:='CREATE';
  ELSE
    v_old:=OLD.record_json->'post';
    IF NEW.source_ref<>OLD.source_ref OR NEW.club_id<>OLD.club_id OR NEW.version<>OLD.version+1
      OR v_post->>'createdAt' IS DISTINCT FROM v_old->>'createdAt' THEN
      RAISE EXCEPTION 'Synthetic publication revision conflict' USING ERRCODE='40001';
    END IF;
    IF v_post->>'state'='REVIEW_PENDING' THEN
      IF v_post?'approvedAt' OR (v_post->>'updatedAt')::timestamptz<>v_as_of
        OR (v_post->>'updatedAt')::timestamptz<(v_old->>'updatedAt')::timestamptz THEN
        RAISE EXCEPTION 'Edited synthetic content must await review' USING ERRCODE='23514';
      END IF;
      v_action:='EDIT';
    ELSE
      IF (v_post-ARRAY['state','approvedAt']) IS DISTINCT FROM (v_old-ARRAY['state','approvedAt']) THEN
        RAISE EXCEPTION 'Decision changed synthetic content' USING ERRCODE='23514';
      END IF;
      IF v_post->>'state'='APPROVED' AND v_old->>'state'='REVIEW_PENDING'
        AND (v_post->>'approvedAt')::timestamptz=v_as_of THEN v_action:='APPROVE';
      ELSIF v_post->>'state'='REJECTED' AND v_old->>'state'='REVIEW_PENDING' AND NOT(v_post?'approvedAt') THEN v_action:='REJECT';
      ELSIF v_post->>'state'='REVOKED' AND v_old->>'state'='APPROVED' AND NOT(v_post?'approvedAt') THEN v_action:='REVOKE';
      ELSE RAISE EXCEPTION 'Invalid synthetic decision' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  -- AFTER trigger inserts the audit only after the row exists (foreign key).
  RETURN NEW;
END $$;
CREATE TRIGGER synthetic_club_write_guard BEFORE INSERT OR UPDATE OR DELETE ON synthetic_club_posts
  FOR EACH ROW EXECUTE FUNCTION synthetic_club_validate_write();
CREATE FUNCTION synthetic_club_record_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_action text;
BEGIN
  v_action:=CASE WHEN TG_OP='INSERT' THEN 'CREATE'
    WHEN NEW.record_json#>>'{post,state}'='REVIEW_PENDING' THEN 'EDIT'
    WHEN NEW.record_json#>>'{post,state}'='APPROVED' THEN 'APPROVE'
    WHEN NEW.record_json#>>'{post,state}'='REJECTED' THEN 'REJECT' ELSE 'REVOKE' END;
  INSERT INTO synthetic_club_audit(source_ref,club_id,version,action,actor_id,actor_role,as_of,recorded_at)
    VALUES(NEW.source_ref,NEW.club_id,NEW.version,v_action,NEW.record_json#>>'{lastActor,actorId}',
      'ADMIN',(NEW.record_json->>'asOf')::timestamptz,(NEW.record_json->>'recordedAt')::timestamptz);
  UPDATE synthetic_club_catalog SET revision=revision+1 WHERE source_ref=NEW.source_ref;
  RETURN NEW;
END $$;
CREATE TRIGGER synthetic_club_write_audit AFTER INSERT OR UPDATE ON synthetic_club_posts
  FOR EACH ROW EXECUTE FUNCTION synthetic_club_record_write();
CREATE FUNCTION synthetic_club_immutable_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Synthetic publication audit is immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER synthetic_club_audit_immutable BEFORE UPDATE OR DELETE ON synthetic_club_audit
  FOR EACH ROW EXECUTE FUNCTION synthetic_club_immutable_audit();

REVOKE ALL ON synthetic_club_grants,synthetic_club_catalog,synthetic_club_posts,
  synthetic_club_audit,synthetic_club_read_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION synthetic_club_grant_version(),synthetic_club_active(text),synthetic_club_validate_write(),
  synthetic_club_record_write(),synthetic_club_immutable_audit() FROM PUBLIC;
-- Operator-reviewed runtime grants (substitute an existing restricted role):
-- GRANT SELECT ON synthetic_club_grants,synthetic_club_catalog,synthetic_club_posts,synthetic_club_audit TO runtime;
-- GRANT UPDATE(lock_version) ON synthetic_club_grants TO runtime;
-- GRANT UPDATE(revision) ON synthetic_club_catalog TO runtime;
-- GRANT INSERT,UPDATE ON synthetic_club_posts TO runtime;
-- GRANT INSERT ON synthetic_club_audit TO runtime;
-- GRANT SELECT,INSERT,DELETE ON synthetic_club_read_receipts TO runtime;
-- GRANT EXECUTE ON FUNCTION synthetic_club_active(text) TO runtime;
-- Do not grant runtime writes to grants/profiles/as_of, DELETE posts, audit edits,
-- ownership, BYPASSRLS, or the provisioning role. Provision only explicit synthetic
-- source/actor/profile mappings; never bootstrap approval from a browser role.
