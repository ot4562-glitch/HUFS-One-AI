-- #512 owner-private originals. Apply after recognition_proof_cleanup.
-- No external storage or inspection permission is granted by this migration.
-- Runtime: SELECT/INSERT assets; EXECUTE erase function. NO UPDATE/DELETE assets.
-- An approved encrypted private DB/backup policy is required before real intake.
BEGIN;
CREATE TABLE public.api_self_recognition_assets (
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  asset_id text NOT NULL CHECK(asset_id ~ '^asset-[a-f0-9]{64}$'),
  asset_version text NOT NULL CHECK(asset_version='original-v1'),
  proof_item_id text NOT NULL CHECK(proof_item_id ~ '^proof-[a-f0-9]{64}$'),
  activity_id text NOT NULL CHECK(activity_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  state text NOT NULL CHECK(state IN ('LIVE','ERASED')),version bigint NOT NULL CHECK(version>0),
  created_consent_version bigint NOT NULL CHECK(created_consent_version>0),
  rights_version text,consent_version text,mime_type text,size_bytes integer,original_sha256 text,raw_bytes bytea,
  inspection_receipt text,inspector_version text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),erased_at timestamptz,
  PRIMARY KEY(actor_id,asset_id),UNIQUE(actor_id,proof_item_id),
  CHECK((state='LIVE' AND erased_at IS NULL AND version=1
    AND rights_version IS NOT NULL AND rights_version ~ '^[A-Za-z0-9_.:-]{1,128}$'
    AND consent_version IS NOT NULL AND consent_version ~ '^[A-Za-z0-9_.:-]{1,128}$'
    AND mime_type IS NOT NULL AND mime_type IN ('image/png','image/jpeg','application/pdf')
    AND size_bytes IS NOT NULL AND size_bytes BETWEEN 1 AND 2097152
    AND original_sha256 IS NOT NULL AND original_sha256 ~ '^[a-f0-9]{64}$'
    AND raw_bytes IS NOT NULL AND octet_length(raw_bytes)=size_bytes
    AND inspection_receipt IS NOT NULL AND inspection_receipt ~ '^[A-Za-z0-9_.:-]{1,128}$'
    AND inspector_version IS NOT NULL AND inspector_version ~ '^[A-Za-z0-9_.:-]{1,128}$')
    OR (state='ERASED' AND erased_at IS NOT NULL AND version=2
      AND rights_version IS NULL AND consent_version IS NULL AND mime_type IS NULL AND size_bytes IS NULL
      AND original_sha256 IS NULL AND raw_bytes IS NULL AND inspection_receipt IS NULL AND inspector_version IS NULL))
);
ALTER TABLE public.api_self_recognition_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_self_recognition_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY api_recognition_asset_owner ON public.api_self_recognition_assets FOR ALL
  USING(actor_id=current_setting('hufs.self_actor',true)) WITH CHECK(actor_id=current_setting('hufs.self_actor',true));
REVOKE ALL ON TABLE public.api_self_recognition_assets FROM PUBLIC;
CREATE INDEX api_recognition_asset_live ON public.api_self_recognition_assets(actor_id,activity_id,asset_id) WHERE state='LIVE';

CREATE FUNCTION public.api_self_guard_recognition_asset() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE cv bigint; choices jsonb; n bigint; per_activity bigint;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT version,choices_json INTO cv,choices FROM public.api_self_consents WHERE actor_id=NEW.actor_id FOR UPDATE;
    IF NOT FOUND OR choices->'personalStorage' IS DISTINCT FROM 'true'::jsonb
      OR cv<>NEW.created_consent_version OR NEW.state<>'LIVE' OR NEW.version<>1 THEN
      RAISE EXCEPTION 'Current storage consent required'; END IF;
    SELECT count(*),count(*) FILTER(WHERE activity_id=NEW.activity_id) INTO n,per_activity
      FROM public.api_self_recognition_assets WHERE actor_id=NEW.actor_id AND state='LIVE';
    IF n>=50 OR per_activity>=10 THEN RAISE EXCEPTION 'Recognition asset quota reached'; END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.actor_id,NEW.asset_id,NEW.asset_version,NEW.proof_item_id,NEW.activity_id,NEW.created_consent_version,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.actor_id,OLD.asset_id,OLD.asset_version,OLD.proof_item_id,OLD.activity_id,OLD.created_consent_version,OLD.created_at)
    OR OLD.state<>'LIVE' OR NEW.state<>'ERASED' OR NEW.version<>OLD.version+1 THEN
    RAISE EXCEPTION 'Recognition asset identity/erasure is immutable'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.api_self_guard_recognition_asset() FROM PUBLIC;
CREATE TRIGGER api_recognition_asset_guard BEFORE INSERT OR UPDATE ON public.api_self_recognition_assets
  FOR EACH ROW EXECUTE FUNCTION public.api_self_guard_recognition_asset();

