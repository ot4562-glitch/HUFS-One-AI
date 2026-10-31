-- HUFS One AI REVIEWER shared invitation, identity-bound enrollment.
-- New, pre-deployment schema: do NOT apply to a live database without migration review.
-- Internet-facing users must never have direct SELECT/INSERT/UPDATE grants.
BEGIN;
CREATE TABLE IF NOT EXISTS reviewer_invitations (
  id text PRIMARY KEY,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  label varchar(100) NOT NULL,
  max_accounts integer NOT NULL DEFAULT 20
    CHECK (max_accounts BETWEEN 1 AND 50),
  token_digest char(64) NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  CONSTRAINT reviewer_period_valid CHECK (
    ends_at > starts_at AND ends_at <= starts_at + interval '45 days'
  ),
  CONSTRAINT reviewer_hash_hex CHECK (token_digest ~ '^[0123456789abcdef]{64}$')
);
CREATE TABLE IF NOT EXISTS reviewer_enrollments (
  invite_id text NOT NULL REFERENCES reviewer_invitations(id),
  actor_id text NOT NULL,                -- verified OIDC sub, never request data
  verified_email varchar(254) NOT NULL, -- established AFTER user signs in
  enrolled_at timestamptz NOT NULL,
  PRIMARY KEY(invite_id,actor_id),
  CONSTRAINT reviewer_email_canonical CHECK
    (verified_email=lower(btrim(verified_email)))
);
CREATE INDEX IF NOT EXISTS reviewer_enrollments_actor
  ON reviewer_enrollments(actor_id,verified_email);
CREATE INDEX IF NOT EXISTS reviewer_invitations_expiry
  ON reviewer_invitations(ends_at) WHERE revoked_at IS NULL;
REVOKE ALL ON TABLE reviewer_invitations FROM PUBLIC;
REVOKE ALL ON TABLE reviewer_enrollments FROM PUBLIC;
-- Operator identity needs issuance/revocation grants, API service limited to
-- token redemption and grant reads. Use separate DB roles and TLS.
-- Access is cut off by starts_at <= now < ends_at or revoked_at IS NOT NULL
-- on EACH request; do not rely on a cron job to delete records.
COMMIT;
