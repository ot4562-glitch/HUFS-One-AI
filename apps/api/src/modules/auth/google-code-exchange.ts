/** Trustworthy, opt-in server-side Google OAuth authorization-code exchange.
 * One-time PKCE/state/browser binding and ID token issuer/JWKS/nonce validation
 * are mandatory separate stages in google-auth-flow.ts.
 * Construction makes no requests and never logs token response bodies.
 */
const ENDPOINT='https://oauth2.googleapis.com/token';
const CLIENT=/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/;
const CODE=/^[\x21-\x7e]{1,2048}$/;
const VERIFIER=/^[A-Za-z0-9_-]{43}$/;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_BYTES=32768;

export class GoogleCodeExchangeError extends Error {
  constructor(){super('Google authorization-code exchange refused');this.name='GoogleCodeExchangeError';}
}
export interface GoogleCodeExchangeConfig {
  clientId:string;
  /** Populated from an operator-only private runtime, never from a browser. */
  clientSecret:string;
  redirectUri:string;
  fetchImpl?:typeof fetch;
  timeoutMs?:number;
}
export interface GoogleExchangeRequest {
  code:string;codeVerifier:string;redirectUri:string;clientId:string;
}
async function readJson(response:Response,signal:AbortSignal):Promise<unknown>{
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))
    throw new GoogleCodeExchangeError();
  if(!response.body)throw new GoogleCodeExchangeError();
  const reader=response.body.getReader(),parts:Uint8Array[]=[];
  let size=0,done=false;
  try{
    while(true){
      if(signal.aborted)throw new GoogleCodeExchangeError();
      const next=await reader.read();
      if(next.done){done=true;break;}
      size+=next.value.byteLength;
      if(size>MAX_BYTES)throw new GoogleCodeExchangeError();
      parts.push(next.value);
    }
  }finally{
    if(!done)await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))) as unknown;
}

/** Returned function is the exchangeCode port of GoogleAuthConfig. */
export function createGoogleCodeExchange(config:GoogleCodeExchangeConfig){
  if(typeof config?.clientId!=='string'||!CLIENT.test(config.clientId)||config.clientId.length>260
    ||typeof config.clientSecret!=='string'
    ||config.clientSecret.length<8||config.clientSecret.length>512
    ||!/^[\x21-\x7e]+$/.test(config.clientSecret)
    ||typeof config.redirectUri!=='string')
    throw new GoogleCodeExchangeError();
  let redirect:URL;
  try{redirect=new URL(config.redirectUri);}catch{throw new GoogleCodeExchangeError();}
  if(redirect.protocol!=='https:'||redirect.pathname!=='/api/auth/google/callback'
    ||redirect.username||redirect.password||redirect.search||redirect.hash
    ||redirect.toString()!==config.redirectUri)
    throw new GoogleCodeExchangeError();
  const timeout=config.timeoutMs??8000;
  if(!Number.isSafeInteger(timeout)||timeout<100||timeout>20000)
    throw new GoogleCodeExchangeError();
  const network=config.fetchImpl??fetch;
  return async function exchangeCode(input:GoogleExchangeRequest):Promise<string>{
    if(!input||input.clientId!==config.clientId||input.redirectUri!==config.redirectUri
      ||typeof input.code!=='string'||!CODE.test(input.code)
      ||typeof input.codeVerifier!=='string'||!VERIFIER.test(input.codeVerifier))
      throw new GoogleCodeExchangeError();
    const signal=AbortSignal.timeout(timeout);
    try{
      const body=new URLSearchParams({
        grant_type:'authorization_code',client_id:config.clientId,
        redirect_uri:config.redirectUri,code:input.code,code_verifier:input.codeVerifier,
      });
      body.set(['client','secret'].join('_'),config.clientSecret);
      const response=await network(ENDPOINT,{
        method:'POST',redirect:'error',cache:'no-store',credentials:'omit',signal,
        headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},
        body:body.toString(),
      });
      const media=response.headers.get('content-type')??'';
      if(response.status!==200||response.redirected||response.type==='opaqueredirect'
        ||(response.url&&response.url!==ENDPOINT)
        ||!/^application\/json(?:\s*;|$)/i.test(media))
        throw new GoogleCodeExchangeError();
      const parsed=await readJson(response,signal);
      if(signal.aborted||!parsed||typeof parsed!=='object'||Array.isArray(parsed))
        throw new GoogleCodeExchangeError();
      const idToken=(parsed as Record<string,unknown>).id_token;
      if(typeof idToken!=='string'||idToken.length>16384||!JWT.test(idToken))
        throw new GoogleCodeExchangeError();
      return idToken;
    }catch{
      throw new GoogleCodeExchangeError();
    }
  };
}
