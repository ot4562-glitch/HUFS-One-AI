-- #447: replica-shared, privacy-preserving owner V2 catalog search quota.
-- Apply ONLY after separately reviewed operator migration and recovery evidence.
-- Empty operator policy => all requests DENIED. No automatically chosen limits,
-- credentials, grants, API activation or actual owner data live in this file.
BEGIN;
CREATE TABLE IF NOT EXISTS public.owner_v2_catalog_quota_policy(
  singleton smallint PRIMARY KEY CHECK(singleton=1),
  max_requests_per_minute integer NOT NULL CHECK(max_requests_per_minute BETWEEN 1 AND 120)
);
REVOKE ALL ON TABLE public.owner_v2_catalog_quota_policy FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.owner_v2_catalog_quota_windows(
  identity_digest char(64) NOT NULL CHECK(identity_digest ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  uses integer NOT NULL CHECK(uses BETWEEN 1 AND 120),
  PRIMARY KEY(identity_digest,window_start)
);
CREATE INDEX IF NOT EXISTS owner_v2_catalog_quota_cleanup
  ON public.owner_v2_catalog_quota_windows(window_start);
REVOKE ALL ON TABLE public.owner_v2_catalog_quota_windows FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.consume_owner_v2_catalog_quota(p_identity_digest char(64))
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $$
DECLARE
  v_limit integer;
  v_allowed boolean;
  v_window timestamptz;
BEGIN
  IF p_identity_digest IS NULL OR p_identity_digest !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  SELECT max_requests_per_minute INTO v_limit
    FROM public.owner_v2_catalog_quota_policy
    WHERE singleton=1;
  IF v_limit IS NULL THEN RETURN false; END IF;
  -- Database clock and one atomic UPSERT across all API replicas.
  v_window:=date_trunc('minute',clock_timestamp());
  INSERT INTO public.owner_v2_catalog_quota_windows(identity_digest,window_start,uses)
    VALUES(p_identity_digest,v_window,1)
  ON CONFLICT(identity_digest,window_start) DO UPDATE
    SET uses=public.owner_v2_catalog_quota_windows.uses+1
    WHERE public.owner_v2_catalog_quota_windows.uses<v_limit
  RETURNING true INTO v_allowed;
  RETURN COALESCE(v_allowed,false);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_owner_v2_catalog_quota(char(64)) FROM PUBLIC;
-- An independent operator must set the approved policy row, allocate a
-- purpose-separated HMAC key, restrict the SQL role and GRANT EXECUTE only
-- after review. Expired rows need a separately approved cleanup job.
COMMIT;
