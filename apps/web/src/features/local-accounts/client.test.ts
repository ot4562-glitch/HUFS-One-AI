import {describe,expect,it,vi} from 'vitest';
import {LocalAccountHttpClient} from './client.js';

const bootstrap={mode:'SYNTHETIC',sessionId:'SESSION-1',csrfToken:'CSRF-1',accountId:'BLANK_DEMO',
  accounts:['BLANK_DEMO','SYN_OWNER_1','SYN_OWNER_2','SYN_OWNER_3','SYN_OWNER_4'].map(accountId=>({accountId,label:accountId,resettable:accountId==='BLANK_DEMO',dataMode:'SYNTHETIC'}))};
describe('local account HTTP boundary',()=>{
  it('calls browser fetch without using the client instance as its receiver',async()=>{
    let receiver:unknown='not called';
    const browserFetch=async function(this:unknown) {receiver=this;
      if(this!==undefined&&this!==globalThis) throw new TypeError('Illegal invocation');
      return new Response(JSON.stringify(bootstrap));
    } as typeof fetch;
    const client=new LocalAccountHttpClient(browserFetch);
    await expect(client.bootstrap(new AbortController().signal)).resolves.toMatchObject({accountId:'BLANK_DEMO'});
    expect(receiver===undefined||receiver===globalThis).toBe(true);
  });
  it('uses same-origin credentials, no-store, server session and CSRF on switches',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify(bootstrap)));
    const client=new LocalAccountHttpClient(fetcher);const signal=new AbortController().signal;
    const session=await client.bootstrap(signal);await client.select('SYN_OWNER_1',session,signal);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/local-accounts/session');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({credentials:'same-origin',cache:'no-store',method:'GET',signal});
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({method:'POST',headers:{'x-csrf-token':'CSRF-1'},body:JSON.stringify({accountId:'SYN_OWNER_1'})});
  });
  it.each([401,403,409,503])('preserves status %s to clear the view',async status=>{
    const client=new LocalAccountHttpClient(vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status})));
    await expect(client.bootstrap(new AbortController().signal)).rejects.toMatchObject({status});
  });
  it('rejects invalid responses without fixture fallback',async()=>{
    const client=new LocalAccountHttpClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({mode:'REAL'}))));
    await expect(client.read(new AbortController().signal)).rejects.toThrow();
  });
  it('maps network disconnection to 503',async()=>{
    const client=new LocalAccountHttpClient(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network')));
    await expect(client.bootstrap(new AbortController().signal)).rejects.toMatchObject({status:503});
  });
});
