/**
 * Student-facing copy boundary (#298): internal synthetic fixture keys may help
 * local E2E diagnostics but are not meaningful academic/course labels.
 *
 * Never make a guessed real subject/course name from an identifier; preserve
 * UNKNOWN and evidence state in the view, and suppress only the raw key in builds.
 * Access control is still the API/server's responsibility, not this display helper.
 */
export function studentFacingText(text: string): string {
  if (import.meta.env.DEV) return text;
  return text
    .replace(/\bSYN-[A-Za-z0-9][A-Za-z0-9_-]*\b/g, '검증 전 항목')
    .replace(/\bBETA_OVERLAY:\d+\b/g, '설정 변경 내역');
}
