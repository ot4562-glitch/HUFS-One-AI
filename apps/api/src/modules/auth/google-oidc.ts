import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {createRemoteJWKSet, jwtVerify} from 'jose';
import type {JWTVerifyGetKey} from 'jose';

/**
 * A fail-closed, provider-neutral Google identity verification boundary.
 * This module validates a code-flow ID token ONLY after the server has
 * exchanged an authorization code bound to an independently stored PKCE
 * verifier, one-time state, and nonce.
 *
 * It does NOT issue app sessions or decide user roles. That requires the
 * server-side session/OTP/allowlist/reviewer-grant transaction.
 */
export const GOOGLE_OIDC_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;
const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
const LOGIN_TTL_MS = 5 * 60_000;
const ID_TOKEN_MAX_BYTES = 16_384;
const GOOGLE_CLIENT_ID = /^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/;

export interface GoogleOidcAttempt {
  /** Store server-side; never attach to a public cookie or HTML. */
  readonly stateDigest: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface GoogleOidcAuthorization {
  /** Send this URL as an HTTP redirect from the later auth-start endpoint. */
  readonly authorizationUrl: string;
  readonly attempt: GoogleOidcAttempt;
}

export interface GoogleVerifiedIdentity {
  /** Stable primary identifier: NEVER key an account by mutable email alone. */
  readonly googleSubject: string;
  readonly verifiedEmail: string;
  readonly identityProofExpiresAt: string;
  readonly issuer: string;
  readonly hostedDomain: string | null;
  /** True only with signed hd AND matching @hufs.ac.kr address. */
  readonly schoolWorkspaceVerified: boolean;
}

export class GoogleOidcVerificationError extends Error {
  constructor() { super('Invalid Google OpenID Connect verification'); }
}

function requireClientId(value:string):string {
  if (!GOOGLE_CLIENT_ID.test(value) || value.length > 260) throw new Error('Invalid configured Google OAuth client ID');
  return value;
}

function requireRedirectUri(value:string):string {
  const url = new URL(value);
  const loopback = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:';
  if ((url.protocol !== 'https:' && !loopback) || url.username || url.password || url.hash || url.search)
    throw new Error('Invalid configured OAuth redirect URI');
  return url.toString();
}

function sha256(value:string):Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function sameDigestHex(a:string,b:string):boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * Start the Google authorization-code flow with PKCE S256 and nonce.
 * Persist the opaque attempt *before* redirecting. The callback must
 * atomically consume it once, compare the state hash, and exchange the code.
 * No real Google credentials, outbound calls or sessions are used here.
 */
export function createGoogleOidcAuthorization(input:{
  clientId:string;
  redirectUri:string;
  now?:Date;
  /** A trusted random source; injection is only for deterministic tests. */
  secureRandom?: (bytes:number)=>Buffer;
}):GoogleOidcAuthorization {
  const clientId = requireClientId(input.clientId);
  const redirectUri = requireRedirectUri(input.redirectUri);
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid server clock');
  const random = input.secureRandom ?? randomBytes;
  const makeToken = () => {
    const bytes = random(32);
    if (!Buffer.isBuffer(bytes) || bytes.length !== 32) throw new Error('Secure random 32-byte source required');
    return bytes.toString('base64url');
  };
  const state = makeToken();
  const nonce = makeToken();
  const codeVerifier = makeToken();
  if (new Set([state, nonce, codeVerifier]).size !== 3)
    throw new Error('OIDC random collision');
  const challenge = sha256(codeVerifier).toString('base64url');
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  const attempt:GoogleOidcAttempt = {
    stateDigest: sha256(state).toString('hex'),
    nonce,
    codeVerifier,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + LOGIN_TTL_MS).toISOString(),
  };
  return {authorizationUrl:url.toString(),attempt};
}

/**
 * Call only AFTER atomically deleting the pending attempt from a durable
 * transaction-bound state store. The state parameter is never trusted on its own.
 */
