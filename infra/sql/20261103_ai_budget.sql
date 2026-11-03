-- Review-only, no automatic application or activation. Integer micro-KRW, not tariff data.
-- Requires trusted migration owner with BYPASSRLS (NOLOGIN outside migration tooling).
-- Runtime gets EXECUTE on the two functions only, no table DML/configuration rights.
BEGIN;
CREATE TABLE ai_budget_phases (
  phase_id text PRIMARY KEY CHECK (phase_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  enabled boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK (ends_at>starts_at),
  max_units bigint NOT NULL DEFAULT 0 CHECK (max_units BETWEEN 0 AND 1000000000000),
  actor_max_units bigint NOT NULL DEFAULT 0 CHECK (actor_max_units BETWEEN 0 AND 1000000000000),
  max_attempts integer NOT NULL DEFAULT 0 CHECK (max_attempts BETWEEN 0 AND 1000000),
  actor_max_attempts integer NOT NULL DEFAULT 0 CHECK (actor_max_attempts BETWEEN 0 AND 1000000),
  reserved_units bigint NOT NULL DEFAULT 0 CHECK (reserved_units>=0),
  charged_units numeric(30,0) NOT NULL DEFAULT 0 CHECK (charged_units>=0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0)
);
CREATE TABLE ai_budget_actors (
  phase_id text NOT NULL REFERENCES ai_budget_phases(phase_id),actor_id text NOT NULL,
  reserved_units bigint NOT NULL DEFAULT 0 CHECK (reserved_units>=0),
  charged_units numeric(30,0) NOT NULL DEFAULT 0 CHECK (charged_units>=0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  PRIMARY KEY(phase_id,actor_id)
);
CREATE TABLE ai_budget_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),phase_id text NOT NULL,actor_id text NOT NULL,
  task text NOT NULL CHECK (task IN ('OCR_GENERAL','HCX_005','HCX_007')),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  worst_case_units bigint NOT NULL CHECK (worst_case_units BETWEEN 1 AND 1000000000000),
  state text NOT NULL CHECK (state IN ('RESERVED','DISPATCHED','UNKNOWN_BILLING','RELEASED','SETTLED')),
  charged_units bigint CHECK (charged_units BETWEEN 0 AND 9007199254740991),
  receipt_sha256 text CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(phase_id,actor_id) REFERENCES ai_budget_actors(phase_id,actor_id),
  UNIQUE(phase_id,actor_id,task,idempotency_key),
  CHECK ((state='SETTLED')=(charged_units IS NOT NULL)),
  CHECK ((state='SETTLED')=(receipt_sha256 IS NOT NULL))
);
ALTER TABLE ai_budget_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_phases FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_actors FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_jobs FORCE ROW LEVEL SECURITY;
-- No runtime table policies/grants: all default-deny. Functions explicitly bind the actor.
REVOKE ALL ON ai_budget_phases,ai_budget_actors,ai_budget_jobs FROM PUBLIC;

