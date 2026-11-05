import {describe,expect,it,vi} from 'vitest';
import {createApprovedPinnedTransport,isPublicIngestionIp} from
  '../../apps/api/src/modules/opportunities/approved-egress.js';

const SOURCE_URL='https://source.example.edu/approved/notice';
const GOOD='93.184.216.34';
const REQUEST={method:'GET',redirect:'error',credentials:'omit'} as const;
function transport(answers:readonly string[][],response:Response=new Response('synthetic',{
  status:200,headers:{'content-type':'text/plain'},
})){
  const calls:Array<{url:string;address:string;serverName:string;init:RequestInit}>=[];
  let lookups=0;
  const request=createApprovedPinnedTransport({canonicalUrl:SOURCE_URL},{
    resolveAddresses:async()=>{
      const answer=answers[lookups++];
      if(!answer)throw Error('No synthetic DNS response');
      return answer;
    },
    requestPinned:async x=>{
      calls.push({url:x.url.href,address:x.address,serverName:x.serverName,init:x.init});
      return response;
    },
  });
  return {request,calls,lookupCount:()=>lookups};
}
function deferred<T>(){
  let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;
  const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail;});
  return {promise,resolve,reject};
}
const nextTurn=()=>new Promise<void>(resolve=>setImmediate(resolve));
describe('TASK-19 synthetic SSRF / HTTPS egress policy (NO real network)',()=>{
  it('rejects an already aborted request without DNS or pinned HTTP',async()=>{
    const cancel=new AbortController();cancel.abort();
    const resolveAddresses=vi.fn(async()=>[GOOD]),requestPinned=vi.fn(async()=>new Response('synthetic'));
    const request=createApprovedPinnedTransport({canonicalUrl:SOURCE_URL},{resolveAddresses,requestPinned});
    await expect(request(new URL(SOURCE_URL),{...REQUEST,signal:cancel.signal})).rejects.toThrow();
    expect(resolveAddresses).not.toHaveBeenCalled();expect(requestPinned).not.toHaveBeenCalled();
  });
  it.each(['first DNS','second DNS','authority'] as const)('settles cancellation during %s before the pending operation completes',async stage=>{
    const gate=deferred<void>(),entered=deferred<void>(),cancel=new AbortController();
    let lookups=0,state='PENDING';
    const requestPinned=vi.fn(async()=>new Response('synthetic'));
    const request=createApprovedPinnedTransport({canonicalUrl:SOURCE_URL,beforeSend:async()=>{
      if(stage==='authority'){entered.resolve();await gate.promise;}
    }},{
      resolveAddresses:async()=>{
        lookups++;
        if(stage==='first DNS'&&lookups===1||stage==='second DNS'&&lookups===2){
          entered.resolve();await gate.promise;
        }
        return [GOOD];
      },
      requestPinned,
    });
    const pending=request(new URL(SOURCE_URL),{...REQUEST,signal:cancel.signal})
      .then(()=>{state='ACCEPTED';},()=>{state='DENIED';});
    await Promise.race([entered.promise,pending]);cancel.abort();await nextTurn();
    const whenCancelled=state;
    gate.resolve();await pending;await nextTurn();
    expect(whenCancelled).toBe('DENIED');
    expect(requestPinned).not.toHaveBeenCalled();
    expect(lookups).toBe(stage==='first DNS'?1:2);
  });
  it('requires the trusted pre-send authority check after DNS and before HTTP',async()=>{
    const order:string[]=[];
    const request=createApprovedPinnedTransport({canonicalUrl:SOURCE_URL,beforeSend:async()=>{
      order.push('authority');throw Error('Private authority failure');
    }},{
      resolveAddresses:async()=>{order.push('DNS');return [GOOD];},
      requestPinned:async()=>{order.push('HTTP');return new Response('synthetic');},
    });
    await expect(request(new URL(SOURCE_URL),REQUEST)).rejects.toThrow();
    expect(order).toEqual(['DNS','DNS','authority']);
  });
  it.each(['response','rejection'] as const)('observes a late pinned %s after cancellation without exposing a response',async mode=>{
    const gate=deferred<Response>(),entered=deferred<void>(),cancel=new AbortController();
    const cancelBody=vi.fn();let state='PENDING';
    const request=createApprovedPinnedTransport({canonicalUrl:SOURCE_URL},{
      resolveAddresses:async()=>[GOOD],
      requestPinned:async()=>{entered.resolve();return gate.promise;},
    });
    const pending=request(new URL(SOURCE_URL),{...REQUEST,signal:cancel.signal})
      .then(()=>{state='ACCEPTED';},()=>{state='DENIED';});
    await Promise.race([entered.promise,pending]);cancel.abort();await nextTurn();
    const whenCancelled=state;
    if(mode==='response')gate.resolve(new Response(new ReadableStream<Uint8Array>({cancel:cancelBody})));
    else gate.reject(Error('Private late network error'));
    await pending;await nextTurn();
    expect(whenCancelled).toBe('DENIED');expect(state).toBe('DENIED');
    expect(cancelBody).toHaveBeenCalledTimes(mode==='response'?1:0);
  });
  it('accepts only public IPs and rejects private, metadata and special-use ranges',()=>{
    expect(isPublicIngestionIp(GOOD)).toBe(true);
    expect(isPublicIngestionIp('2001:4860:4860::8888')).toBe(true);
    for(const ip of [
      '127.0.0.1','10.3.4.5','192.168.1.2','172.16.1.1',
      '169.254.169.254','100.64.2.1','0.0.0.0','255.255.255.255',
      '192.0.2.1','198.18.0.4','198.51.100.3','203.0.113.5',
      '::1','fe80::1','fc00::1','::ffff:127.0.0.1','2001:db8::1',
      '2002:c0a8:0101::','0x7f.0.0.1','127.1',
    ])expect(isPublicIngestionIp(ip),ip).toBe(false);
  });
  it('compares IPv6 subnets numerically across compression, padding and case',()=>{
    for(const ip of [
      '2001:0db8::1','2001:0DB8:0:0:0:0:0:1','2001:db8::192.0.2.1',
      '2001::1','2001:00::1','2001:000::1','2001:0000:0:0:0:0:0:1',
      '2001:2::1','2001:0002:0000:ffff:ffff:ffff:ffff:ffff',
      '2002:0000::1','3fff::1','3fff:0fff:ffff:ffff:ffff:ffff:ffff:ffff',
      '2001:4860::8888%eth0',
    ])expect(isPublicIngestionIp(ip),ip).toBe(false);
    for(const ip of ['2001:4860:4860::8888','2001:4860:4860:0:0:0:0:8888','3fff:1000::1'])
      expect(isPublicIngestionIp(ip),ip).toBe(true);
  });
  it('does not reject entire public IPv4 /16 blocks around special-use /24 ranges',()=>{
    for(const ip of ['192.0.1.1','192.0.3.1','192.0.78.24','192.88.98.1','192.88.100.1'])
      expect(isPublicIngestionIp(ip),ip).toBe(true);
    for(const ip of ['192.0.0.1','192.0.2.255','192.88.99.1','192.88.99.255','192.168.0.1'])
      expect(isPublicIngestionIp(ip),ip).toBe(false);
  });
  it('never connects when any DNS answer disguises a denied IPv6 prefix',async()=>{
    for(const ip of ['2001:0db8::1','2001:00::1','2001:0002::1','3fff::1']){
      const x=transport([[GOOD,ip],[GOOD,ip]]);
      await expect(x.request(new URL(SOURCE_URL),REQUEST)).rejects.toThrow(/policy denied/);
      expect(x.calls).toHaveLength(0);
    }
  });
  it('revalidates all DNS A/AAAA records and pins TLS SNI to the source name',async()=>{
    const x=transport([[GOOD,'8.8.8.8'],['8.8.8.8',GOOD]]);
    await expect(x.request(new URL(SOURCE_URL),REQUEST)).resolves.toBeInstanceOf(Response);
    expect(x.lookupCount()).toBe(2);
    expect(x.calls).toHaveLength(1);
    expect(x.calls[0]).toMatchObject({
      url:SOURCE_URL,address:'8.8.8.8',serverName:'source.example.edu',init:REQUEST,
    });
  });
  it('blocks DNS rebinding before any pinned connection',async()=>{
    const x=transport([[GOOD],['127.0.0.1']]);
    await expect(x.request(new URL(SOURCE_URL),REQUEST)).rejects.toThrow(/policy denied/);
    expect(x.calls).toHaveLength(0);
  });
  it('refuses a mixed public/private answer even if a public IP is available',async()=>{
    const x=transport([[GOOD,'169.254.169.254'],[GOOD]]);
    await expect(x.request(new URL(SOURCE_URL),REQUEST)).rejects.toThrow(/policy denied/);
    expect(x.lookupCount()).toBe(1);
    expect(x.calls).toHaveLength(0);
  });
  it('rejects requests outside the reviewed SOURCE_URL or with ambient credentials',async()=>{
    for(const [url,opts] of [
      ['https://evil.example.edu/approved/notice',REQUEST],
      [SOURCE_URL,{...REQUEST,redirect:'follow'}],
      [SOURCE_URL,{...REQUEST,credentials:'include'}],
      [SOURCE_URL,{...REQUEST,headers:{cookie:'session=x'}}],
      [SOURCE_URL,{...REQUEST,headers:{authorization:'Bearer fake'}}],
      [SOURCE_URL,{...REQUEST,method:'POST'}],
    ] as const){
      const x=transport([[GOOD],[GOOD]]);
      await expect(x.request(new URL(url),opts as RequestInit)).rejects.toThrow(/policy denied/);
      expect(x.lookupCount()).toBe(0);
      expect(x.calls).toHaveLength(0);
    }
  });
  it('rejects cross-origin redirects regardless of status headers',async()=>{
    const x=transport([[GOOD],[GOOD]],new Response(null,{
      status:302,headers:{location:'https://attacker.example/secret'},
    }));
    await expect(x.request(new URL(SOURCE_URL),REQUEST)).rejects.toThrow(/policy denied/);
    expect(x.calls).toHaveLength(1);
  });
  it('allows a trusted 304 without a response body for the parent ETag check',async()=>{
    const x=transport([[GOOD],[GOOD]],new Response(null,{status:304}));
    const response=await x.request(new URL(SOURCE_URL),REQUEST);
    expect(response.status).toBe(304);
  });
  it('rejects an explicit IP, non-HTTPS scheme or alternate port at construction',()=>{
    for(const url of [
      'https://127.0.0.1/notice',
      'http://source.example.edu/notice',
      'https://source.example.edu:8443/notice',
      'https://admin:password@source.example.edu/notice',
      'https://localhost/notice',
    ])expect(()=>createApprovedPinnedTransport({canonicalUrl:url},{
      resolveAddresses:async()=>[GOOD],
      requestPinned:async()=>new Response('synthetic'),
    })).toThrow(/policy denied/);
  });
});