export function verifyGoogleCallbackState(
  attempt:GoogleOidcAttempt,
  returnedState:string,
  now:Date = new Date(),
):{nonce:string;codeVerifier:string} {
  const at = now.getTime();
  const created = Date.parse(attempt.createdAt);
  const expiry = Date.parse(attempt.expiresAt);
  if (!Number.isFinite(at) || !Number.isFinite(created) || !Number.isFinite(expiry)
    || at < created || at >= expiry || expiry - created > LOGIN_TTL_MS
    || !/^[A-Za-z0-9_-]{43}$/.test(returnedState)
    || !sameDigestHex(sha256(returnedState).toString('hex'), attempt.stateDigest)
    || !/^[A-Za-z0-9_-]{43}$/.test(attempt.nonce)
    || !/^[A-Za-z0-9_-]{43}$/.test(attempt.codeVerifier)) {
    throw new GoogleOidcVerificationError();
  }
  return {nonce:attempt.nonce,codeVerifier:attempt.codeVerifier};
}

const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_ENDPOINT), {
  timeoutDuration: 3000,
  cooldownDuration: 30_000,
  cacheMaxAge: 60 * 60_000,
});

export interface GoogleIdTokenVerifierConfig {
  clientId: string;
  /** Trusted adapter for offline synthetic tests; production uses Google's fixed JWKS. */
  jwks?: JWTVerifyGetKey;
  now?: () => Date;
}

/**
 * Only verify ID tokens from a completed authorization-code exchange.
 * A verified Google email is sufficient for REVIEWER enrollment only when
 * the server independently checks the invite. BETA users require a separately
 * verified HUFS mailbox or matching signed Workspace hd plus allowlist.
 */
export function createGoogleIdTokenVerifier(config:GoogleIdTokenVerifierConfig) {
  const clientId = requireClientId(config.clientId);
  const jwks = config.jwks ?? googleJwks;
  const now = config.now ?? (()=>new Date());

  return async function verifyGoogleIdToken(
    idToken:string,
    expectedNonce:string,
  ):Promise<GoogleVerifiedIdentity> {
    if (typeof idToken !== 'string' || Buffer.byteLength(idToken,'utf8') > ID_TOKEN_MAX_BYTES
      || idToken.split('.').length !== 3 || !/^[A-Za-z0-9_-]{43}$/.test(expectedNonce))
      throw new GoogleOidcVerificationError();

    try {
      const currentDate = now();
      if (!Number.isFinite(currentDate.getTime())) throw new Error('Invalid server clock');
      const {payload,protectedHeader} = await jwtVerify(idToken, jwks, {
        algorithms:['RS256'],
        audience:clientId,
        issuer:[...GOOGLE_OIDC_ISSUERS],
        currentDate,
        clockTolerance:30,
        maxTokenAge:'65m',
        requiredClaims:['iat','exp','sub','nonce','email','email_verified'],
      });
      if (protectedHeader.alg !== 'RS256' || typeof protectedHeader.kid !== 'string'
        || !/^[A-Za-z0-9_-]{1,160}$/.test(protectedHeader.kid)
        || payload.nonce !== expectedNonce || payload.aud !== clientId
        || (payload.azp !== undefined && payload.azp !== clientId)
        || typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 255
        || !/^[\x21-\x7E]+$/.test(payload.sub)
        || payload.email_verified !== true
        || typeof payload.email !== 'string' || payload.email.length > 254
        || payload.iat === undefined || payload.exp === undefined
        || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
        || payload.iat > Math.floor(currentDate.getTime()/1000) + 30
        || payload.exp <= Math.floor(currentDate.getTime()/1000)
        || (payload.hd !== undefined && (typeof payload.hd !== 'string' || payload.hd.length > 253))) {
        throw new GoogleOidcVerificationError();
      }
      const email = payload.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || !/^[\x21-\x7E]+$/.test(email))
        throw new GoogleOidcVerificationError();
      const hd = typeof payload.hd === 'string' ? payload.hd.toLowerCase() : null;
      return {
        googleSubject:payload.sub,
        verifiedEmail:email,
        issuer:String(payload.iss),
        identityProofExpiresAt:new Date(payload.exp*1000).toISOString(),
        hostedDomain:hd,
        schoolWorkspaceVerified:hd === 'hufs.ac.kr' && email.endsWith('@hufs.ac.kr'),
      };
    } catch {
      // Do not expose token, parsed claims, KID, fetch failures or account details.
      throw new GoogleOidcVerificationError();
    }
  };
}
