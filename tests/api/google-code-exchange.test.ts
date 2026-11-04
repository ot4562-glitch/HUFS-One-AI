import {describe,it,expect,vi} from 'vitest';
import {createGoogleCodeExchange,GoogleCodeExchangeError} from '../../apps/api/src/modules/auth/google-code-exchange.js';

describe('Google exchange adapter',()=>{
  it('requires an explicit trusted configuration',()=>{
    expect(()=>createGoogleCodeExchange({
      clientId:'invalid',clientSecret:'[REDACTED_SECRET]',redirectUri:'http://localhost/',
    })).toThrow(GoogleCodeExchangeError);
  });

  const config={
    clientId:'synthetic.apps.googleusercontent.com',
    clientSecret:'[REDACTED_SECRET]',
    redirectUri:'https://example.test/api/auth/google/callback',
  };
  const request={
    clientId:config.clientId,redirectUri:config.redirectUri,
    code:'synthetic-code',codeVerifier:'a'.repeat(43),
  };
  const fixtureIdToken=['header','payload','signature'].join('.');

  it('is inert until called, and binds POST/PKCE to the fixed token endpoint',async()=>{
    const network=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
      expect(url).toBe('https://oauth2.googleapis.com/token');
      expect(init?.method).toBe('POST');
      expect(init?.redirect).toBe('error');
      expect(init?.cache).toBe('no-store');
      expect(init?.credentials).toBe('omit');
      const parameters=new URLSearchParams(String(init?.body));
      expect(parameters.get('code_verifier')).toBe(request.codeVerifier);
      expect(parameters.get('code')).toBe(request.code);
      expect(parameters.get('client_id')).toBe(config.clientId);
      expect(parameters.get('redirect_uri')).toBe(config.redirectUri);
      return new Response(JSON.stringify({id_token:fixtureIdToken}),{
        headers:{'content-type':'application/json'},
      });
    });
    const exchange=createGoogleCodeExchange({...config,fetchImpl:network as typeof fetch});
    expect(network).not.toHaveBeenCalled();
    expect(await exchange(request)).toBe(fixtureIdToken);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('refuses invalid requests before network I/O',async()=>{
    const network=vi.fn(async()=>new Response('{}'));
    const exchange=createGoogleCodeExchange({...config,fetchImpl:network});
    await expect(exchange({...request,codeVerifier:'a'.repeat(42)}))
      .rejects.toBeInstanceOf(GoogleCodeExchangeError);
    await expect(exchange({...request,redirectUri:'https://example.test/other'}))
      .rejects.toBeInstanceOf(GoogleCodeExchangeError);
    await expect(exchange({...request,code:'bad code'}))
      .rejects.toBeInstanceOf(GoogleCodeExchangeError);
    expect(network).not.toHaveBeenCalled();
  });

  it('rejects upstream errors, redirects, and non-JSON bodies',async()=>{
    const bad=[
      new Response('upstream error',{status:400,headers:{'content-type':'application/json'}}),
      Response.redirect('https://example.test/redirect',302),
      new Response('not json',{headers:{'content-type':'application/json'}}),
      new Response('{}',{headers:{'content-type':'text/plain'}}),
    ];
    for(const response of bad){
      const exchange=createGoogleCodeExchange({...config,fetchImpl:async()=>response});
      await expect(exchange(request)).rejects.toBeInstanceOf(GoogleCodeExchangeError);
    }
  });

  it('rejects malformed or unbounded token responses',async()=>{
    for(const body of ['{}','{"id_token":42}','{"id_token":"invalid"}',' '.repeat(40000)]){
      const exchange=createGoogleCodeExchange({...config,fetchImpl:async()=>new Response(body,{
        headers:{'content-type':'application/json'},
      })});
      await expect(exchange(request)).rejects.toBeInstanceOf(GoogleCodeExchangeError);
    }
  });

  it('fails safely on a transport timeout without leaking provider errors',async()=>{
    const exchange=createGoogleCodeExchange({...config,timeoutMs:100,fetchImpl:async(_url,init)=>{
      await new Promise<void>((_resolve,reject)=>{
        init?.signal?.addEventListener('abort',()=>reject(new Error('upstream detail')),{once:true});
      });
      throw new Error('unreachable');
    }});
    await expect(exchange(request)).rejects.toMatchObject({
      message:'Google authorization-code exchange refused',
    });
  });
});
