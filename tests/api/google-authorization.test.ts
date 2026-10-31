import {describe,expect,it,vi} from 'vitest';
import {
  createGoogleAuthorizationExchange,createGoogleClientAuthenticator,GoogleAuthorizationError,
} from '../../apps/api/src/modules/auth/google-authorization.js';

const CLIENT='123-example.apps.googleusercontent.com';
const CALLBACK='https://example.test/api/auth/google/callback';
const VERIFIER='v'.repeat(43);
const candidate='aaa.bbb.ccc';
const request={clientId:CLIENT,redirectUri:CALLBACK,
  code:'synthetic-authorization-code',codeVerifier:VERIFIER};
const reply=(payload:unknown,init?:ResponseInit)=>
  new Response(typeof payload==='string'?payload:JSON.stringify(payload),{
    status:200,headers:{'content-type':'application/json'},...init,
  });

describe('Google authorization exchange transport (synthetic only)',()=>{
  it('posts code and PKCE verifier to fixed endpoint and extracts ID proof candidate',async()=>{
    const records:Array<{url:string;form:URLSearchParams;method:string|undefined;
      redirects:RequestRedirect|undefined}>=[];
    const authenticate=vi.fn((form:URLSearchParams)=>form.set('synthetic_auth','ok'));
    const exchange=createGoogleAuthorizationExchange({
      clientId:CLIENT,redirectUri:CALLBACK,authorizeRequest:authenticate,
      request:async(url,init)=>{
        records.push({url:String(url),form:new URLSearchParams(String(init?.body)),
          method:init?.method,redirects:init?.redirect});
        return reply({id_token:candidate});
      },
    });
    expect(await exchange(request)).toBe(candidate);
    expect(authenticate).toHaveBeenCalledOnce();
    expect(records).toHaveLength(1);
    expect(records[0]?.url).toBe('https://oauth2.googleapis.com/token');
    expect(records[0]?.method).toBe('POST');
    expect(records[0]?.redirects).toBe('error');
    expect(records[0]?.form.get('grant_type')).toBe('authorization_code');
    expect(records[0]?.form.get('code_verifier')).toBe(VERIFIER);
    expect(records[0]?.form.get('client_id')).toBe(CLIENT);
    expect(records[0]?.form.get('redirect_uri')).toBe(CALLBACK);
    expect(records[0]?.form.get('code')).toBe(request.code);
    expect(records[0]?.form.get('synthetic_auth')).toBe('ok');
  });

  it('loads confidential client authentication only through an injected runtime value',()=>{
    const auth=createGoogleClientAuthenticator('synthetic-runtime-only-value');
    const form=new URLSearchParams();
    auth(form);
    expect(form.has('client_secret')).toBe(true);
    expect(()=>createGoogleClientAuthenticator('short')).toThrow();
  });
  it('rejects a server plugin trying to rewrite the redirect or PKCE proof',async()=>{
    const post=vi.fn(async()=>reply({id_token:candidate}));
    const exchange=createGoogleAuthorizationExchange({
      clientId:CLIENT,redirectUri:CALLBACK,
      authorizeRequest:async(form)=>form.set('redirect_uri','https://attacker.test/cb'),
      request:post,
    });
    await expect(exchange(request)).rejects.toBeInstanceOf(GoogleAuthorizationError);
    expect(post).not.toHaveBeenCalled();
  });
  it('blocks forged callback/client and malformed code/verifier without an external request',async()=>{
    const post=vi.fn(async()=>reply({id_token:candidate}));
    const auth=vi.fn();
    const exchange=createGoogleAuthorizationExchange({
      clientId:CLIENT,redirectUri:CALLBACK,
      authorizeRequest:auth,request:post,
    });
    for(const bad of [
      {...request,clientId:'another.apps.googleusercontent.com'},
      {...request,redirectUri:'https://attacker.test/return'},
      {...request,code:''},
      {...request,code:'long'.repeat(800)},
      {...request,code:'bad\ncode'},
      {...request,codeVerifier:'short'},
      {...request,codeVerifier:'!'.repeat(43)},
    ]){
      await expect(exchange(bad)).rejects.toBeInstanceOf(GoogleAuthorizationError);
    }
    expect(post).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  it('enforces a 32 KiB response limit on streamed provider output',async()=>{
    const exchange=createGoogleAuthorizationExchange({
      clientId:CLIENT,redirectUri:CALLBACK,authorizeRequest:async()=>{},
      request:async()=>reply('x'.repeat(33_000)),
    });
    await expect(exchange(request)).rejects.toBeInstanceOf(GoogleAuthorizationError);
  });
  it('fails closed on missing server authorization hook, insecure callback and provider failures',async()=>{
    const base={clientId:CLIENT,redirectUri:CALLBACK,authorizeRequest:async()=>{}};
    expect(()=>createGoogleAuthorizationExchange({...base,
      authorizeRequest:undefined as never})).toThrow();
    expect(()=>createGoogleAuthorizationExchange({...base,
      redirectUri:'http://example.test/cb'})).toThrow();
    for(const respond of [
      async()=>{throw Error('synthetic provider failure');},
      async()=>reply('bad reply'),
      async()=>reply({error:'provider error'},{status:400}),
      async()=>reply({unexpected:'no id'}),
      async()=>reply({id_token:'broken'}),
      async()=>reply({id_token:9}),
    ]){
      const exchange=createGoogleAuthorizationExchange({...base,
        request:async()=>respond(),
      });
      await expect(exchange(request)).rejects.toBeInstanceOf(GoogleAuthorizationError);
    }
  });
});
