import {describe,expect,it} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';

const at='2026-11-03T00:00:00.000Z';
const available={opportunityId:'SYN-OPP',asOf:at,available:true,
  beforeRevisionId:'SYN-R1',afterRevisionId:'SYN-R2'} as const;
function harness(payload:unknown){
  const calls:Array<{url:string;init:RequestInit}>=[];
  const api=new HufsApiClient(async(url,init)=>{
    calls.push({url,init});
    return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
  });
  return {api,calls};
}
describe('#119 approved revision context owner client',()=>{
  it('makes a same-origin, cacheless abortable GET with no subject or raw data',async()=>{
    const h=harness(available),signal=new AbortController().signal;
    expect(await h.api.owner.getRevisionComparisonContext('SYN-OPP',at,signal)).toEqual(available);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.url).toBe('/api/opportunities/SYN-OPP/revisions/comparison-context?asOf='+
      encodeURIComponent(at));
    expect(h.calls[0]!.init).toMatchObject({method:'GET',signal,credentials:'same-origin',
      cache:'no-store',redirect:'error'});
    expect(JSON.stringify(h.calls)).not.toMatch(/actorId|subjectId|sourceText/);
  });
  it('accepts an authorized negative result without fabricating hidden revision IDs',async()=>{
    const unavailable={opportunityId:'SYN-OPP',asOf:at,available:false};
    expect(await harness(unavailable).api.owner.getRevisionComparisonContext('SYN-OPP',at))
      .toEqual(unavailable);
  });
  it('rejects mismatched opportunity, timestamps, raw source fields and bad reply shape',async()=>{
    for(const bad of [{...available,opportunityId:'SYN-OTHER'},
      {...available,asOf:'2026-11-02T00:00:00.000Z'},
      {...available,sourceUrl:'https://private.invalid/source'},
      {...available,beforeRevisionId:available.afterRevisionId}]){
      const expected=('sourceUrl' in bad||bad.beforeRevisionId===bad.afterRevisionId)
        ?'PROVIDER_UNAVAILABLE':'VERSION_CONFLICT';
      await expect(harness(bad).api.owner.getRevisionComparisonContext('SYN-OPP',at))
        .rejects.toMatchObject({code:expected});
    }
    const h=harness(available);
    await expect(h.api.owner.getRevisionComparisonContext('bad/id',at))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(h.calls).toHaveLength(0);
  });
});
