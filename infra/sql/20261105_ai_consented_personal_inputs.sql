-- Extends the input classification after completed project authorization.
-- Requires 20261103_ai_provider_inputs.sql. No data, role grant, source claim,
-- consent, or provider credential is manufactured by this migration.
BEGIN;
ALTER TABLE public.api_ai_provider_inputs
  DROP CONSTRAINT api_ai_provider_inputs_input_class_check;
ALTER TABLE public.api_ai_provider_inputs
  ADD CONSTRAINT api_ai_provider_inputs_input_class_check CHECK (
    input_class IN ('PUBLIC_CLEARED','SYNTHETIC_CLEARED',
      'NON_IDENTIFYING_REVIEWED','PERSONAL_CONSENTED_CLEARED')
  );
-- Existing FORCE RLS, immutable payload and withdrawal-erasure triggers stay.
COMMIT;
