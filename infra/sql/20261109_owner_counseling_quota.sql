-- #433: operator-reviewed, replica-shared per-actor counseling lookup quota.
-- Synthetic tests do not apply this migration; production operator must review and grant
-- EXECUTE to a dedicated SQL role after inspecting ownership, expiry policy, and WAF limits.
-- No raw actor IDs or student records are stored; API supplies an HMAC-SHA256 digest.
BEGIN;
CREATE TABLE IF NOT EXISTS public.owner_counseling_quota_windows (
  identity_digest char(64) NOT NULL CHECK(identity_digest ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  uses integer NOT NULL CHECK(uses BETWEEN 1 AND 30),
  PRIMARY KEY (identity_digest,window_start)
);
CREATE INDEX IF NOT EXISTS owner_counseling_quota_cleanup
  ON public.owner_counseling_quota_windows(window_start);
REVOKE ALL ON TABLE public.owner_counseling_quota_windows FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.consume_owner_counseling_quota(p_identity_digest char(64))
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $$
DECLARE
  v_allowed boolean;
  v_window timestamptz;
BEGIN
  IF p_identity_digest IS NULL OR p_identity_digest !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  -- Database time, not an untrusted browser/API replica clock.
  v_window:=date_trunc('minute',clock_timestamp());
  INSERT INTO public.owner_counseling_quota_windows(identity_digest,window_start,uses)
    VALUES(p_identity_digest,v_window,1)
  ON CONFLICT(identity_digest,window_start) DO UPDATE
    SET uses=public.owner_counseling_quota_windows.uses+1
    WHERE public.owner_counseling_quota_windows.uses<30
  RETURNING true INTO v_allowed;
  RETURN COALESCE(v_allowed,false);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_owner_counseling_quota(char(64)) FROM PUBLIC;
-- GRANT EXECUTE to the independently approved operator role only; no auto-GRANT.
-- Retention cleanup for expired minute buckets requires a separately authorized job.
COMMIT;
