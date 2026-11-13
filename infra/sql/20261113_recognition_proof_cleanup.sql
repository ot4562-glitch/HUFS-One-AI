-- Apply after international_checklists and self workspace/tombstone migrations.
-- No document, right, model input or external erasure is created by this DDL.
BEGIN;
ALTER TABLE public.api_self_workspace_records DROP CONSTRAINT api_self_workspace_records_kind_check;
ALTER TABLE public.api_self_workspace_records ADD CONSTRAINT api_self_workspace_records_kind_check
  CHECK(kind IN ('EXPERIENCE','STUDY_PLAN','BOOKMARK','ACTION_PLAN','GUIDE_CHECKLIST','RECOGNITION_PROOF'));
ALTER TABLE public.api_self_workspace_events DROP CONSTRAINT api_self_workspace_events_kind_check;
ALTER TABLE public.api_self_workspace_events ADD CONSTRAINT api_self_workspace_events_kind_check
  CHECK(kind IN ('EXPERIENCE','STUDY_PLAN','BOOKMARK','ACTION_PLAN','GUIDE_CHECKLIST','RECOGNITION_PROOF'));

CREATE TABLE public.api_self_proof_cleanup (
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,200}$'),
  item_id text NOT NULL CHECK(item_id ~ '^[A-Za-z0-9_-]{1,90}$'),
  asset_id text NOT NULL CHECK(asset_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  asset_version text NOT NULL CHECK(asset_version ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  record_version bigint NOT NULL CHECK(record_version>0),
  operation text NOT NULL CHECK(operation IN ('PURGE_EXTRACTION','PURGE_DOCUMENT')),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ERASED')),
  receipt_id text CHECK(receipt_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),acknowledged_at timestamptz,
  PRIMARY KEY(actor_id,item_id,asset_version,record_version,operation),
  CHECK((status='ERASED')=(receipt_id IS NOT NULL AND acknowledged_at IS NOT NULL))
);
ALTER TABLE public.api_self_proof_cleanup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_self_proof_cleanup FORCE ROW LEVEL SECURITY;
CREATE POLICY api_proof_cleanup_owner ON public.api_self_proof_cleanup FOR ALL
  USING(actor_id=current_setting('hufs.self_actor',true))
  WITH CHECK(actor_id=current_setting('hufs.self_actor',true));
REVOKE ALL ON TABLE public.api_self_proof_cleanup FROM PUBLIC;

CREATE FUNCTION public.api_self_queue_proof_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v jsonb; a text; i text; n bigint; op text;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.kind<>'RECOGNITION_PROOF' THEN RETURN OLD; END IF;
    v:=OLD.value_json;a:=OLD.actor_id;i:=OLD.item_id;n:=OLD.version;op:='PURGE_DOCUMENT';
  ELSE
    IF NEW.kind<>'RECOGNITION_PROOF' THEN RETURN NEW; END IF;
    a:=NEW.actor_id;i:=NEW.item_id;n:=NEW.version;
    IF NEW.deleted_at IS NOT NULL THEN
      v:=OLD.value_json;op:='PURGE_DOCUMENT';
    ELSIF NEW.value_json->>'cleanupState'='PENDING' THEN
      v:=NEW.value_json;
      op:=CASE WHEN v->>'state'='REJECTED' THEN 'PURGE_EXTRACTION' ELSE 'PURGE_DOCUMENT' END;
    ELSE RETURN NEW;
    END IF;
  END IF;
  -- A prior generic tombstone has already queued its cleanup on UPDATE.
  IF v->>'assetId' IS NOT NULL AND v->>'assetVersion' IS NOT NULL THEN
    INSERT INTO public.api_self_proof_cleanup(actor_id,item_id,asset_id,asset_version,record_version,operation)
      VALUES(a,i,v->>'assetId',v->>'assetVersion',n,op) ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.api_self_queue_proof_cleanup() FROM PUBLIC;
CREATE TRIGGER api_self_proof_cleanup_enqueue AFTER INSERT OR UPDATE OR DELETE
  ON public.api_self_workspace_records FOR EACH ROW EXECUTE FUNCTION public.api_self_queue_proof_cleanup();

CREATE FUNCTION public.api_self_proof_cleanup_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF ROW(NEW.actor_id,NEW.item_id,NEW.asset_id,NEW.asset_version,NEW.record_version,NEW.operation,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.actor_id,OLD.item_id,OLD.asset_id,OLD.asset_version,OLD.record_version,OLD.operation,OLD.created_at)
    OR OLD.status='ERASED' THEN RAISE EXCEPTION 'Proof cleanup identity/acknowledgment is immutable'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.api_self_proof_cleanup_immutable() FROM PUBLIC;
CREATE TRIGGER api_self_proof_cleanup_no_rewrite BEFORE UPDATE ON public.api_self_proof_cleanup
  FOR EACH ROW EXECUTE FUNCTION public.api_self_proof_cleanup_immutable();
-- Private cleanup role: SELECT plus UPDATE(status,receipt_id,acknowledged_at).
-- No INSERT/DELETE grant: only workspace changes enqueue jobs transactionally.
-- Owner context is mandatory even for consent withdrawal. A cleanup authority
-- may operate after storage consent is withdrawn, solely to erase and attest.
COMMIT;
