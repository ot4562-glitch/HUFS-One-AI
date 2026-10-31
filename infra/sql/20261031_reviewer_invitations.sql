-- HUFS One AI — REVIEWER invitation enrollment and time-boxed access.
-- Apply only after database/identity/security review. No NCP resources created.
-- Use a private service-owned schema/database; never expose this relation to web users.
BEGIN;

CREATE TABLE IF NOT EXISTS reviewer_invitations (
  id text PRIMARY KEY,
  recipient_email varchar(254) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  label varchar(100) NOT NULL,
  token_digest char(64) NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL,
  enrolled_actor_id text NULL,
  enrolled_at timestamptz NULL,
  revoked_at timestamptz NULL,
  CONSTRAINT reviewer_period_valid CHECK (
    ends_at > starts_at
    AND ends_at <= starts_at + interval '45 days'
  ),
  CONSTRAINT reviewer_email_canonical CHECK (
    recipient_email = lower(btrim(recipient_email))
  ),
  CONSTRAINT reviewer_token_digest_hex CHECK (
    token_digest ~ '^[0123456789abcdef]{64}$'
  ),
  CONSTRAINT reviewer_enrollment_pair CHECK (
    (enrolled_actor_id IS NULL AND enrolled_at IS NULL) OR
    (enrolled_actor_id IS NOT NULL AND enrolled_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS reviewer_invitations_actor_email
  ON reviewer_invitations(enrolled_actor_id, recipient_email, ends_at DESC)
  WHERE enrolled_actor_id IS NOT NULL AND revoked_at IS NULL;

REVOKE ALL ON TABLE reviewer_invitations FROM PUBLIC;
-- Database owner grants only SELECT, INSERT, UPDATE to the dedicated API service
-- role. Migration privileges must not be shared with the internet-facing identity.
COMMIT;
