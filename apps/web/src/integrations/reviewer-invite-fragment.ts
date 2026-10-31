/**
 * Pure browser adapter for the operator-approved REVIEWER invite URL:
 *     /reviewer/invite#code=<43 base64url chars>
 *
 * Install on the first synchronous UI entry to that route, BEFORE analytics,
 * network requests, or OAuth navigation. Only the returned JS string may be
 * passed to HufsApiClient.redeemReviewerInvite() as a CSRF-protected POST body.
 * Never save it in sessionStorage, localStorage, history.state or app telemetry.
 *
 * An unauthenticated Google redirect unloads this in-memory code. The UI must
 * ask the person to reopen the original invitation after sign-in, rather than
 * persisting a bearer credential to recover it.
 */
export interface InviteBrowserPort {
  location:Pick<Location,'origin'|'pathname'|'search'|'hash'>;
  history:Pick<History,'replaceState'>;
}
const CODE=/^#code=([A-Za-z0-9_-]{43})$/;

export function consumeReviewerInviteFragment(
  port:InviteBrowserPort,allowedOrigin:string,
):string|null {
  if(!port || !port.location || !port.history
    || typeof port.history.replaceState!=='function'
    ||typeof allowedOrigin!=='string'
    ||!/^https:\/\/[^/?#]+$/.test(allowedOrigin)
    ||port.location.origin!==allowedOrigin
    ||port.location.pathname!=='/reviewer/invite')
    return null;

  // Capture only the fragment, never an enrollment code from the query string.
  const raw=port.location.hash;
  // Do not leave an invalid/duplicate fragment or a query token in browser
  // history. Replacing with a static path prevents URL/analytics/referrer leaks.
  if(raw || port.location.search) {
    try {
      port.history.replaceState(null,'','/reviewer/invite');
    }catch {
      // If URL redaction fails, do not hand the credential to the application.
      return null;
    }
  }
  // Authentication state is NOT created by this fragment.
  const match=CODE.exec(raw);
  return match?.[1]??null;
}
