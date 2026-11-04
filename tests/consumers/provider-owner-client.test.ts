import {describe,expect,it} from 'vitest';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import type {ApprovedProviderInput} from '@hufs-one/contracts';

const item:ApprovedProviderInput={inputRef:'SYN-INPUT',operation:'HCX_007',task:'opportunity_terms',
  asOf:'2026-11-03T01:00:00.000Z',expiresAt:'2026-11-04T01:00:00.000Z'};
const jobId='00000000-0000-4000-8000-000000000001';
const candidate={task:'opportunity_terms',reviewRequired:true,reviewState:'NEEDS_REVIEW',
  citations:[{sourceToken:'DOC1',paragraphId:'p1',quote:'Synthetic approved notice'}],
  objectTokens:[],usage:{promptTokens:40,completionTokens:20,totalTokens:60}};
type Seen={url:string;init:RequestInit};
function harness(payload:(path:string)=>unknown){
  const calls:Seen[]=[];
  const api=new HufsApiClient(async(url,init)=>{
    calls.push({url,init});return Response.json(payload(url),{status:200});
  });
  return {api,calls};
}
describe('BETA Provider browser client (separate from REVIEWER MOCK)',()=>{
  it('gets server-authorized refs without actor, raw packet, URL or client-side role fields',async()=>{
    const h=harness(()=>({items:[item]}));
    const inputs=await h.api.owner.getApprovedProviderInputs();
    expect(inputs.items).toEqual([item]);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({url:'/api/ai/approved-inputs',init:{
      method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',
    }});
    expect(h.calls[0]!.init.body).toBeUndefined();
  });
  it('requires exact task/input pair, valid idempotency and CSRF before mutation',async()=>{
    const h=harness(path=>path==='/api/auth/csrf'?{csrfToken:'C'.repeat(32)}
      :{jobId,state:'PENDING'});
    await expect(h.api.owner.submitApprovedProvider(item,'experience-skills','KEY00001'))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(h.api.owner.submitApprovedProvider(item,'opportunity-terms','short'))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(h.calls).toHaveLength(0);
    const res=await h.api.owner.submitApprovedProvider(item,'opportunity-terms','KEY00001');
    expect(res).toEqual({jobId,state:'PENDING'});
    expect(h.calls.map(c=>c.url)).toEqual(['/api/auth/csrf','/api/ai/opportunity-terms']);
    // JSON key order is not part of the HTTP contract: verify its parsed fields instead.
    expect(h.calls[1]!.init).toMatchObject({method:'POST',credentials:'same-origin',cache:'no-store'});
    expect(JSON.parse(String(h.calls[1]!.init.body))).toEqual({
      packetRef:'SYN-INPUT',asOf:item.asOf,idempotencyKey:'KEY00001',
    });
    const headers=new Headers(h.calls[1]!.init.headers);
    expect(headers.get('x-csrf-token')).toBe('C'.repeat(32));
  });
  it('rejects invented LIVE provenance on PENDING and model output injected into acceptance',async()=>{
    for(const result of [{jobId,state:'PENDING',provenance:'LIVE'},
      {jobId,state:'NEEDS_REVIEW',provenance:'MOCK'},
      {jobId,state:'NEEDS_REVIEW',provenance:'LIVE',candidate}]) {
      const h=harness(path=>path==='/api/auth/csrf'?{csrfToken:'C'.repeat(32)}:result);
      await expect(h.api.owner.submitApprovedProvider(item,'opportunity-terms','KEY00001'))
        .rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    }
  });
  it('reads only current cached NEEDS_REVIEW task; missing, false billing and forged receipts fail closed',async()=>{
    const good={jobId,state:'NEEDS_REVIEW',billing:'SETTLED',provenance:'CANDIDATE_CACHE',candidate};
    const h=harness(()=>good);
    expect(await h.api.owner.readApprovedProviderJob(jobId,'opportunity-terms')).toEqual(good);
    await expect(h.api.owner.readApprovedProviderJob(jobId,'graduation-explanation'))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    await expect(h.api.owner.readApprovedProviderJob('not-a-uuid','opportunity-terms'))
      .rejects.toMatchObject({code:'INVALID_INPUT'});
    for(const invalid of [{...good,billing:'UNKNOWN_BILLING'},
      {...good,candidate:{...candidate,reviewRequired:false}},
      {...good,provenance:'LIVE'}]) {
      await expect(harness(()=>invalid).api.owner.readApprovedProviderJob(jobId,'opportunity-terms'))
        .rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    }
  });
});
