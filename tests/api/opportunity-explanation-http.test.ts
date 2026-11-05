import {receiptFailure,receiptFailureCases} from './receipt-admission-fixture.js';
import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {TrustedOpportunityExplanationSource,TrustedOpportunityExplanationRights} from '../../apps/api/src/modules/opportunities/opportunity-explanation-http.js';
import {OpportunityExplanationResponseSchema} from '../../packages/contracts/src/self/opportunity-explanation.js';

const NOW='2026-11-01T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-OWNER',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const query={asOf:NOW,sourceRevisionId:'SYN-REV',rankConfigVersion:'rank-v1.0'};
const explanation={...query,opportunityId:'SYN-OPP',state:'NOT_FEATURED',
  reason:'LOW_RELEVANCE',notes:[],evidenceRefs:[],provenance:'CODE_RULES'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(a=>a.close()));apps.length=0;});
function harness(){
  const seen:string[]=[];let allowed=true,current=true,enabled=true,approved=true;
  let value:unknown=explanation;
  let snapshotVersion:string|undefined='a'.repeat(64);
  let onPreauthorize=()=>{},onSourceRecheck=()=>{};
  const source:TrustedOpportunityExplanationSource={
    inspect:async input=>{seen.push('inspect:'+input.actorId);return {explanation:value,
      receipt:'SYN-SOURCE-RECEIPT',coreVersion:'SYN-CORE-117',...(snapshotVersion?{snapshotVersion}:{})};},
    revalidate:async()=>{seen.push('source-recheck');onSourceRecheck();return current;},
  };
  const rights:TrustedOpportunityExplanationRights={
    mayInspect:async()=>{seen.push('preauthorize');onPreauthorize();return allowed;},
    authorize:async input=>{seen.push('authorize');return {
      allowed:allowed&&input.explanation.evidenceRefs.every(x=>x==='SYN-EV'),
      receipt:'SYN-RIGHTS-RECEIPT'};},
    revalidate:async()=>{seen.push('rights-recheck');return allowed;},
  };
  const verify=async()=>enabled?actor:null;
  const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:verify,revokeSession:async()=>{}},now:()=>NOW,
    opportunityExplanation:{source,rights,approval:{isApproved:async()=>approved}}});
  apps.push(app);
  const post=(body:unknown=query,id='SYN-OPP')=>app.inject({method:'POST',
    url:'/api/opportunities/'+id+'/explanation',
    headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},payload:body as object});
  return {app,post,seen,source,rights,set:(x:unknown)=>{value=x;},deny:()=>{allowed=false;},
    stale:()=>{current=false;},logout:()=>{enabled=false;},unapprove:()=>{approved=false;},
    onPreauthorize:(hook:()=>void)=>{onPreauthorize=hook;},
    onSourceRecheck:(hook:()=>void)=>{onSourceRecheck=hook;}};
}
describe('#86 safe visible-opportunity explanations',()=>{
  for(const boundary of ['source','rights'] as const){
    it.each(receiptFailureCases)(`preserves $failure through the explanation ${boundary} HTTP boundary`,async({failure,status,code})=>{
      const h=harness(),fail=receiptFailure(failure,actor.actorId);
      if(boundary==='source')h.source.inspect=fail;else h.rights.authorize=fail;
      const response=await h.post();
      expect(response.statusCode).toBe(status);expect(response.json().code).toBe(code);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).not.toContain('SYNTHETIC-PRIVATE-PROVIDER-DETAIL');
    });
  }
  it('binds an optional expected owner-feed version without echoing it as an explanation field',async()=>{
    const same=harness(),ok=await same.post({...query,expectedFeedVersion:'a'.repeat(64)});
    expect(ok.statusCode).toBe(200);expect(ok.json()).toEqual(explanation);
    const changed=harness(),conflict=await changed.post({...query,expectedFeedVersion:'b'.repeat(64)});
    expect(conflict.statusCode).toBe(409);expect(conflict.json().code).toBe('VERSION_CONFLICT');
    expect(changed.seen).toEqual(['preauthorize','inspect:'+actor.actorId]);
  });
  it('returns a strict code decision with no private facts, scores or candidate count',async()=>{
    const h=harness(),r=await h.post();expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual(explanation);expect(r.headers['cache-control']).toBe('no-store');
    expect(h.seen).toEqual(['preauthorize','inspect:'+actor.actorId,'authorize','source-recheck','rights-recheck']);
  });
  it('denies existence before candidate inspection and returns no count or identifiers',async()=>{
    const h=harness();h.deny();const r=await h.post();expect(r.statusCode).toBe(403);
    expect(h.seen).toEqual(['preauthorize']);expect(r.body).not.toContain('SYN-OPP');
  });
  it('requires authentication, CSRF and strict non-authoritative browser input',async()=>{
    const h=harness();
    expect((await h.app.inject({method:'POST',url:'/api/opportunities/SYN-OPP/explanation',
      headers:{origin:ORIGIN},payload:query})).statusCode).toBe(403);
    expect((await h.post({...query,actorId:'SYN-OTHER'})).statusCode).toBe(422);
    expect((await h.post({...query,asOf:'2026-12-01T00:00:00Z'})).statusCode).toBe(422);
    h.logout();expect((await h.post()).statusCode).toBe(401);expect(h.seen).toEqual([]);
  });
  it.each(['opportunityId','sourceRevisionId','rankConfigVersion','asOf'] as const)
    ('rejects mismatched %s without leaking the provider result',async key=>{
      const h=harness();h.set({...explanation,[key]:key==='asOf'?'2026-10-01T00:00:00Z':'SYN-OTHER'});
      const r=await h.post();expect(r.statusCode).toBe(409);expect(r.body).not.toContain('SYN-OTHER');
    });
  it('does not trust provider approval, private fields or unauthorized evidence',async()=>{
    const h=harness();h.unapprove();expect((await h.post()).statusCode).toBe(503);
    h.set({...explanation,score:15});expect((await h.post()).statusCode).toBe(503);
    const other=harness();other.set({...explanation,evidenceRefs:['HIDDEN-EV']});
    expect((await other.post()).statusCode).toBe(403);
  });
  it('discards results if source or consent changed while evaluating',async()=>{
    const h=harness();h.stale();expect((await h.post()).statusCode).toBe(403);
    const late=harness();late.set({...explanation,notes:['NOT_EVALUATED'],reason:'ELIGIBILITY_NOT_MET'});
    expect((await late.post()).statusCode).toBe(503);
  });
  it('does not inspect an owner source after logout during preauthorization',async()=>{
    const h=harness();h.onPreauthorize(h.logout);
    expect((await h.post()).statusCode).toBe(401);
    expect(h.seen).toEqual(['preauthorize']);
  });
  it('blocks a core approval revoked during the awaited final source check',async()=>{
    const h=harness();h.onSourceRecheck(h.unapprove);
    expect((await h.post()).statusCode).toBe(503);
  });
  it('cannot confuse featured, unknown and negative decisions in the wire',()=>{
    expect(OpportunityExplanationResponseSchema.safeParse({...explanation,state:'FEATURED'}).success).toBe(false);
    expect(OpportunityExplanationResponseSchema.safeParse({...explanation,reason:'NOT_EVALUATED',evidenceRefs:['SYN-EV']}).success).toBe(false);
    expect(OpportunityExplanationResponseSchema.safeParse({...explanation,reason:'HIDDEN_BY_USER',notes:['ELIGIBILITY_UNKNOWN']}).success).toBe(false);
  });
});
