-- Review-only durable provider candidates. Requires ai_budget/provider_inputs.
-- Migration owner must be trusted NOLOGIN/BYPASSRLS as for the budget functions.
-- No role, approval, payload, timer, paid call or migration activation is seeded.
BEGIN;
CREATE TABLE api_ai_provider_results (
  job_id uuid PRIMARY KEY REFERENCES ai_budget_jobs(job_id),
  actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  session_id_hash text NOT NULL CHECK(session_id_hash ~ '^[A-Za-z0-9_.:@-]{8,128}$'),
  projection_id text NOT NULL REFERENCES api_ai_provider_inputs(projection_id),
  input_ref text NOT NULL CHECK(input_ref ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  operation text NOT NULL CHECK(operation IN ('OCR_GENERAL','HCX_005','HCX_007')),
  -- Preserve exact request formatting because the request fingerprint binds it.
  as_of text NOT NULL CHECK(length(as_of) BETWEEN 20 AND 40),
  phase_id text NOT NULL CHECK(phase_id ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9_.:@-]{1,128}$'),
  request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
  input_epoch text NOT NULL CHECK(input_epoch ~ '^input-[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  result_json jsonb CHECK(result_json IS NULL OR (jsonb_typeof(result_json)='object'
    AND octet_length(result_json::text)<=2097152 AND result_json ? 'reviewState'
    AND result_json->>'reviewState'='NEEDS_REVIEW')),
  erased_at timestamptz,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes'),
  CHECK((result_json IS NULL)=(erased_at IS NOT NULL)),
  CHECK(erased_at IS NULL OR erased_at>=created_at)
);
CREATE INDEX ai_provider_result_projection ON api_ai_provider_results(projection_id) WHERE erased_at IS NULL;
CREATE INDEX ai_provider_result_expiry ON api_ai_provider_results(expires_at,job_id) WHERE erased_at IS NULL;
ALTER TABLE api_ai_provider_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_ai_provider_results FORCE ROW LEVEL SECURITY;
REVOKE ALL ON api_ai_provider_results FROM PUBLIC;
-- No runtime policies/table privileges: functions below explicitly bind actor/session.
CREATE FUNCTION deny_ai_provider_result_mutation() RETURNS trigger
  LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL AND NEW.result_json IS NULL
    AND (to_jsonb(OLD)-ARRAY['result_json','erased_at']) IS NOT DISTINCT FROM (to_jsonb(NEW)-ARRAY['result_json','erased_at']) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'immutable provider result';
END;
$$;
REVOKE ALL ON FUNCTION deny_ai_provider_result_mutation() FROM PUBLIC;
CREATE TRIGGER immutable_ai_provider_result BEFORE UPDATE OR DELETE ON api_ai_provider_results
  FOR EACH ROW EXECUTE FUNCTION deny_ai_provider_result_mutation();

