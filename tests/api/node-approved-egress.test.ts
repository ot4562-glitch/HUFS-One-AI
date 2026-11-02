import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {describe,expect,it,vi,beforeEach} from 'vitest';
const fake=vi.hoisted(()=>({request:vi.fn(),lookup:vi.fn()}));
vi.mock('node:https',()=>({request:fake.request}));
vi.mock('node:dns/promises',()=>({lookup:fake.lookup}));
import {createNodeApprovedPinnedEgress} from '../../apps/api/src/modules/opportunities/node-approved-egress.js';

const input={url:new URL('https://source.example.edu/approved'),address:'8.8.8.8',
  serverName:'source.example.edu',init:{method:'GET',redirect:'error',credentials:'omit'} as RequestInit};
function response(status=200,headers:Record<string,string>={},bytes:Buffer=Buffer.from('synthetic')){
  const req=Object.assign(new EventEmitter(),{end:vi.fn(),destroy:vi.fn()});
  fake.request.mockImplementation((_options,callback)=>{
    req.end.mockImplementation(()=>queueMicrotask(()=>{
      const res=Object.assign(new PassThrough(),{statusCode:status,headers,complete:true});
      callback(res);res.end(bytes);
    }));return req;
  });return req;
}
beforeEach(()=>vi.clearAllMocks());
describe('actual Node HTTPS pinned source adapter (synthetic socket, no network)',()=>{
  it('performs no I/O at creation, resolves all answers, and pins socket + certificate identity separately',async()=>{
    const client=createNodeApprovedPinnedEgress();expect(fake.request).not.toHaveBeenCalled();
    fake.lookup.mockResolvedValue([{address:'8.8.8.8',family:4},{address:'2001:4860::8888',family:6}]);
    expect(await client.resolveAddresses('source.example.edu')).toEqual(['8.8.8.8','2001:4860::8888']);
    const req=response(200,{'content-type':'text/plain'});
    expect(await (await client.requestPinned(input)).text()).toBe('synthetic');
    expect(fake.request.mock.calls[0]![0]).toMatchObject({hostname:'8.8.8.8',port:443,
      servername:'source.example.edu',rejectUnauthorized:true,agent:false,
      headers:{host:'source.example.edu'},path:'/approved',method:'GET'});
    expect(req.end).toHaveBeenCalledOnce();
  });
  it('blocks private IP, mismatched TLS name, ambient credentials and cancelled request before socket creation',async()=>{
    const client=createNodeApprovedPinnedEgress();
    for(const patch of [{address:'127.0.0.1'},{serverName:'attacker.invalid'},
      {init:{...input.init,headers:{authorization:'Bearer private'}}},
      {init:{...input.init,signal:AbortSignal.abort()}}])
      await expect(client.requestPinned({...input,...patch})).rejects.toThrow();
    expect(fake.request).not.toHaveBeenCalled();
  });
  it('never follows redirects or buffers oversized bodies and returns a bodyless304',async()=>{
    const client=createNodeApprovedPinnedEgress();
    response(302,{location:'https://elsewhere.invalid'});
    await expect(client.requestPinned(input)).rejects.toThrow(/Approved source transport unavailable/);
    response(200,{},Buffer.alloc(256*1024+1));
    await expect(client.requestPinned(input)).rejects.toThrow(/Approved source transport unavailable/);
    response(304,{},Buffer.alloc(0));
    const unchanged=await client.requestPinned(input);expect(unchanged.status).toBe(304);expect(unchanged.body).toBeNull();
  });
  it('sanitizes socket/TLS errors without publishing endpoints or original input',async()=>{
    const client=createNodeApprovedPinnedEgress();
    fake.request.mockImplementation(()=>{throw new Error('private raw upstream diagnostic');});
    await expect(client.requestPinned(input)).rejects.toThrow('Approved source transport unavailable');
  });
});
