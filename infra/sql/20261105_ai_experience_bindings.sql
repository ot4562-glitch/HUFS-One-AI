-- Current owner experience to explicitly approved AI input binding.
-- Operator-provisioned only; no browser upload, auto approval or private seeds.
-- Requires 20261103_ai_provider_inputs.sql and 20261105_ai_consented_personal_inputs.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.api_ai_experience_bindings (
  projection_id text PRIMARY KEY,
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  experience_id text NOT NULL CHECK(experience_id ~ '^[A-Za-z0-9_-]{1,90}$'),
  content_version bigint NOT NULL CHECK(content_version>0),
  consent_version bigint NOT NULL CHECK(consent_version>0),
  input_ref text NOT NULL CHECK(input_ref ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  operation text NOT NULL CHECK(operation='HCX_007'),
  source_id text NOT NULL,
  source_revision_id text NOT NULL,
  approved_by text NOT NULL CHECK(approved_by ~ '^[A-Za-z0-9_.:@-]{1,128}$' AND approved_by<>actor_id),
  approved_at timestamptz NOT NULL,
  FOREIGN KEY(projection_id,actor_id,input_ref,operation)
    REFERENCES public.api_ai_provider_inputs(projection_id,actor_id,input_ref,operation),
  FOREIGN KEY(source_id,source_revision_id)
    REFERENCES public.source_revisions_vnext(source_id,revision_id)
);
CREATE OR REPLACE FUNCTION public.deny_ai_experience_binding_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'immutable experience to AI binding';
END;
$$;
REVOKE ALL ON FUNCTION public.deny_ai_experience_binding_change() FROM PUBLIC;
CREATE TRIGGER immutable_ai_experience_binding BEFORE UPDATE OR DELETE ON public.api_ai_experience_bindings
  FOR EACH ROW EXECUTE FUNCTION public.deny_ai_experience_binding_change();
ALTER TABLE public.api_ai_experience_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_ai_experience_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_experience_owner_only ON public.api_ai_experience_bindings FOR SELECT
  USING(actor_id=current_setting('hufs.self_actor',true));
REVOKE ALL ON public.api_ai_experience_bindings FROM PUBLIC;
-- The separately privileged operator supplies the row and its independently
-- reviewed source; provider runtime is nonowner SELECT-only and must be given
-- explicit SELECT on this table and api_self_workspace_records. A reviewer
-- must bind the packet to this current owner record; runtime rechecks both.
COMMIT;