-- Independent asset lifecycle: a never-OCR'd original still has a durable job.
CREATE FUNCTION public.api_self_queue_recognition_asset_erasure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.actor_id IS DISTINCT FROM current_setting('hufs.self_actor',true) THEN RAISE EXCEPTION 'Owner context required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.api_self_proof_cleanup WHERE actor_id=NEW.actor_id
    AND asset_id=NEW.asset_id AND asset_version=NEW.asset_version AND operation='PURGE_DOCUMENT') THEN
    INSERT INTO public.api_self_proof_cleanup(actor_id,item_id,asset_id,asset_version,record_version,operation)
      VALUES(NEW.actor_id,NEW.proof_item_id,NEW.asset_id,NEW.asset_version,1,'PURGE_DOCUMENT') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.api_self_queue_recognition_asset_erasure() FROM PUBLIC;
CREATE TRIGGER api_recognition_asset_queue AFTER UPDATE ON public.api_self_recognition_assets
  FOR EACH ROW WHEN(NEW.state='ERASED') EXECUTE FUNCTION public.api_self_queue_recognition_asset_erasure();

-- Existing reject/withdraw/delete/consent flows also erase ledger originals.
-- PURGE_EXTRACTION intentionally preserves the original until document erasure.
CREATE FUNCTION public.api_self_cleanup_recognition_original() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.actor_id IS DISTINCT FROM current_setting('hufs.self_actor',true) THEN RAISE EXCEPTION 'Owner context required'; END IF;
  IF NEW.operation='PURGE_DOCUMENT' THEN
    UPDATE public.api_self_recognition_assets SET state='ERASED',version=2,erased_at=clock_timestamp(),
      rights_version=NULL,consent_version=NULL,mime_type=NULL,size_bytes=NULL,original_sha256=NULL,raw_bytes=NULL,
      inspection_receipt=NULL,inspector_version=NULL
      WHERE actor_id=NEW.actor_id AND asset_id=NEW.asset_id AND asset_version=NEW.asset_version AND state='LIVE';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.api_self_cleanup_recognition_original() FROM PUBLIC;
CREATE TRIGGER api_recognition_cleanup_original AFTER INSERT ON public.api_self_proof_cleanup
  FOR EACH ROW EXECUTE FUNCTION public.api_self_cleanup_recognition_original();

CREATE FUNCTION public.api_self_erase_recognition_asset(a text,activity text,asset text,revision text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE current_state text;
BEGIN
  IF a IS DISTINCT FROM current_setting('hufs.self_actor',true) THEN RAISE EXCEPTION 'Owner context required'; END IF;
  -- Serialize with intake/read through the owner consent row, including when
  -- storage is already withdrawn. No asset UPDATE privilege is given to callers.
  PERFORM 1 FROM public.api_self_consents WHERE actor_id=a FOR UPDATE;
  SELECT state INTO current_state FROM public.api_self_recognition_assets
    WHERE actor_id=a AND activity_id=activity AND asset_id=asset AND asset_version=revision;
  IF NOT FOUND THEN RETURN false; END IF;
  IF current_state='ERASED' THEN RETURN true; END IF;
  -- The workspace DELETE queues external OCR/cache/derived/model cleanup and
  -- destroys candidate JSON. Lock workspace before asset to match proof writes.
  DELETE FROM public.api_self_workspace_records WHERE actor_id=a AND kind='RECOGNITION_PROOF'
    AND value_json->>'assetId'=asset;
  UPDATE public.api_self_recognition_assets SET state='ERASED',version=2,erased_at=clock_timestamp(),
    rights_version=NULL,consent_version=NULL,mime_type=NULL,size_bytes=NULL,original_sha256=NULL,raw_bytes=NULL,
    inspection_receipt=NULL,inspector_version=NULL
    WHERE actor_id=a AND asset_id=asset AND asset_version=revision AND state='LIVE';
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.api_self_erase_recognition_asset(text,text,text,text) FROM PUBLIC;

CREATE FUNCTION public.api_self_withdraw_recognition_assets() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a text; r record;
BEGIN
  IF TG_OP='UPDATE' AND NEW.choices_json->'personalStorage'='true'::jsonb THEN RETURN NEW; END IF;
  a:=OLD.actor_id;
  IF a IS DISTINCT FROM current_setting('hufs.self_actor',true) THEN RAISE EXCEPTION 'Owner context required'; END IF;
  FOR r IN SELECT activity_id,asset_id,asset_version FROM public.api_self_recognition_assets WHERE actor_id=a AND state='LIVE' LOOP
    PERFORM public.api_self_erase_recognition_asset(a,r.activity_id,r.asset_id,r.asset_version);
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.api_self_withdraw_recognition_assets() FROM PUBLIC;
CREATE TRIGGER api_recognition_assets_consent_withdraw AFTER UPDATE OR DELETE ON public.api_self_consents
  FOR EACH ROW EXECUTE FUNCTION public.api_self_withdraw_recognition_assets();
COMMIT;
