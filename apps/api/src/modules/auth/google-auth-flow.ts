import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {FastifyReply,FastifyRequest} from 'fastify';
import type {VerifiedActor,VerifiedTeamActor} from '../../types.js';
import type {GoogleAuthStore,GoogleLoginIntent} from './google-auth-store.js';
import {
  createGoogleIdTokenVerifier,createGoogleOidcAuthorization,
  verifyGoogleCallbackState,
} from './google-oidc.js';
import type {GoogleVerifiedIdentity} from './google-oidc.js';
import type {BetaAdmissionDecision} from './beta-admission.js';
import type {AuthAttemptLimiter} from './auth-attempt-limiter.js';
import {ApiFailure} from './gates.js';

const STATE_COOKIE='__Host-hufs_login';
const SESSION_COOKIE='__Host-hufs_session';
const OPAQUE=/^[A-Za-z0-9_-]{43}$/;
const Intent=z.enum(['REVIEWER','BETA']);
const StartQuery=z.strictObject({intent:Intent.default('REVIEWER')});
const CallbackQuery=z.strictObject({
  state:z.string().regex(OPAQUE),
  code:z.string().min(1).max(2048).regex(/^[\x21-\x7e]+$/),
});
const ISO=z.iso.datetime({offset:true});

export interface GoogleAuthConfig {
  clientId:string;
  redirectUri:string;
  allowedOrigin:string;
  store:GoogleAuthStore;
  /** Mandatory durable cross-replica limiter. Memory adapter only in tests. */
  attemptLimiter:AuthAttemptLimiter;
  now?:()=>Date;
  /** A trusted server code-exchange adapter; never accept browser ID tokens. */
  exchangeCode:(input:{
    code:string;codeVerifier:string;redirectUri:string;clientId:string;
  })=>Promise<string>;
  verifyIdToken?:ReturnType<typeof createGoogleIdTokenVerifier>;
  /** External approved HUFS mail proof and beta allowlist verifier. */
  authorizeBeta?:(identity:GoogleVerifiedIdentity)=>Promise<BetaAdmissionDecision|null>;
  /** Re-read revocation and proof status on EVERY BETA request. */
  recheckBeta?:(actor:VerifiedTeamActor)=>Promise<boolean>;
}
export class GoogleAuthFlowError extends Error {
  constructor(){super('Google sign-in verification failed');}
}
function digest(s:string):string{return createHash('sha256').update(s,'utf8').digest('hex');}
function validDigest(x:string):boolean{return /^[0-9a-f]{64}$/.test(x);}
function equalDigest(a:string,b:string):boolean{
  return validDigest(a)&&validDigest(b)
    &&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function randomToken():string{return randomBytes(32).toString('base64url');}
function getCookie(request:FastifyRequest,key:string):string|null{
  const raw=request.headers.cookie;
  if(typeof raw!=='string'||raw.length>8192)return null;
  const values=raw.split(';').map(x=>x.trim())
    .filter(x=>x.startsWith(key+'='));
  if(values.length!==1)return null;
  const value=values[0]!.slice(key.length+1);
  return OPAQUE.test(value)?value:null;
}
function setCookie(key:string,value:string,maxAge:number):string{
  return `${key}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function clearCookie(key:string):string{return setCookie(key,'',0);}
function utc(value:string):number{
  if(!ISO.safeParse(value).success)throw new GoogleAuthFlowError();
  const stamp=Date.parse(value);
  if(!Number.isFinite(stamp))throw new GoogleAuthFlowError();
  return stamp;
}
function clock(value:Date):Date{
  if(!(value instanceof Date)||!Number.isFinite(value.getTime()))
    throw new GoogleAuthFlowError();
  return value;
}

/** HTTP auth routes must be opt-in. The local main.ts omits this adapter. */
export function createGoogleAuthFlow(config:GoogleAuthConfig){
  const callback=new URL(config.redirectUri);
  if(callback.origin!==config.allowedOrigin
    ||callback.pathname!=='/api/auth/google/callback'
    ||callback.search||callback.hash||callback.username||callback.password
    ||callback.protocol!=='https:')
    throw new Error('Invalid configured Google callback URL');
  if(typeof config.attemptLimiter?.consume!=='function')
    throw new Error('A shared OAuth attempt limiter is required');
  // BETA login must never mint a seemingly valid session that cannot
  // recheck the administrator approval and mailbox proof on each request.
  if(config.authorizeBeta!==undefined||config.recheckBeta!==undefined){
    if(typeof config.authorizeBeta!=='function')
      throw new Error('BETA admission policy is required');
    if(typeof config.recheckBeta!=='function')
      throw new Error('BETA revocation rechecker is required');
  }
  const now=config.now??(()=>new Date());
  const reserve=async(request:FastifyRequest,kind:'GOOGLE_START'|'GOOGLE_CALLBACK')=>{
    let allowed=false;
    try{
      allowed=await config.attemptLimiter.consume({
        kind,identifier:'ip:'+request.ip,at:clock(now()).toISOString(),
      });
    }catch{throw new ApiFailure('PROVIDER_UNAVAILABLE');}
    if(!allowed)throw new ApiFailure('RATE_LIMITED');
  };
  const verify=config.verifyIdToken??createGoogleIdTokenVerifier({
    clientId:config.clientId,now,
  });

  return {
    async start(request:FastifyRequest,reply:FastifyReply):Promise<void>{
      const site=request.headers['sec-fetch-site'];
      if(site&&site!=='same-origin'&&site!=='none')throw new GoogleAuthFlowError();
      const {intent}=StartQuery.parse(request.query);
      if(intent==='BETA'&&!config.authorizeBeta)throw new GoogleAuthFlowError();
      await reserve(request,'GOOGLE_START');
      const created=createGoogleOidcAuthorization({
        clientId:config.clientId,redirectUri:config.redirectUri,now:clock(now()),
      });
      const state=new URL(created.authorizationUrl).searchParams.get('state');
      if(!state||!OPAQUE.test(state))throw new GoogleAuthFlowError();
      const binding=randomToken();
      await config.store.putAttempt({...created.attempt,
        browserDigest:digest(binding),intent,
      });
      reply.header('Set-Cookie',setCookie(STATE_COOKIE,binding,300));
      reply.code(303).header('Location',created.authorizationUrl).send();
    },

    async callback(request:FastifyRequest,reply:FastifyReply):Promise<void>{
      // Clear the one-time binding even on failure. No redirect to user URLs.
      reply.header('Set-Cookie',clearCookie(STATE_COOKIE));
      await reserve(request,'GOOGLE_CALLBACK');
      try{
        const {state,code}=CallbackQuery.parse(request.query);
        const pending=await config.store.consumeAttempt(digest(state));
        if(!pending)throw new GoogleAuthFlowError();
        const valid=verifyGoogleCallbackState(pending,state,clock(now()));
        const binding=getCookie(request,STATE_COOKIE);
        if(!binding||!equalDigest(pending.browserDigest,digest(binding)))
          throw new GoogleAuthFlowError();
        const idToken=await config.exchangeCode({
          code,codeVerifier:valid.codeVerifier,
          redirectUri:config.redirectUri,clientId:config.clientId,
        });
        const identity=await verify(idToken,valid.nonce);
        const at=clock(now()).getTime();
        const until=Math.min(at+3600_000,utc(identity.identityProofExpiresAt));
        if(until<=at)throw new GoogleAuthFlowError();
        const common={
          actorId:'google:'+identity.googleSubject,
          sessionIdHash:'',sessionExpiresAt:new Date(until).toISOString(),
          csrfToken:randomToken(),
        };
        let actor:VerifiedActor;
        if(pending.intent==='REVIEWER'){
          actor={...common,role:'REVIEWER',verifiedEmail:identity.verifiedEmail,
            identityProofExpiresAt:new Date(until).toISOString()};
        }else{
          if(!config.authorizeBeta)throw new GoogleAuthFlowError();
          const admission=await config.authorizeBeta(identity);
          if(!admission||admission.googleSubject!==identity.googleSubject
            ||admission.verifiedEmail!==identity.verifiedEmail
            ||!/^[^\s@]+@hufs\.ac\.kr$/.test(admission.schoolEmail)
            ||admission.schoolEmail!==admission.schoolEmail.toLowerCase()
            ||(admission.proofMethod!=='MAILBOX_OTP'
              &&admission.proofMethod!=='SIGNED_WORKSPACE')
            ||(admission.proofMethod==='SIGNED_WORKSPACE'
              &&(!identity.schoolWorkspaceVerified
                ||identity.verifiedEmail!==admission.schoolEmail)))
            throw new GoogleAuthFlowError();
          const proof=utc(admission.schoolMailProofExpiresAt);
          if(proof<=at)throw new GoogleAuthFlowError();
          actor={...common,role:'BETA',betaAllowed:true,
            verifiedSchoolEmail:admission.schoolEmail,
            schoolProofMethod:admission.proofMethod,
            schoolMailProofExpiresAt:new Date(Math.min(proof,until)).toISOString()};
        }
        const bearer=randomToken();
        const tokenDigest=digest(bearer);
        actor.sessionIdHash=tokenDigest;
        await config.store.createSession({
          tokenDigest,actor,createdAt:new Date(at).toISOString(),
        });
        reply.header('Set-Cookie',[
          clearCookie(STATE_COOKIE),
          setCookie(SESSION_COOKIE,bearer,Math.max(1,Math.floor((until-at)/1000))),
        ]);
        reply.code(303).header('Location',pending.intent==='REVIEWER'?'/reviewer':'/').send();
      }catch{throw new GoogleAuthFlowError();}
    },

    async verifySession(request:FastifyRequest):Promise<VerifiedActor|null>{
      const bearer=getCookie(request,SESSION_COOKIE);
      if(!bearer)return null;
      try{
        const key=digest(bearer);
        const data=await config.store.readSession(key,clock(now()).toISOString());
        if(!data||data.tokenDigest!==key||data.actor.sessionIdHash!==key)return null;
        if(data.actor.role==='BETA'){
          if(!config.recheckBeta||!await config.recheckBeta(data.actor))return null;
        }
        return data.actor;
      }catch{return null;}
    },
    async revokeSession(actor:VerifiedActor):Promise<void>{
      await config.store.revokeSession(actor.sessionIdHash,clock(now()).toISOString());
    },
    clearSession(reply:FastifyReply):void{
      reply.header('Set-Cookie',clearCookie(SESSION_COOKIE));
    },
  };
}
export type GoogleAuthFlow=ReturnType<typeof createGoogleAuthFlow>;
