import {describe,it,expect,vi} from 'vitest';
import {requireCurrentSourceRefreshPreflight} from
  '../../apps/api/src/modules/opportunities/source-refresh-operator-preflight.js';
import {syntheticPreflightDraft} from './fixtures/source-refresh-preflight.js';

const input={sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',
  canonicalUrl:'https://example.org/approved-page',now:'2026-11-11T00:00:00Z'};
const create=(transform:(draft:ReturnType<typeof syntheticPreflightDraft>)=>unknown)=>({
  loadCurrent:vi.fn(async()=>transform(syntheticPreflightDraft(input))),
});

describe('#445 private operator source preflight wired to actual acquisition',()=>{
  it('admits only a matching, currently reviewed synthetic source',async()=>{
    const f=create(x=>x);
    await expect(requireCurrentSourceRefreshPreflight(f,input)).resolves.toBeUndefined();
    expect(f.loadCurrent).toHaveBeenCalledWith(input);
    expect(f.loadCurrent).toHaveBeenCalledTimes(1);
  });

  const invalidCases:Array<[string,(x:ReturnType<typeof syntheticPreflightDraft>)=>unknown]>=[
    ['foreign source',x=>({...x,registration:{...x.registration,sourceId:'SYN-OTHER'}})],
    ['foreign permission',x=>({...x,registration:{...x.registration,permissionRef:'SYN-OTHER'}})],
    ['replaced URL',x=>({...x,pageUrl:'https://example.org/another'})],
    ['unreviewed robots',x=>({...x,scope:{...x.scope,robotsStatus:'UNKNOWN'}})],
    ['restricted terms',x=>({...x,scope:{...x.scope,termsStatus:'RESTRICTED'}})],
    ['collect disallowed',x=>({...x,registration:{...x.registration,rights:{...x.registration.rights,collect:false}}})],
    ['budget exhausted',x=>({...x,remainingRequests:0})],
    ['bytes exhausted',x=>({...x,remainingBytes:0})],
    ['attempts exhausted',x=>({...x,attemptsForUrl:1})],
    ['retry after',x=>({...x,retryAfter:'2026-11-11T00:15:00Z'})],
    ['access controlled',x=>({...x,lastHttpStatus:403})],
    ['unbound request time',x=>({...x,now:'2026-11-10T00:00:00Z'})],
    ['path not reviewed',x=>({...x,scope:{...x.scope,pathPrefixes:['/other']}})],
  ];
  it.each(invalidCases)('rejects %s before source fetch',async (_label,transform)=>{
    const f=create(transform);
    await expect(requireCurrentSourceRefreshPreflight(f,input))
      .rejects.toThrow('Approved source preflight blocked');
    expect(f.loadCurrent).toHaveBeenCalledOnce();
  });
  it('redacts an operator error and rejects missing proof or loader',async()=>{
    await expect(requireCurrentSourceRefreshPreflight({
      loadCurrent:async()=>{throw new Error('PRIVATE-NCP-SOURCE-OR-CREDENTIAL');},
    },input)).rejects.toThrow('Approved source preflight blocked');
    await expect(requireCurrentSourceRefreshPreflight({loadCurrent:async()=>null},
      input)).rejects.toThrow('Approved source preflight blocked');
  });
});
