-- HUFS One AI: Google OIDC callback state and server-side browser sessions.
-- Reviewed migration candidate only: no database or cloud resource is changed.
-- Service roles must be distinct; no public DB connections are allowed.
BEGIN;

CREATE TABLE IF NOT EXISTS google_login_attempts(
  state_digest char(64) PRIMARY KEY,
  browser_digest char(64) NOT NULL,
  nonce varchar(43) NOT NULL,
  code_verifier varchar(43) NOT NULL,
  intent text NOT NULL CHECK(intent IN('REVIEWER','BETA')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT google_login_ttl CHECK(
    expires_at>created_at
    AND expires_at<=created_at+interval '5 minutes'),
  CONSTRAINT google_login_digest_shape CHECK(
    state_digest ~ '^[0123456789abcdef]{64}$'
    AND browser_digest ~ '^[0123456789abcdef]{64}$'),
  CONSTRAINT google_login_nonce_shape CHECK(
    nonce ~ '^[A-Za-z0-9_-]{43}$'
    AND code_verifier ~ '^[A-Za-z0-9_-]{43}$')
);

CREATE TABLE IF NOT EXISTS google_app_sessions(
  token_digest char(64) PRIMARY KEY,
  actor_payload jsonb NOT NULL CHECK(jsonb_typeof(actor_payload)='object'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT google_session_ttl CHECK(
    expires_at>created_at
    AND expires_at<=created_at+interval '60 minutes'),
  CONSTRAINT google_session_digest_shape CHECK(
    token_digest ~ '^[0123456789abcdef]{64}$')
);
CREATE INDEX IF NOT EXISTS google_login_expiry
  ON google_login_attempts(expires_at);
CREATE INDEX IF NOT EXISTS google_session_expiry
  ON google_app_sessions(expires_at)
  WHERE revoked_at IS NULL;

REVOKE ALL ON TABLE google_login_attempts FROM PUBLIC;
REVOKE ALL ON TABLE google_app_sessions FROM PUBLIC;
-- Only a dedicated API DB role may read/write. Apply explicit GRANT after
-- operator review, migration dry-run and permission checks.
-- Expired login attempts and sessions require bounded maintenance cleanup.
-- Avoid recording token/nonce/code-verifier/CSRF or raw identity in SQL logs.
COMMIT;
