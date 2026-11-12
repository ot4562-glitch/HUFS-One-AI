-- #447: enable a separate independently reviewed V2_CATALOG owner projection.
-- Pre-NCP DRAFT; no data inserted, policy/rights granted or activation.
-- Operator must review/apply AFTER 20261101_owner_approved_catalog.sql.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.api_owner_approved_projections'::regclass
      AND conname='api_owner_approved_projections_kind_check'
      AND contype='c'
  ) THEN
    RAISE EXCEPTION 'pre-NCP owner catalog base constraint missing';
  END IF;
END;
$$;
ALTER TABLE public.api_owner_approved_projections
  DROP CONSTRAINT api_owner_approved_projections_kind_check;
ALTER TABLE public.api_owner_approved_projections
  ADD CONSTRAINT api_owner_approved_projections_kind_check
  CHECK(kind IN ('TRANSCRIPT','COURSE','OFFERING','OPPORTUNITY','PLAN_INPUT','V2_CATALOG'));
-- The default owner HEAD index inherits its locale collation. A separate
-- C-collated keyset index makes entity_id > lastId deterministic across
-- PostgreSQL replicas; no SELECT or write privileges are added.
CREATE INDEX IF NOT EXISTS api_owner_v2_heads_keyset_idx
  ON public.api_owner_approved_heads
  (actor_id,kind,entity_id COLLATE "C") INCLUDE(projection_id)
  WHERE kind='V2_CATALOG';
-- Existing immutable history, RLS, actor-scoped approved heads and SQL
-- privileges remain unchanged. No write role or automatic seed is introduced.
COMMIT;
