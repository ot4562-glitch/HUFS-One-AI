-- A02: bind demo OWNER_CONSENTED personal writes to current owner storage
-- permission. This is a forward-only PRIVACY migration; do not auto-apply.
-- Apply AFTER 20261031_zz_api_roles.sql AND 20261101_self_account.sql
-- in a reviewed isolated database. Existing consented rows require an
-- explicit operator review/cleanup before enabling these triggers.
-- All functions must be owned by a trusted DB migration role with BYPASSRLS:
-- API roles remain non-owner, non-BYPASSRLS and receive no extra grants.
BEGIN;
-- A forward migration must not silently grandfather unconsented legacy data.
-- Stop for operator-controlled erasure first; do not fabricate retroactive consent.
DO $consent_gate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.api_personal_records p
    LEFT JOIN public.api_self_consents c ON c.actor_id=p.actor_id
    WHERE p.data_mode='OWNER_CONSENTED' AND p.deleted_at IS NULL
      AND c.choices_json->>'personalStorage' IS DISTINCT FROM 'true'
  ) THEN
    RAISE EXCEPTION 'existing owner data requires storage-consent review';
  END IF;
END;
$consent_gate$;

-- An UPDATE/INSERT must wait for the same consent row that withdrawal locks.
-- A concurrent withdrawal commits first -> no permitted write; a write
-- acquires FOR SHARE first -> withdrawal waits and erases it before returning.
-- Never treat the caller's dataMode flag or external verifier as DB consent.
CREATE FUNCTION public.api_personal_require_storage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE storage_allowed boolean;
BEGIN
  IF TG_OP='UPDATE' AND OLD.data_mode='OWNER_CONSENTED'
     AND NEW.data_mode<>'OWNER_CONSENTED' AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'personal data mode is immutable'
      USING ERRCODE='P6001';
  END IF;
  -- Tombstoning remains possible after revocation; no personal payload
  -- may be restored from a tombstone with the old PK/version.
  IF TG_OP='UPDATE' AND OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'personal tombstone cannot be restored'
      USING ERRCODE='P6001';
  END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.data_mode<>'OWNER_CONSENTED' THEN
    RETURN NEW;
  END IF;

  SELECT choices_json->>'personalStorage'='true'
    INTO storage_allowed
    FROM public.api_self_consents
    WHERE actor_id=NEW.actor_id
    FOR SHARE;
  IF storage_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'owner storage permission required'
      USING ERRCODE='P6001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.api_personal_require_storage() FROM PUBLIC;

CREATE TRIGGER api_personal_storage_current
  BEFORE INSERT OR UPDATE ON public.api_personal_records
  FOR EACH ROW EXECUTE FUNCTION public.api_personal_require_storage();

-- The consent UPDATE and each owner's sensitive record purge + immutable
-- metadata-only audit commit together or roll back together. Never copy
-- value_json into audit. Leave independently approved SYNTHETIC fixtures alone.
CREATE FUNCTION public.api_personal_purge_on_storage_withdrawal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.choices_json->>'personalStorage'='true'
     AND NEW.choices_json->>'personalStorage' IS DISTINCT FROM 'true' THEN
    WITH purged AS (
      UPDATE public.api_personal_records
        SET value_json='{}'::jsonb,
            version=version+1,
            deleted_at=clock_timestamp(),
            updated_at=clock_timestamp()
      WHERE actor_id=NEW.actor_id
        AND data_mode='OWNER_CONSENTED'
        AND deleted_at IS NULL
      RETURNING actor_id,subject_id,kind,item_id,version,updated_at
    )
    INSERT INTO public.api_personal_events
      (event_id,actor_id,subject_id,kind,item_id,action,version,event_at)
    SELECT gen_random_uuid(),actor_id,subject_id,kind,item_id,
      'DELETED',version,updated_at FROM purged;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.api_personal_purge_on_storage_withdrawal() FROM PUBLIC;

CREATE TRIGGER api_personal_withdraw_storage
  AFTER UPDATE OF choices_json ON public.api_self_consents
  FOR EACH ROW EXECUTE FUNCTION public.api_personal_purge_on_storage_withdrawal();

COMMIT;

-- Manual schema rollback (separate, reviewed transaction):
-- DROP TRIGGER api_personal_withdraw_storage ON public.api_self_consents;
-- DROP TRIGGER api_personal_storage_current ON public.api_personal_records;
-- DROP FUNCTION public.api_personal_purge_on_storage_withdrawal();
-- DROP FUNCTION public.api_personal_require_storage();
-- This cannot/should not restore erased personal records or audit metadata.
