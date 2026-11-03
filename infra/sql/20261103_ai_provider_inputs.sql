-- Private operator-provisioned, independently reviewed provider inputs.
-- No approval, role, data, source rights, resource or live migration is seeded.
BEGIN;
CREATE TABLE IF NOT EXISTS api_ai_provider_inputs (
  projection_id text PRIMARY KEY CHECK(projection_id ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  input_ref text NOT NULL CHECK(input_ref ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  operation text NOT NULL CHECK(operation IN ('OCR_GENERAL','HCX_005','HCX_007')),
  as_of timestamptz NOT NULL,
  epoch text NOT NULL CHECK(epoch ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  policy_version text NOT NULL CHECK(policy_version ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  consent_version text NOT NULL CHECK(consent_version ~ '^[1-9][0-9]{0,15}$'),
  approved_by text NOT NULL CHECK(approved_by ~ '^[A-Za-z0-9_.:@-]{1,128}$' AND approved_by<>actor_id),
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  input_class text NOT NULL CHECK(input_class IN ('PUBLIC_CLEARED','SYNTHETIC_CLEARED','NON_IDENTIFYING_REVIEWED')),
  -- Attestation reference from an independently authenticated operator's privacy
  -- review. A schema-valid packet or browser checkbox is not this attestation.
  privacy_review_ref text NOT NULL CHECK(privacy_review_ref ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  source_refs jsonb NOT NULL CHECK(jsonb_typeof(source_refs)='array'
    AND jsonb_array_length(source_refs) BETWEEN 1 AND 20 AND octet_length(source_refs::text)<=20000),
  safe_packet jsonb CHECK(safe_packet IS NULL OR (jsonb_typeof(safe_packet)='object'
    AND octet_length(safe_packet::text)<=24000 AND safe_packet ? 'providerInputClass'
    AND safe_packet->>'providerInputClass'=input_class)),
  media_bytes bytea CHECK(media_bytes IS NULL OR octet_length(media_bytes) BETWEEN 1 AND 5242880),
  media_source_revision_id text REFERENCES source_revisions_vnext(revision_id),
  media_asset_id text CHECK(media_asset_id ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  media_original_sha256 text CHECK(media_original_sha256 ~ '^[a-f0-9]{64}$'),
  erased_at timestamptz CHECK(erased_at IS NULL OR erased_at>=approved_at),
  CHECK(approved_at<=as_of AND as_of<expires_at),
  CHECK(
    (erased_at IS NOT NULL AND safe_packet IS NULL AND media_bytes IS NULL)
    OR (erased_at IS NULL AND operation='HCX_007' AND safe_packet IS NOT NULL AND media_bytes IS NULL
      AND media_source_revision_id IS NULL AND media_asset_id IS NULL AND media_original_sha256 IS NULL)
    OR (erased_at IS NULL AND operation IN ('OCR_GENERAL','HCX_005') AND media_bytes IS NOT NULL
      AND media_source_revision_id IS NOT NULL AND media_asset_id IS NOT NULL AND media_original_sha256 IS NOT NULL
      AND ((operation='OCR_GENERAL' AND safe_packet IS NULL) OR (operation='HCX_005' AND safe_packet IS NOT NULL)))
  ),
  UNIQUE(projection_id,actor_id,input_ref,operation)
);
CREATE TABLE IF NOT EXISTS api_ai_provider_input_heads (
  actor_id text NOT NULL,
  input_ref text NOT NULL,
  operation text NOT NULL,
  projection_id text NOT NULL,
  PRIMARY KEY(actor_id,input_ref,operation),
  FOREIGN KEY(projection_id,actor_id,input_ref,operation)
    REFERENCES api_ai_provider_inputs(projection_id,actor_id,input_ref,operation)
);
CREATE OR REPLACE FUNCTION deny_ai_provider_input_mutation() RETURNS trigger
  LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN
    -- One-way privacy erasure preserves provenance, never permits payload restoration.
    IF TG_OP='UPDATE' AND OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL
      AND NEW.safe_packet IS NULL AND NEW.media_bytes IS NULL
      AND (to_jsonb(OLD)-ARRAY['safe_packet','media_bytes','erased_at'])
        IS NOT DISTINCT FROM (to_jsonb(NEW)-ARRAY['safe_packet','media_bytes','erased_at']) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'immutable provider input';
  END; $$;
REVOKE ALL ON FUNCTION deny_ai_provider_input_mutation() FROM PUBLIC;
CREATE TRIGGER immutable_ai_provider_input BEFORE UPDATE OR DELETE ON api_ai_provider_inputs
  FOR EACH ROW EXECUTE FUNCTION deny_ai_provider_input_mutation();
CREATE FUNCTION check_ai_provider_input_consent() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.api_self_consents%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.api_self_consents WHERE actor_id=NEW.actor_id FOR SHARE;
  IF NOT FOUND OR c.version::text<>NEW.consent_version
    OR NOT c.choices_json @> '{"personalStorage":true,"externalAi":true}'::jsonb
    OR c.updated_at>NEW.approved_at OR NEW.erased_at IS NOT NULL
    OR NEW.approved_at>clock_timestamp() THEN RAISE EXCEPTION 'provider consent unavailable'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION check_ai_provider_input_consent() FROM PUBLIC;
CREATE TRIGGER approved_ai_input_needs_current_consent BEFORE INSERT ON api_ai_provider_inputs
  FOR EACH ROW EXECUTE FUNCTION check_ai_provider_input_consent();
CREATE FUNCTION erase_withdrawn_ai_provider_inputs() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE public.api_ai_provider_inputs SET safe_packet=NULL,media_bytes=NULL,erased_at=clock_timestamp()
      WHERE actor_id=OLD.actor_id AND erased_at IS NULL;
    RETURN OLD;
  END IF;
  IF NEW.actor_id<>OLD.actor_id OR NOT NEW.choices_json @> '{"personalStorage":true,"externalAi":true}'::jsonb THEN
    UPDATE public.api_ai_provider_inputs SET safe_packet=NULL,media_bytes=NULL,erased_at=clock_timestamp()
      WHERE actor_id=OLD.actor_id AND erased_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION erase_withdrawn_ai_provider_inputs() FROM PUBLIC;
CREATE TRIGGER consent_withdrawal_erases_ai_inputs AFTER UPDATE OR DELETE ON api_self_consents
  FOR EACH ROW EXECUTE FUNCTION erase_withdrawn_ai_provider_inputs();
ALTER TABLE api_ai_provider_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_ai_provider_inputs FORCE ROW LEVEL SECURITY;
ALTER TABLE api_ai_provider_input_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_ai_provider_input_heads FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_provider_input_exact_actor ON api_ai_provider_inputs FOR SELECT
  USING(actor_id=current_setting('hufs.self_actor',true));
CREATE POLICY ai_provider_input_head_exact_actor ON api_ai_provider_input_heads FOR SELECT
  USING(actor_id=current_setting('hufs.self_actor',true));
REVOKE ALL ON api_ai_provider_inputs,api_ai_provider_input_heads FROM PUBLIC;
-- An independently authenticated DBA/operator provisions immutable approved rows
-- and moves/deletes the current head via a separately authorized maintenance role.
-- No actor-scoped INSERT/UPDATE/DELETE policy exists. Runtime must be a dedicated
-- non-owner, non-superuser, non-BYPASSRLS SELECT-only role. Explicit deployment
-- grants include these tables, api_self_consents, source_ingest_heads,
-- source_effective_revisions_vnext, source_rights_receipts/revocations; no browser
-- role gets packet/media table access. Apply only after separate owner approval.
COMMIT;
