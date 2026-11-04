-- HUFS One AI #203: server-owned, per-actor atomic quotas across API replicas.
-- REVIEW-ONLY migration. The operator must apply it to a reviewed database;
-- there is no implicit GRANT to API roles and no background cleanup process.
-- The API sends only a keyed digest of the verified actor, never student IDs.
BEGIN;

CREATE TABLE IF NOT EXISTS public.demo_profile_quota_windows (
  identity_digest char(64) NOT NULL
    CHECK (identity_digest ~ '^[0-9a-f]{64}$'),
  operation text NOT NULL CHECK (operation IN ('READ','WRITE')),
  window_start timestamptz NOT NULL,
  uses integer NOT NULL CHECK (uses BETWEEN 1 AND 60),
  PRIMARY KEY (identity_digest,operation,window_start)
);

CREATE INDEX IF NOT EXISTS demo_profile_quota_cleanup
  ON public.demo_profile_quota_windows (window_start);
REVOKE ALL ON TABLE public.demo_profile_quota_windows FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.consume_demo_profile_quota(
  p_identity_digest char(64), p_operation text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE
  v_max integer;
  v_window timestamptz;
  v_admitted boolean;
BEGIN
  IF p_identity_digest IS NULL
    OR p_identity_digest !~ '^[0-9a-f]{64}$'
    OR p_operation IS NULL
    OR p_operation NOT IN ('READ','WRITE') THEN
    RETURN false;
  END IF;
  v_max:=CASE p_operation WHEN 'READ' THEN 60 WHEN 'WRITE' THEN 20 END;
  v_window:=date_trunc('minute',clock_timestamp());

  INSERT INTO public.demo_profile_quota_windows
    (identity_digest,operation,window_start,uses)
    VALUES (p_identity_digest,p_operation,v_window,1)
  ON CONFLICT (identity_digest,operation,window_start)
  DO UPDATE SET uses=public.demo_profile_quota_windows.uses+1
    WHERE public.demo_profile_quota_windows.uses<v_max
  RETURNING true INTO v_admitted;
  RETURN COALESCE(v_admitted,false);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_demo_profile_quota(char(64),text) FROM PUBLIC;
-- Operator must GRANT EXECUTE on the specific function to the verified API
-- role only, after confirming SECURITY DEFINER ownership and migration SHA.
-- A separately approved bounded maintenance job should remove old windows.
COMMIT;
