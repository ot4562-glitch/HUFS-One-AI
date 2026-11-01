-- A02: erase deleted owner workspaces rather than retaining private JSONB.
-- Review-only forward migration. Apply after 20261101_self_workspace.sql.
-- This processes no raw CSV/Forms and must not be run against production here.
BEGIN;

-- The non-owner application role only needs its existing UPDATE permission.
-- No SECURITY DEFINER, public EXECUTE, or RLS bypass is introduced.
CREATE FUNCTION public.api_self_workspace_guard_tombstone()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
DECLARE minimal jsonb;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'cannot insert an already deleted owner record'
        USING ERRCODE='P6002';
    END IF;
    RETURN NEW;
  END IF;

  -- A primary key is not a rename or cross-owner move capability.
  IF NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.item_id IS DISTINCT FROM OLD.item_id THEN
    RAISE EXCEPTION 'owner record identity is immutable'
      USING ERRCODE='P6002';
  END IF;
  minimal := jsonb_build_object('kind',OLD.kind,'dataMode',
    OLD.value_json->'dataMode');

  IF OLD.deleted_at IS NOT NULL THEN
    -- Existing tombstones can be scrubbed once by this migration (without
    -- changing version/audit/timestamps). They cannot be reanimated.
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
      OR NEW.value_json IS DISTINCT FROM minimal THEN
      RAISE EXCEPTION 'deleted owner record is immutable'
        USING ERRCODE='P6002';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    IF NEW.version IS DISTINCT FROM OLD.version+1 THEN
      RAISE EXCEPTION 'owner deletion must advance the version once'
        USING ERRCODE='P6002';
    END IF;
    -- Keep only non-sensitive kind/mode markers for existing DB constraints;
    -- never keep title, opportunity, task, notes, or other private content.
    NEW.value_json := minimal;
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.api_self_workspace_guard_tombstone() FROM PUBLIC;

CREATE TRIGGER api_self_workspace_tombstone_guard
  BEFORE INSERT OR UPDATE ON public.api_self_workspace_records
  FOR EACH ROW EXECUTE FUNCTION public.api_self_workspace_guard_tombstone();

-- Add the constraint before scrubbing so new writes cannot create payload-
-- bearing tombstones while the forward migration runs. Legacy rows are
-- checked only after the scrub, in the same transactional migration.
ALTER TABLE public.api_self_workspace_records
  ADD CONSTRAINT api_self_workspace_deleted_payload_minimal
  CHECK (deleted_at IS NULL OR value_json=jsonb_build_object(
    'kind',kind,'dataMode',value_json->'dataMode')) NOT VALID;
UPDATE public.api_self_workspace_records
  SET value_json=jsonb_build_object('kind',kind,'dataMode',
    value_json->'dataMode')
  WHERE deleted_at IS NOT NULL AND value_json<>jsonb_build_object(
    'kind',kind,'dataMode',value_json->'dataMode');
ALTER TABLE public.api_self_workspace_records
  VALIDATE CONSTRAINT api_self_workspace_deleted_payload_minimal;
COMMIT;

-- Forward: requires isolated reviewed DB migration role that can see all
-- rows despite FORCE RLS; validate before deployment; never auto-run.
-- Rollback schema (operator-reviewed, separate transaction):
--   ALTER TABLE api_self_workspace_records
--     DROP CONSTRAINT api_self_workspace_deleted_payload_minimal;
--   DROP TRIGGER api_self_workspace_tombstone_guard
--     ON api_self_workspace_records;
--   DROP FUNCTION public.api_self_workspace_guard_tombstone();
-- A schema rollback must NEVER restore deleted payloads or edit audit events.
