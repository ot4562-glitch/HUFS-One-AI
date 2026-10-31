import {createHash} from 'node:crypto';
import {beforeAll,describe,expect,it} from 'vitest';
import {createLocalJWKSet,exportJWK,generateKeyPair,SignJWT} from 'jose';
import type {JWTPayload} from 'jose';
import {
  createGoogleIdTokenVerifier,createGoogleOidcAuthorization,
  GoogleOidcVerificationError,verifyGoogleCallbackState,
} from '../../apps/api/src/modules/auth/google-oidc.js';

const CLIENT_ID='1234567890-test.apps.googleusercontent.com';
const REDIRECT='https://example.test/api/auth/google/callback';
const NOW=new Date('2026-10-31T09:00:00.000Z');
const NOW_SECONDS=Math.floor(NOW.getTime()/1000);
const NONCE=Buffer.alloc(32,7).toString('base64url');
const now=()=>new Date(NOW);
let signKey:Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let untrustedKey:Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let jwks:ReturnType<typeof createLocalJWKSet>;

beforeAll(async()=>{
  const first=await generateKeyPair('RS256',{extractable:true});
  const attacker=await generateKeyPair('RS256',{extractable:true});
  signKey=first.privateKey;
  untrustedKey=attacker.privateKey;
  const publicKey=await exportJWK(first.publicKey);
  jwks=createLocalJWKSet({keys:[{...publicKey,alg:'RS256',use:'sig',kid:'test-kid'}]});
});

async function token(input:{
  claims?:Record<string,unknown>;
  audience?:string|string[];
  issuer?:string;
  expiresAt?:number;
  issuedAt?:number;
  notBefore?:number;
  key?:typeof signKey;
  kid?:string;
}={}):Promise<string>{
  const claims:JWTPayload={
    sub:'1234567890123456789',
    email:'SAMPLE@hufs.ac.kr',
    email_verified:true,
    nonce:NONCE,
    hd:'hufs.ac.kr',
    ...input.claims,
  };
  let builder=new SignJWT(claims)
    .setProtectedHeader({alg:'RS256',kid:input.kid??'test-kid'})
    .setAudience(input.audience??CLIENT_ID)
    .setIssuer(input.issuer??'https://accounts.google.com')
    .setIssuedAt(input.issuedAt??NOW_SECONDS-120)
    .setExpirationTime(input.expiresAt??NOW_SECONDS+1800);
  if(input.notBefore!==undefined)builder=builder.setNotBefore(input.notBefore);
  return builder.sign(input.key??signKey);
}
const verifier=()=>createGoogleIdTokenVerifier({clientId:CLIENT_ID,jwks,now});
const shouldReject=async(input:Parameters<typeof token>[0],nonce=NONCE)=>{
  await expect(verifier()(await token(input),nonce)).rejects.toBeInstanceOf(GoogleOidcVerificationError);
};

describe('server-generated Google OIDC code+PKCE+state/nonce boundary',()=>{
  it('builds an authorization request using strong random state, PKCE S256 and nonce',()=>{
    const generated=createGoogleOidcAuthorization({clientId:CLIENT_ID,redirectUri:REDIRECT,now:NOW});
    const url=new URL(generated.authorizationUrl);
    const state=url.searchParams.get('state')!;
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generated.attempt.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generated.attempt.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generated.attempt.stateDigest).toBe(createHash('sha256').update(state).digest('hex'));
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256')
      .update(generated.attempt.codeVerifier).digest('base64url'));
    expect(generated.authorizationUrl).not.toContain(generated.attempt.codeVerifier);
    expect(verifyGoogleCallbackState(generated.attempt,state,new Date(NOW.getTime()+1000)))
      .toEqual({nonce:generated.attempt.nonce,codeVerifier:generated.attempt.codeVerifier});
  });

  it('rejects guessed, altered, expired, future, malformed and mismatched state',()=>{
    const generated=createGoogleOidcAuthorization({clientId:CLIENT_ID,redirectUri:REDIRECT,now:NOW});
    const state=new URL(generated.authorizationUrl).searchParams.get('state')!;
    for(const candidate of ['a'.repeat(43),state.slice(1),state+'x','']) {
      expect(()=>verifyGoogleCallbackState(generated.attempt,candidate,NOW))
        .toThrow(GoogleOidcVerificationError);
    }
    expect(()=>verifyGoogleCallbackState(generated.attempt,state,
      new Date(NOW.getTime()+300_000))).toThrow(GoogleOidcVerificationError);
    expect(()=>verifyGoogleCallbackState(generated.attempt,state,
      new Date(NOW.getTime()-1))).toThrow(GoogleOidcVerificationError);
    expect(()=>verifyGoogleCallbackState({...generated.attempt,stateDigest:'0'.repeat(64)},
      state,NOW)).toThrow(GoogleOidcVerificationError);
  });

  it('rejects insecure redirect URIs, malformed client ID and deficient random sources',()=>{
    expect(()=>createGoogleOidcAuthorization({clientId:'wrong',redirectUri:REDIRECT})).toThrow();
    for(const redirectUri of ['http://site.test/cb','https://user:pass@site.test/cb',
      'https://example.test/cb#fragment','https://example.test/cb?secret=x']) {
      expect(()=>createGoogleOidcAuthorization({clientId:CLIENT_ID,redirectUri})).toThrow();
    }
    expect(()=>createGoogleOidcAuthorization({
      clientId:CLIENT_ID,redirectUri:REDIRECT,
      secureRandom:()=>Buffer.alloc(32,1),
    })).toThrow(/collision/);
    expect(()=>createGoogleOidcAuthorization({
      clientId:CLIENT_ID,redirectUri:REDIRECT,
      secureRandom:()=>Buffer.alloc(12),
    })).toThrow(/32-byte/);
  });
});

