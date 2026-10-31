/** Google server-side identity exchange uses a fixed provider endpoint. */
const GOOGLE_ENDPOINT = 'https://oauth2.googleapis.com/token';
const MAX_BODY_BYTES = 32_768;
const MAX_ID_TOKEN_BYTES = 16_384;
const OPAQUE_CODE = /^[\x21-\x7e]{1,2048}$/;
const VERIFIER = /^[A-Za-z0-9_-]{43,128}$/;
const CLIENT_ID = /^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/;

export class GoogleAuthorizationError extends Error {
  constructor() { super('Google authentication exchange rejected'); }
}

export interface GoogleAuthorizationOptions {
  clientId:string;
  redirectUri:string;
  /** Server-owned client authentication. Must use a protected runtime provider. */
  authorizeRequest:(params:URLSearchParams)=>Promise<void>|void;
  /** Injected synthetic transport for tests; runtime uses fixed-endpoint fetch. */
  request?:typeof fetch;
}

/** Create the confidential-client form authenticator from protected runtime config. */
export function createGoogleClientAuthenticator(runtimeValue:string){
  if(typeof runtimeValue!=='string'||runtimeValue.length<12
    ||runtimeValue.length>2048)throw new Error('Google runtime client auth is missing');
  return (params:URLSearchParams):void=>{
    params.set('client_secret',runtimeValue);
  };
}

export function createGoogleAuthorizationExchange(config:GoogleAuthorizationOptions) {
  if(!CLIENT_ID.test(config.clientId))throw new Error('Invalid configured Google client');
  const redirect=new URL(config.redirectUri);
  if(redirect.protocol!=='https:'||redirect.username||redirect.password
    ||redirect.search||redirect.hash)throw new Error('Invalid configured redirect');
  if(typeof config.authorizeRequest!=='function')
    throw new Error('A server-owned Google client authenticator is required');

  return async function exchange(input:{
    clientId:string;redirectUri:string;code:string;codeVerifier:string;
  }):Promise<string> {
    if(input.clientId!==config.clientId||input.redirectUri!==config.redirectUri
      ||!OPAQUE_CODE.test(input.code)||!VERIFIER.test(input.codeVerifier))
      throw new GoogleAuthorizationError();
    const params=new URLSearchParams({
      grant_type:'authorization_code',
      client_id:config.clientId,
      redirect_uri:config.redirectUri,
      code:input.code,
      code_verifier:input.codeVerifier,
    });
    try {
      await config.authorizeRequest(params);
      // A server-side authentication plugin cannot rewrite OAuth identity,
      // redirect, authorization code, or its bound PKCE proof.
      if(params.get('grant_type')!=='authorization_code'
        ||params.get('client_id')!==config.clientId
        ||params.get('redirect_uri')!==config.redirectUri
        ||params.get('code')!==input.code
        ||params.get('code_verifier')!==input.codeVerifier)
        throw new GoogleAuthorizationError();
      const response=await (config.request??fetch)(GOOGLE_ENDPOINT,{
        method:'POST',
        headers:{
          'Content-Type':'application/x-www-form-urlencoded',
          Accept:'application/json',
        },
        redirect:'error',
        body:params.toString(),
        signal:AbortSignal.timeout(5000),
      });
      if(!response.ok||!response.headers.get('content-type')?.toLowerCase()
        .includes('application/json'))throw new GoogleAuthorizationError();
      const declared=response.headers.get('content-length');
      if(declared!==null&&(!/^[0-9]+$/.test(declared)
        ||Number(declared)>MAX_BODY_BYTES))throw new GoogleAuthorizationError();
      if(!response.body)throw new GoogleAuthorizationError();

      const reader=response.body.getReader();
      const chunks:Uint8Array[]=[];
      let total=0;
      try {
        while(true) {
          const item=await reader.read();
          if(item.done)break;
          total+=item.value.byteLength;
          if(total>MAX_BODY_BYTES)throw new GoogleAuthorizationError();
          chunks.push(item.value);
        }
      } finally {reader.releaseLock();}
      const result:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!result||typeof result!=='object'||!('id_token' in result)
        ||typeof result.id_token!=='string'
        ||Buffer.byteLength(result.id_token,'utf8')>MAX_ID_TOKEN_BYTES
        ||result.id_token.split('.').length!==3)
        throw new GoogleAuthorizationError();
      return result.id_token;
    } catch {
      // Do not reflect provider errors, codes, credentials, or private tokens.
      throw new GoogleAuthorizationError();
    }
  };
}
