-- HUFS One AI: shared, privacy-preserving auth brute-force windows.
-- Proposed migration only. Apply explicit API GRANT after operator review.
-- All caller identities are HMAC digests; never persist raw IP, email or Google sub.
BEGIN;
CREATE TABLE IF NOT EXISTS auth_attempt_windows (
  kind text NOT NULL CHECK (kind IN (
    'GOOGLE_START','GOOGLE_CALLBACK','REVIEWER_REDEEM',
    'SCHOOL_OTP_ISSUE','SCHOOL_OTP_CONFIRM')),
  identity_digest char(64) NOT NULL
    CHECK (identity_digest ~ '^[0123456789abcdef]{64}$'),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 100),
  PRIMARY KEY (kind, identity_digest, window_started_at)
);
CREATE INDEX IF NOT EXISTS auth_attempt_window_cleanup
  ON auth_attempt_windows(window_started_at);
REVOKE ALL ON TABLE auth_attempt_windows FROM PUBLIC;
-- Cleanup via an approved bounded maintenance job (never an HTTP request).
-- Retain at least the longest enforcement window + permitted clock skew.
COMMIT;