describe('Google signed ID token verification — no live Google keys in CI',()=>{
  it('accepts a signed exact-audience, issuer, nonce and email, extracting stable sub',async()=>{
    const result=await verifier()(await token(),NONCE);
    expect(result).toEqual({
      googleSubject:'1234567890123456789',
      verifiedEmail:'sample@hufs.ac.kr',
      identityProofExpiresAt:new Date((NOW_SECONDS+1800)*1000).toISOString(),
      issuer:'https://accounts.google.com',
      hostedDomain:'hufs.ac.kr',
      schoolWorkspaceVerified:true,
    });
    const alternative=await verifier()(await token({issuer:'accounts.google.com'}),NONCE);
    expect(alternative.issuer).toBe('accounts.google.com');
  });

  it('treats verified Gmail as reviewer identity, without granting HUFS mailbox proof',async()=>{
    const gmail=await verifier()(await token({claims:{
      email:'judge@gmail.com',hd:undefined,
    }}),NONCE);
    expect(gmail.verifiedEmail).toBe('judge@gmail.com');
    expect(gmail.schoolWorkspaceVerified).toBe(false);
    expect(gmail.hostedDomain).toBeNull();
    const spoofedHd=await verifier()(await token({claims:{
      email:'judge@gmail.com',hd:'hufs.ac.kr',
    }}),NONCE);
    expect(spoofedHd.schoolWorkspaceVerified).toBe(false);
    const personal=await verifier()(await token({claims:{hd:undefined}}),NONCE);
    expect(personal.schoolWorkspaceVerified).toBe(false);
  });

  it('rejects wrong nonce, signature, KID, issuer, audience and multi-audience tokens',async()=>{
    await shouldReject({},'9'.repeat(43));
    await shouldReject({key:untrustedKey});
    await shouldReject({kid:'unknown-key'});
    await shouldReject({issuer:'https://evil.example'});
    await shouldReject({audience:'attacker.apps.googleusercontent.com'});
    await shouldReject({audience:[CLIENT_ID,'other.apps.googleusercontent.com']});
    await shouldReject({claims:{azp:'attacker.apps.googleusercontent.com'}});
  });

  it('rejects expired, future, too-old and not-yet-valid tokens',async()=>{
    await shouldReject({expiresAt:NOW_SECONDS-40});
    await shouldReject({issuedAt:NOW_SECONDS+90});
    await shouldReject({issuedAt:NOW_SECONDS-90*60});
    await shouldReject({notBefore:NOW_SECONDS+90});
  });

  it('rejects unverified, missing and malformed identities rather than synthesizing an actor',async()=>{
    await shouldReject({claims:{email_verified:false}});
    await shouldReject({claims:{email_verified:'true'}});
    await shouldReject({claims:{email:undefined}});
    await shouldReject({claims:{email:'no-at-sign'}});
    await shouldReject({claims:{sub:''}});
    await shouldReject({claims:{nonce:undefined}});
    await shouldReject({claims:{hd:123}});
    await expect(verifier()('not.a.jwt',NONCE)).rejects.toBeInstanceOf(GoogleOidcVerificationError);
    await expect(verifier()('x'.repeat(20000),NONCE)).rejects.toBeInstanceOf(GoogleOidcVerificationError);
  });

  it('requires the trusted server to supply a 32-byte nonce and a real client ID',async()=>{
    expect(()=>createGoogleIdTokenVerifier({clientId:'not-google-id',jwks})).toThrow();
    await expect(verifier()(await token(),'short')).rejects.toBeInstanceOf(GoogleOidcVerificationError);
  });
});