-- Internal helper, deliberately not granted to the runtime. Locks consent before
-- input/head and result rows, matching the consent-erasure trigger lock order.
CREATE FUNCTION ai_provider_result_input(p_ref text,p_operation text,p_asof text,p_epoch text,p_expiry timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who text:=current_setting('app.actor_id',true);c public.api_self_consents%ROWTYPE;
  h public.api_ai_provider_input_heads%ROWTYPE;p public.api_ai_provider_inputs%ROWTYPE;
  expected text;
BEGIN
  SELECT * INTO c FROM public.api_self_consents WHERE actor_id=who FOR SHARE;
  IF NOT FOUND OR NOT c.choices_json @> '{"personalStorage":true,"externalAi":true}'::jsonb THEN RAISE EXCEPTION 'Provider result unavailable'; END IF;
  SELECT * INTO h FROM public.api_ai_provider_input_heads
    WHERE actor_id=who AND input_ref=p_ref AND operation=p_operation FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Provider result unavailable'; END IF;
  SELECT * INTO p FROM public.api_ai_provider_inputs WHERE projection_id=h.projection_id FOR SHARE;
  IF NOT FOUND OR p.actor_id<>who OR p.input_ref<>p_ref OR p.operation<>p_operation OR p.erased_at IS NOT NULL
    OR p.approved_by=who OR p.privacy_review_ref IS NULL OR p.consent_version<>c.version::text
    OR p.as_of<>p_asof::timestamptz OR p.approved_at>p_asof::timestamptz OR c.updated_at>p.approved_at
    OR p.approved_at>clock_timestamp() OR p_asof::timestamptz>clock_timestamp()
    OR p.expires_at<=clock_timestamp() OR p_expiry>p.expires_at OR p_expiry<=clock_timestamp() THEN
    RAISE EXCEPTION 'Provider result unavailable';
  END IF;
  -- Same canonical epoch as PostgresProviderAuthority. IDs forbid the delimiter.
  expected:='input-'||encode(sha256(convert_to(p.projection_id||'|'||p.epoch||'|'||p.consent_version,'UTF8')),'hex');
  IF p_epoch IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Provider result unavailable'; END IF;
  RETURN p.projection_id;
END;
$$;
REVOKE ALL ON FUNCTION ai_provider_result_input(text,text,text,text,timestamptz) FROM PUBLIC;

CREATE FUNCTION ai_provider_result_put(p_value jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who text:=current_setting('app.actor_id',true);session_hash text:=current_setting('app.session_hash',true);
  projection text;expiry timestamptz;j public.ai_budget_jobs%ROWTYPE;r public.api_ai_provider_results%ROWTYPE;
  inserted integer;
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR octet_length(p_value::text)>2097152
    OR p_value-ARRAY['jobId','actorId','sessionIdHash','inputRef','operation','asOf','phaseId','idempotencyKey','requestSha256','inputEpoch','expiresAt','candidate']<>'{}'::jsonb
    OR coalesce(who,'') !~ '^[A-Za-z0-9_.:@-]{1,128}$' OR coalesce(session_hash,'') !~ '^[A-Za-z0-9_.:@-]{8,128}$'
    OR (p_value->>'actorId') IS DISTINCT FROM who OR (p_value->>'sessionIdHash') IS DISTINCT FROM session_hash
    OR coalesce(p_value->>'inputRef','') !~ '^[A-Za-z0-9_.:@-]{1,128}$'
    OR coalesce(p_value->>'phaseId','') !~ '^[A-Za-z0-9_.:@-]{1,128}$'
    OR coalesce(p_value->>'idempotencyKey','') !~ '^[A-Za-z0-9_.:@-]{1,128}$'
    OR coalesce(p_value->>'requestSha256','') !~ '^[a-f0-9]{64}$'
    OR coalesce(p_value->>'inputEpoch','') !~ '^input-[a-f0-9]{64}$'
    OR coalesce(p_value->>'operation','') NOT IN ('OCR_GENERAL','HCX_005','HCX_007')
    OR jsonb_typeof(p_value->'candidate') IS DISTINCT FROM 'object'
    OR (p_value->'candidate'->>'reviewState') IS DISTINCT FROM 'NEEDS_REVIEW' THEN RAISE EXCEPTION 'Provider result unavailable'; END IF;
  expiry:=(p_value->>'expiresAt')::timestamptz;
  IF expiry IS NULL OR expiry<=clock_timestamp() OR expiry>clock_timestamp()+interval '30 minutes'
    OR (p_value->>'asOf') IS NULL OR length(p_value->>'asOf') NOT BETWEEN 20 AND 40 THEN RAISE EXCEPTION 'Provider result unavailable'; END IF;
  projection:=public.ai_provider_result_input(p_value->>'inputRef',p_value->>'operation',p_value->>'asOf',p_value->>'inputEpoch',expiry);
  SELECT * INTO j FROM public.ai_budget_jobs WHERE job_id=(p_value->>'jobId')::uuid FOR SHARE;
  IF NOT FOUND OR j.actor_id<>who OR j.phase_id<>p_value->>'phaseId' OR j.task<>p_value->>'operation'
    OR j.idempotency_key<>p_value->>'idempotencyKey' OR j.request_sha256<>p_value->>'requestSha256' OR j.state<>'SETTLED' THEN RAISE EXCEPTION 'Provider result unavailable'; END IF;
  INSERT INTO public.api_ai_provider_results(job_id,actor_id,session_id_hash,projection_id,input_ref,operation,as_of,phase_id,idempotency_key,request_sha256,input_epoch,expires_at,result_json)
    VALUES(j.job_id,who,session_hash,projection,p_value->>'inputRef',p_value->>'operation',p_value->>'asOf',j.phase_id,j.idempotency_key,j.request_sha256,p_value->>'inputEpoch',expiry,p_value->'candidate')
    ON CONFLICT(job_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  SELECT * INTO r FROM public.api_ai_provider_results WHERE job_id=j.job_id FOR SHARE;
  IF NOT FOUND OR r.erased_at IS NOT NULL OR r.actor_id<>who OR r.session_id_hash<>session_hash OR r.projection_id<>projection
    OR r.input_ref<>p_value->>'inputRef' OR r.operation<>p_value->>'operation' OR r.as_of<>p_value->>'asOf'
    OR r.phase_id<>j.phase_id OR r.idempotency_key<>j.idempotency_key OR r.request_sha256<>j.request_sha256
    OR r.input_epoch<>p_value->>'inputEpoch' OR r.expires_at<>expiry OR r.result_json IS DISTINCT FROM p_value->'candidate' THEN
    RAISE EXCEPTION 'Provider result unavailable';
  END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Provider result unavailable';
END;
$$;
REVOKE ALL ON FUNCTION ai_provider_result_put(jsonb) FROM PUBLIC;

CREATE FUNCTION ai_provider_result_get(p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who text:=current_setting('app.actor_id',true);session_hash text:=current_setting('app.session_hash',true);
  r public.api_ai_provider_results%ROWTYPE;j public.ai_budget_jobs%ROWTYPE;projection text;
BEGIN
  IF coalesce(who,'') !~ '^[A-Za-z0-9_.:@-]{1,128}$' OR coalesce(session_hash,'') !~ '^[A-Za-z0-9_.:@-]{8,128}$' THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.api_ai_provider_results WHERE job_id=p_job AND actor_id=who AND session_id_hash=session_hash;
  IF NOT FOUND OR r.erased_at IS NOT NULL OR r.expires_at<=clock_timestamp() THEN RETURN NULL; END IF;
  BEGIN
    projection:=public.ai_provider_result_input(r.input_ref,r.operation,r.as_of,r.input_epoch,r.expires_at);
  EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
  IF projection<>r.projection_id THEN RETURN NULL; END IF;
  SELECT * INTO j FROM public.ai_budget_jobs WHERE job_id=p_job FOR SHARE;
  IF NOT FOUND OR j.state<>'SETTLED' OR j.actor_id<>who OR j.phase_id<>r.phase_id OR j.task<>r.operation
    OR j.idempotency_key<>r.idempotency_key OR j.request_sha256<>r.request_sha256 THEN RETURN NULL; END IF;
  -- Input erasure locks above prevent concurrent consent scrubbing. TTL pruning
  -- can still race, so reread/lock the result only after locking input authority.
  SELECT * INTO r FROM public.api_ai_provider_results WHERE job_id=p_job AND actor_id=who AND session_id_hash=session_hash FOR SHARE;
  IF NOT FOUND OR r.erased_at IS NOT NULL OR r.result_json IS NULL OR r.expires_at<=clock_timestamp() THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('jobId',r.job_id,'actorId',r.actor_id,'sessionIdHash',r.session_id_hash,'inputRef',r.input_ref,
    'operation',r.operation,'asOf',r.as_of,'phaseId',r.phase_id,'idempotencyKey',r.idempotency_key,'requestSha256',r.request_sha256,
    'inputEpoch',r.input_epoch,'expiresAt',to_char(r.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'candidate',r.result_json);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Provider result unavailable';
END;
$$;
REVOKE ALL ON FUNCTION ai_provider_result_get(uuid) FROM PUBLIC;

CREATE FUNCTION erase_ai_provider_results_for_input() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE public.api_ai_provider_results SET result_json=NULL,erased_at=clock_timestamp()
    WHERE projection_id=NEW.projection_id AND erased_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION erase_ai_provider_results_for_input() FROM PUBLIC;
CREATE TRIGGER erased_ai_input_scrubs_results AFTER UPDATE OF erased_at ON api_ai_provider_inputs
  FOR EACH ROW WHEN(OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL)
  EXECUTE FUNCTION erase_ai_provider_results_for_input();

CREATE FUNCTION ai_provider_results_prune(p_limit integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pruned integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Provider result unavailable'; END IF;
  WITH expired AS (SELECT job_id FROM public.api_ai_provider_results
    WHERE erased_at IS NULL AND expires_at<=clock_timestamp() ORDER BY expires_at,job_id FOR UPDATE SKIP LOCKED LIMIT p_limit)
  UPDATE public.api_ai_provider_results r SET result_json=NULL,erased_at=clock_timestamp()
    FROM expired e WHERE r.job_id=e.job_id;
  GET DIAGNOSTICS pruned=ROW_COUNT;RETURN pruned;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Provider result unavailable';
END;
$$;
REVOKE ALL ON FUNCTION ai_provider_results_prune(integer) FROM PUBLIC;
-- Runtime: explicitly grant EXECUTE only on ai_provider_result_put(jsonb) and
-- ai_provider_result_get(uuid). Maintenance may separately receive prune(integer).
-- Do not grant table access or internal/trigger function execution to runtime.
-- Before disclosing any get result, executor rechecks current session, full
-- source/grant authority and pricing/request fingerprint. This table is no grant.
COMMIT;
