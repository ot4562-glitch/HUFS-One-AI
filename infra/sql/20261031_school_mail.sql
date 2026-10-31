-- HUFS One AI: 8-digit school-mail challenges and atomic issuance throttling.
-- Migration proposal only. No live database is modified by this file.
BEGIN;
CREATE TABLE IF NOT EXISTS beta_mail_issue_windows (
  google_subject varchar(255) PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  issued_count integer NOT NULL CHECK(issued_count BETWEEN 1 AND 3)
);
CREATE TABLE IF NOT EXISTS beta_mail_challenges (
  challenge_id varchar(22) PRIMARY KEY,
  google_subject varchar(255) NOT NULL,
  school_email varchar(254) NOT NULL,
  proof_digest char(64) NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  used_at timestamptz,
  CONSTRAINT beta_mail_challenge_ttl CHECK(
    expires_at=created_at+interval '10 minutes'),
  CONSTRAINT beta_mail_code_shape CHECK(
    proof_digest ~ '^[0123456789abcdef]{64}$'),
  CONSTRAINT beta_mail_domain CHECK(
    school_email=lower(btrim(school_email)) AND
    school_email ~ '^[^[:space:]@]+@hufs[.]ac[.]kr$')
);
CREATE INDEX IF NOT EXISTS beta_mail_expiry
  ON beta_mail_challenges(expires_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS beta_mail_window_cleanup
  ON beta_mail_issue_windows(window_started_at);
REVOKE ALL ON TABLE beta_mail_issue_windows FROM PUBLIC;
REVOKE ALL ON TABLE beta_mail_challenges FROM PUBLIC;
-- API can write challenges only with a restricted DB role.
-- Student-facing HTTP clients never receive DB privileges.
-- Only a trusted administrative process can preapprove beta_school_proofs;
-- OTP completion is UPDATE-only against that exact approval.
-- Periodically clean expired challenges and completed windows.
COMMIT;
