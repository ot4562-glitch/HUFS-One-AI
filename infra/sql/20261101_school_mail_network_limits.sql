-- Forward migration for already-installed auth attempt windows.
-- Reviewed application roles remain unchanged; no mail/network activity.
BEGIN;
ALTER TABLE auth_attempt_windows
  DROP CONSTRAINT auth_attempt_windows_kind_check;
ALTER TABLE auth_attempt_windows
  ADD CONSTRAINT auth_attempt_windows_kind_check CHECK (kind IN (
    'GOOGLE_START','GOOGLE_CALLBACK','REVIEWER_REDEEM',
    'SCHOOL_OTP_ISSUE','SCHOOL_OTP_CONFIRM','SCHOOL_OTP_ISSUE_IP',
    'SCHOOL_OTP_ISSUE_GLOBAL','SCHOOL_OTP_CONFIRM_IP'));
COMMIT;
