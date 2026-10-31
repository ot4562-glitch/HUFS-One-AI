-- HUFS One AI: separately approved BETA identity / HUFS mailbox proof ledger.
-- Migration DRAFT: do not execute on production without operator review.
-- No user-facing API for inserting records; approval / mailbox verification
-- only through a trusted, separately reviewed admin or OTP backend.
BEGIN;
CREATE TABLE IF NOT EXISTS beta_school_proofs (
  google_subject varchar(255) PRIMARY KEY,
  school_email varchar(254) NOT NULL,
  method text NOT NULL CHECK (method IN ('SIGNED_WORKSPACE','MAILBOX_OTP')),
  proof_verified_at timestamptz NOT NULL,
  proof_expires_at timestamptz NOT NULL,
  approved_until timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT beta_school_domain CHECK (
    school_email=lower(btrim(school_email)) AND
    school_email ~ '^[^[:space:]@]+@hufs[.]ac[.]kr$'),
  CONSTRAINT beta_school_proof_window CHECK (
    proof_expires_at>proof_verified_at AND
    proof_expires_at<=proof_verified_at+interval '24 hours'),
  CONSTRAINT beta_school_approval_window CHECK (
    approved_until>proof_verified_at)
);
CREATE INDEX IF NOT EXISTS beta_school_proof_expires
  ON beta_school_proofs(proof_expires_at,approved_until)
  WHERE revoked_at IS NULL;
REVOKE ALL ON TABLE beta_school_proofs FROM PUBLIC;
-- Only the trusted admission service can insert/update/revoke; the HTTP API
-- uses a separate read-only role. It cannot mint its own mailbox evidence.
-- Before launch: implement verified school mail OTP or Google Workspace proof,
-- explicitly approve authorized Google subjects, and test revocation in PG.
COMMIT;