CREATE FUNCTION ai_budget_reserve(p_phase text,p_task text,p_key text,p_hash text,p_units bigint)
RETURNS TABLE(job_id uuid,state text,worst_case_units bigint,charged_units bigint,changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.ai_budget_phases%ROWTYPE;a public.ai_budget_actors%ROWTYPE;
  j public.ai_budget_jobs%ROWTYPE;who text:=current_setting('app.actor_id',true);
BEGIN
  IF who IS NULL OR who !~ '^[A-Za-z0-9_.:-]{1,128}$'
    OR p_task IS NULL OR p_task NOT IN ('OCR_GENERAL','HCX_005','HCX_007')
    OR p_key IS NULL OR p_key !~ '^[A-Za-z0-9_.:-]{1,128}$'
    OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
    OR p_units IS NULL OR p_units NOT BETWEEN 1 AND 1000000000000 THEN
    RAISE EXCEPTION 'AI budget operation denied';
  END IF;
  SELECT * INTO p FROM public.ai_budget_phases ph WHERE ph.phase_id=p_phase FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI budget operation denied'; END IF;
  -- All state-changing operations lock phase first, so shared caps and idempotency serialize.
  SELECT * INTO j FROM public.ai_budget_jobs b
    WHERE b.phase_id=p_phase AND b.actor_id=who AND b.task=p_task AND b.idempotency_key=p_key;
  IF FOUND THEN
    IF j.request_sha256<>p_hash OR j.worst_case_units<>p_units THEN RAISE EXCEPTION 'AI budget operation denied'; END IF;
    RETURN QUERY SELECT j.job_id,j.state,j.worst_case_units,j.charged_units,false;RETURN;
  END IF;
  IF NOT p.enabled OR clock_timestamp()<p.starts_at OR clock_timestamp()>=p.ends_at
    OR p.reserved_units+p.charged_units+p_units>p.max_units OR p.attempts>=p.max_attempts THEN
    RAISE EXCEPTION 'AI budget operation denied';
  END IF;
  INSERT INTO public.ai_budget_actors(phase_id,actor_id) VALUES(p_phase,who) ON CONFLICT DO NOTHING;
  SELECT * INTO a FROM public.ai_budget_actors b WHERE b.phase_id=p_phase AND b.actor_id=who FOR UPDATE;
  IF a.reserved_units+a.charged_units+p_units>p.actor_max_units OR a.attempts>=p.actor_max_attempts THEN
    RAISE EXCEPTION 'AI budget operation denied';
  END IF;
  UPDATE public.ai_budget_phases b SET reserved_units=b.reserved_units+p_units,attempts=b.attempts+1 WHERE b.phase_id=p_phase;
  UPDATE public.ai_budget_actors b SET reserved_units=b.reserved_units+p_units,attempts=b.attempts+1 WHERE b.phase_id=p_phase AND b.actor_id=who;
  INSERT INTO public.ai_budget_jobs(phase_id,actor_id,task,idempotency_key,request_sha256,worst_case_units,state)
    VALUES(p_phase,who,p_task,p_key,p_hash,p_units,'RESERVED') RETURNING * INTO j;
  RETURN QUERY SELECT j.job_id,j.state,j.worst_case_units,j.charged_units,true;
END;
$$;

CREATE FUNCTION ai_budget_transition(p_phase text,p_job uuid,p_hash text,p_action text,p_actual bigint,p_receipt text)
RETURNS TABLE(job_id uuid,state text,worst_case_units bigint,charged_units bigint,changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.ai_budget_phases%ROWTYPE;j public.ai_budget_jobs%ROWTYPE;
  who text:=current_setting('app.actor_id',true);
BEGIN
  IF who IS NULL OR who !~ '^[A-Za-z0-9_.:-]{1,128}$' OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
    OR p_action IS NULL OR p_action NOT IN ('DISPATCHED','UNKNOWN_BILLING','RELEASED','SETTLED') THEN
    RAISE EXCEPTION 'AI budget operation denied';
  END IF;
  IF p_action='SETTLED' THEN
    IF p_actual IS NULL OR p_actual NOT BETWEEN 0 AND 9007199254740991 OR p_receipt IS NULL OR p_receipt !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'AI budget operation denied';
    END IF;
  ELSIF p_actual IS NOT NULL OR p_receipt IS NOT NULL THEN RAISE EXCEPTION 'AI budget operation denied'; END IF;
  SELECT * INTO p FROM public.ai_budget_phases b WHERE b.phase_id=p_phase FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI budget operation denied'; END IF;
  SELECT * INTO j FROM public.ai_budget_jobs b WHERE b.phase_id=p_phase AND b.actor_id=who AND b.job_id=p_job FOR UPDATE;
  IF NOT FOUND OR j.request_sha256<>p_hash THEN RAISE EXCEPTION 'AI budget operation denied'; END IF;
  IF j.state=p_action THEN
    IF p_action='SETTLED' AND (j.charged_units<>p_actual OR j.receipt_sha256<>p_receipt) THEN
      RAISE EXCEPTION 'AI budget operation denied';
    END IF;
    RETURN QUERY SELECT j.job_id,j.state,j.worst_case_units,j.charged_units,false;RETURN;
  END IF;
  IF p_action='DISPATCHED' THEN
    IF j.state<>'RESERVED' OR NOT p.enabled OR clock_timestamp()<p.starts_at OR clock_timestamp()>=p.ends_at THEN
      RAISE EXCEPTION 'AI budget operation denied';
    END IF;
  ELSIF p_action='RELEASED' THEN
    IF j.state<>'RESERVED' THEN RAISE EXCEPTION 'AI budget operation denied'; END IF;
    UPDATE public.ai_budget_phases b SET reserved_units=b.reserved_units-j.worst_case_units,attempts=b.attempts-1 WHERE b.phase_id=p_phase;
    UPDATE public.ai_budget_actors b SET reserved_units=b.reserved_units-j.worst_case_units,attempts=b.attempts-1 WHERE b.phase_id=p_phase AND b.actor_id=who;
  ELSIF p_action='UNKNOWN_BILLING' THEN
    IF j.state<>'DISPATCHED' THEN RAISE EXCEPTION 'AI budget operation denied'; END IF;
  ELSIF p_action='SETTLED' THEN
    IF j.state NOT IN ('DISPATCHED','UNKNOWN_BILLING') THEN RAISE EXCEPTION 'AI budget operation denied'; END IF;
    UPDATE public.ai_budget_phases b SET reserved_units=b.reserved_units-j.worst_case_units,charged_units=b.charged_units+p_actual,
      enabled=b.enabled AND p_actual<=j.worst_case_units WHERE b.phase_id=p_phase;
    UPDATE public.ai_budget_actors b SET reserved_units=b.reserved_units-j.worst_case_units,charged_units=b.charged_units+p_actual WHERE b.phase_id=p_phase AND b.actor_id=who;
  END IF;
  UPDATE public.ai_budget_jobs b SET state=p_action,charged_units=p_actual,receipt_sha256=p_receipt,updated_at=clock_timestamp()
    WHERE b.job_id=j.job_id RETURNING * INTO j;
  RETURN QUERY SELECT j.job_id,j.state,j.worst_case_units,j.charged_units,true;
END;
$$;
REVOKE ALL ON FUNCTION ai_budget_reserve(text,text,text,text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_budget_transition(text,uuid,text,text,bigint,text) FROM PUBLIC;
COMMIT;
-- After independent migration review, operator provisions a bounded phase explicitly.
-- Runtime role: USAGE public + EXECUTE only these two functions; never table DML.
-- Phase is not enabled by deploying code or importing this file.
