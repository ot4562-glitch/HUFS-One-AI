-- #445/#449: NCP-private, conservative per-source/per-origin daily admission.
-- Review/apply separately; only a dedicated worker role receives EXECUTE.
-- No URL, source text, student identity or provider credential is stored here.
BEGIN;
CREATE TABLE IF NOT EXISTS public.source_refresh_daily_budget (
  scope_key text NOT NULL CHECK(scope_key ~ '^(SOURCE|ORIGIN):[a-f0-9]{64}$'),
  budget_day date NOT NULL,
  attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 10000),
  reserved_bytes bigint NOT NULL CHECK(reserved_bytes BETWEEN 0 AND 10737418240),
  PRIMARY KEY(scope_key,budget_day)
);
REVOKE ALL ON TABLE public.source_refresh_daily_budget FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.reserve_source_refresh_budget(
  p_source text,p_origin text,p_source_requests integer,p_source_bytes bigint,
  p_origin_requests integer,p_origin_bytes bigint,p_request_bytes integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE
  v_day date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  v_source public.source_refresh_daily_budget%ROWTYPE;
  v_origin public.source_refresh_daily_budget%ROWTYPE;
BEGIN
  IF p_source IS NULL OR p_source !~ '^SOURCE:[a-f0-9]{64}$'
    OR p_origin IS NULL OR p_origin !~ '^ORIGIN:[a-f0-9]{64}$'
    OR p_source_requests IS NULL OR p_source_requests NOT BETWEEN 1 AND 10000
    OR p_origin_requests IS NULL OR p_origin_requests NOT BETWEEN 1 AND 10000
    OR p_source_bytes IS NULL OR p_source_bytes NOT BETWEEN 262144 AND 10737418240
    OR p_origin_bytes IS NULL OR p_origin_bytes NOT BETWEEN 262144 AND 10737418240
    OR p_request_bytes IS NULL OR p_request_bytes <> 262144 THEN
    RAISE EXCEPTION 'Source refresh budget unavailable';
  END IF;
  -- All callers insert/lock in the same lexical order (ORIGIN before SOURCE).
  -- Concurrent different sources sharing an origin cannot overspend that row.
  INSERT INTO public.source_refresh_daily_budget(scope_key,budget_day,attempts,reserved_bytes)
    SELECT key,v_day,0,0 FROM unnest(ARRAY[p_source,p_origin]) AS keys(key) ORDER BY key
    ON CONFLICT DO NOTHING;
  PERFORM scope_key FROM public.source_refresh_daily_budget
    WHERE budget_day=v_day AND scope_key IN (p_source,p_origin)
    ORDER BY scope_key FOR UPDATE;
  SELECT * INTO STRICT v_source FROM public.source_refresh_daily_budget
    WHERE scope_key=p_source AND budget_day=v_day;
  SELECT * INTO STRICT v_origin FROM public.source_refresh_daily_budget
    WHERE scope_key=p_origin AND budget_day=v_day;
  IF v_source.attempts>=p_source_requests OR v_origin.attempts>=p_origin_requests
    OR v_source.reserved_bytes>p_source_bytes-p_request_bytes
    OR v_origin.reserved_bytes>p_origin_bytes-p_request_bytes THEN RETURN false; END IF;
  UPDATE public.source_refresh_daily_budget
    SET attempts=attempts+1,reserved_bytes=reserved_bytes+p_request_bytes
    WHERE budget_day=v_day AND scope_key IN (p_source,p_origin);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_source_refresh_budget(text,text,integer,bigint,integer,bigint,integer) FROM PUBLIC;
COMMIT;
