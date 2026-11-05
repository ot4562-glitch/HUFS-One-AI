-- Dedicated, non-login group role for independently reviewed experience
-- input registration. This code never creates a LOGIN user or seeds authority.
-- Operator must separately provision an audited restricted LOGIN role, grant
-- it membership in this group and configure an independent network/CA/secret.
-- Apply only after base provider, personal class and experience binding SQL.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hufs_ai_input_operator')
  THEN CREATE ROLE hufs_ai_input_operator NOLOGIN NOSUPERUSER NOBYPASSRLS
    NOCREATEDB NOCREATEROLE NOREPLICATION; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO hufs_ai_input_operator;
GRANT SELECT ON public.api_self_consents,public.api_self_workspace_records,
  public.source_ingest_heads,public.source_effective_revisions_vnext,
  public.source_originals_vnext,public.source_review_attestations_vnext,
  public.source_rights_receipts,public.source_rights_revocations
  TO hufs_ai_input_operator;
GRANT SELECT,INSERT ON public.api_ai_provider_inputs TO hufs_ai_input_operator;
GRANT SELECT,INSERT,DELETE ON public.api_ai_provider_input_heads TO hufs_ai_input_operator;
GRANT SELECT,INSERT ON public.api_ai_experience_bindings TO hufs_ai_input_operator;

CREATE POLICY ai_provider_input_operator_insert ON public.api_ai_provider_inputs
  FOR INSERT TO hufs_ai_input_operator
  WITH CHECK(actor_id=current_setting('hufs.self_actor',true)
    AND approved_by<>actor_id AND input_class='PERSONAL_CONSENTED_CLEARED');
CREATE POLICY ai_provider_head_operator_insert ON public.api_ai_provider_input_heads
  FOR INSERT TO hufs_ai_input_operator
  WITH CHECK(actor_id=current_setting('hufs.self_actor',true) AND operation='HCX_007');
CREATE POLICY ai_provider_head_operator_delete ON public.api_ai_provider_input_heads
  FOR DELETE TO hufs_ai_input_operator
  USING(actor_id=current_setting('hufs.self_actor',true) AND operation='HCX_007');
CREATE POLICY ai_experience_operator_insert ON public.api_ai_experience_bindings
  FOR INSERT TO hufs_ai_input_operator
  WITH CHECK(actor_id=current_setting('hufs.self_actor',true)
    AND operation='HCX_007' AND approved_by<>actor_id);

-- Content change or deletion must never leave a live personal model input.
-- SECURITY DEFINER executes solely on a row update/delete, never via public
-- API. It destroys payloads and current pointers, but cannot resurrect them.
CREATE OR REPLACE FUNCTION public.invalidate_changed_experience_ai_input()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  changed boolean;
BEGIN
  IF OLD.kind<>'EXPERIENCE' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP='DELETE' THEN
    changed := true;
  ELSE
    changed := NEW.version<>OLD.version
      OR NEW.value_json IS DISTINCT FROM OLD.value_json
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at;
  END IF;
  IF changed THEN
    UPDATE public.api_ai_provider_inputs p
       SET safe_packet=NULL,media_bytes=NULL,erased_at=clock_timestamp()
     WHERE p.actor_id=OLD.actor_id AND p.erased_at IS NULL AND EXISTS(
       SELECT 1 FROM public.api_ai_experience_bindings b
       WHERE b.projection_id=p.projection_id
         AND b.actor_id=OLD.actor_id AND b.experience_id=OLD.item_id);
    DELETE FROM public.api_ai_provider_input_heads h
     WHERE h.actor_id=OLD.actor_id AND h.projection_id IN(
       SELECT b.projection_id FROM public.api_ai_experience_bindings b
       WHERE b.actor_id=OLD.actor_id AND b.experience_id=OLD.item_id);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_changed_experience_ai_input() FROM PUBLIC;
CREATE TRIGGER changed_experience_erases_ai_inputs
  AFTER UPDATE OR DELETE ON public.api_self_workspace_records FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_changed_experience_ai_input();
COMMIT;
