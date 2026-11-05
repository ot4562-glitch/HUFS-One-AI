-- Optional read-only admin budget/settlement summary for A13.2 (#27).
-- Apply ONLY after the 20261103_ai_budget.sql migration and independent review.
-- No role is granted EXECUTE here; a separate approved dedicated SQL reader
-- role must be granted only this function, never underlying table SELECT/DML.
BEGIN;
CREATE FUNCTION public.ai_budget_admin_usage()
RETURNS TABLE (
  phase_id text, enabled boolean, starts_at timestamptz, ends_at timestamptz,
  max_units text, actor_max_units text, max_attempts integer, actor_max_attempts integer,
  reserved_units text, charged_units text, attempts integer,
  jobs_reserved text, jobs_dispatched text, jobs_unknown_billing text,
  jobs_released text, jobs_settled text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF current_setting('app.actor_id',true) IS NULL
    OR current_setting('app.actor_id',true) !~ '^[A-Za-z0-9_.:-]{1,128}$' THEN
    RAISE EXCEPTION 'AI usage unavailable';
  END IF;
  RETURN QUERY
  SELECT p.phase_id,p.enabled,p.starts_at,p.ends_at,
    p.max_units::text,p.actor_max_units::text,p.max_attempts,p.actor_max_attempts,
    p.reserved_units::text,p.charged_units::text,p.attempts,
    counts.reserved::text,counts.dispatched::text,counts.unknown_billing::text,
    counts.released::text,counts.settled::text
  FROM public.ai_budget_phases p
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE j.state='RESERVED') AS reserved,
      count(*) FILTER (WHERE j.state='DISPATCHED') AS dispatched,
      count(*) FILTER (WHERE j.state='UNKNOWN_BILLING') AS unknown_billing,
      count(*) FILTER (WHERE j.state='RELEASED') AS released,
      count(*) FILTER (WHERE j.state='SETTLED') AS settled
    FROM public.ai_budget_jobs j WHERE j.phase_id=p.phase_id
  ) counts
  ORDER BY p.phase_id
  LIMIT 101;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_budget_admin_usage() FROM PUBLIC;
COMMIT;
-- Operator must review and separately GRANT EXECUTE ON FUNCTION
-- public.ai_budget_admin_usage() TO an isolated, role-verified usage reader.
-- This migration grants nothing and never enables an AI budget phase.
