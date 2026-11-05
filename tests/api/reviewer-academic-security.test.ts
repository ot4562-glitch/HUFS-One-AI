import {afterEach,describe,expect,it} from 'vitest';
import {DemoSnapshotSchema} from '@hufs-one/contracts';
import type {DemoSnapshot} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {GeneratedSyntheticReviewerRepository} from '../../apps/api/src/modules/auth/reviewer-generated-corpus.js';
import {MemoryReviewerAccessStore,issueReviewerInvitation} from '../../apps/api/src/modules/auth/reviewer.js';
import {MemoryReviewerSandboxStore} from '../../apps/api/src/modules/auth/reviewer-sandbox.js';
import type {VerifiedReviewerActor} from '../../apps/api/src/types.js';

const NOW='2026-11-10T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor:VerifiedReviewerActor={
  actorId:'SYN-JUDGE-01',role:'REVIEWER',verifiedEmail:'judge@example.invalid',
  identityProofExpiresAt:'2026-12-15T00:00:00.000Z',
  sessionExpiresAt:'2026-12-15T00:00:00.000Z',
  sessionIdHash:'S'.repeat(32),csrfToken:'C'.repeat(32),
};
const headers={origin:ORIGIN,'x-csrf-token':actor.csrfToken};
const opened:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(opened.splice(0).map(a=>a.close()));});
const academic=(asOf:string)=>({
  state:'READY' as const,rulePackVersion:'SYN-RULE-1',asOf,
  earnedCreditUnits:4,inProgressCreditUnits:2,plannedCreditUnits:0,
  deficits:[{requirementId:'SYN-REQ-1',missingCreditUnits:2,state:'MISSING' as const,
    evidenceRefs:['EV-SYN-RULE-1']}],
  caveats:['Synthetic academic audit, not an official graduation decision'],
});
const forecast=(asOf:string)=>({
  status:'PARTIAL' as const,asOf,
  items:[{courseId:'SYN-COURSE-1',targetTerm:'2027-1',
    signal:'UNKNOWN' as const,asOf,coverage:'UNKNOWN' as const,
    sameSeasonObservedTerms:0,sameSeasonOfferedTerms:0,evidenceRefs:[],
    caveat:'Synthetic offering forecast, not official scheduling'}],
});
type Mutator=(s:DemoSnapshot)=>unknown;
async function harness(change:Mutator=s=>s){
  const repo=new GeneratedSyntheticReviewerRepository();
  const access=new MemoryReviewerAccessStore();
  const invitation=await issueReviewerInvitation(access,{
    startsAt:'2026-11-01T00:00:00.000Z',endsAt:'2026-12-09T00:00:00.000Z',
    label:'Synthetic review only',maxAccounts:5,
  },{now:'2026-10-31T00:00:00.000Z'});
  const app=createApi({allowedOrigin:ORIGIN,now:()=>NOW,
    verifySession:async()=>actor,reviewerAccess:access,
    reviewerDemo:{
      listProfiles:()=>repo.listProfiles(),
      readSnapshot:async id=>{
        const source=await repo.readSnapshot(id);
        return source?change(DemoSnapshotSchema.parse(source)) as DemoSnapshot:null;
      },
      readSafePacket:()=>Promise.resolve(null),
    },
    reviewerSandbox:new MemoryReviewerSandboxStore(),
    repository:{
      listProfiles:async()=>{throw Error('Forbidden real profiles');},
      readSnapshot:async()=>{throw Error('Forbidden real snapshots');},
      readGrant:async()=>{throw Error('Forbidden real grants');},
      readSafePacket:async()=>{throw Error('Forbidden real AI packets');},
    }});
  opened.push(app);
  const redeemed=await app.inject({method:'POST',url:'/api/reviewer/invitations/redeem',
    headers,payload:{enrollmentCode:invitation.enrollmentCode}});
  expect(redeemed.statusCode).toBe(200);
  const direct=()=>app.inject({url:'/api/reviewer/demo/subjects/S01/snapshot'});
  const context=()=>app.inject({method:'POST',url:'/api/demo/contexts',headers,
    payload:{demoSubjectId:'S01',demoRunId:'SYN-RUN-SECURITY'}});
  return {direct,context,app};
}

describe('REVIEWER server must validate all nested synthetic academic evidence',()=>{
  it.each(['dataMode','id','evidence'])('refuses non-synthetic %s in the additional condition-failure list (#230)',async field=>{
    const h=await harness(s=>{
      const card=s.feed.featured[0]??s.feed.compact[0];
      if(!card)throw new Error('Synthetic fixture requires a card');
      const ineligible={...card,displayMode:'COMPACT_LIST',eligibility:'INELIGIBLE',explanation:undefined,
        opportunityId:field==='id'?'REAL-NOTICE':'SYN-ADDITIONAL',
        dataMode:field==='dataMode'?'REAL':'SYNTHETIC',
        evidenceRefs:field==='evidence'?['EV-REAL-PRIVATE']:['EV-SYN-ADDITIONAL']};
      return {...s,feed:{...s.feed,ineligible:[ineligible]}};
    });
    const direct=await h.direct();
    expect([403,422]).toContain(direct.statusCode);
    expect(direct.body).not.toContain('REAL-NOTICE');
    expect(direct.body).not.toContain('EV-REAL-PRIVATE');
    const created=await h.context();
    expect([403,422]).toContain(created.statusCode);
    expect(created.body).not.toContain('EV-REAL-PRIVATE');
  });
  it('serves a frozen fictitious November 20 scenario on November 10 without pretending it is live',async()=>{
    const h=await harness(),result=await h.direct();
    expect(result.statusCode).toBe(200);
    expect(result.json().asOf).toBe('2026-11-20T00:00:00.000Z');
    const created=await h.context();
    expect(created.statusCode).toBe(201);
    const scoped=await h.app.inject({url:'/api/demo/contexts/'+created.json().contextId+'/snapshot'});
    expect(scoped.statusCode).toBe(200);
    expect(scoped.json().datasetMode).toBe('SYNTHETIC');
    expect(scoped.json().academics).toEqual({state:'PENDING'});
  });
  it('permits only synthetic academic and forecast summaries at the fixture asOf',async()=>{
    const h=await harness(s=>({...s,academics:academic(s.asOf),forecast:forecast(s.asOf)}));
    expect((await h.direct()).statusCode).toBe(200);
    const created=await h.context();expect(created.statusCode).toBe(201);
    const result=await h.app.inject({url:'/api/demo/contexts/'+created.json().contextId+'/graduation'});
    expect(result.statusCode).toBe(200);
    expect(result.json().rulePackVersion).toBe('SYN-RULE-1');
  });
  it.each([
    ['validated model cache',s=>({...s,aiProvenance:'VALIDATED_CACHE'})],
    ['real academic rule',s=>({...s,academics:{...academic(s.asOf),rulePackVersion:'REAL-RULE-2026'}})],
    ['real requirement',s=>({...s,academics:{...academic(s.asOf),deficits:[{
      ...academic(s.asOf).deficits[0],requirementId:'REAL-REQ-1'}]}})],
    ['real academic evidence',s=>({...s,academics:{...academic(s.asOf),deficits:[{
      ...academic(s.asOf).deficits[0],evidenceRefs:['EV-REAL-STUDENT']} ]}})],
    ['future academic asOf',s=>({...s,academics:academic('2026-11-21T09:00:00.000Z')})],
    ['real forecast course',s=>({...s,forecast:{...forecast(s.asOf),items:[{
      ...forecast(s.asOf).items[0],courseId:'REAL-COURSE-123'}]}})],
    ['real forecast citation',s=>({...s,forecast:{...forecast(s.asOf),items:[{
      ...forecast(s.asOf).items[0],evidenceRefs:['EV-REAL-HUFS-001']}]}})],
    ['future forecast summary',s=>({...s,forecast:forecast('2026-11-21T09:00:00.000Z')})],
    ['future forecast item',s=>({...s,forecast:{...forecast(s.asOf),items:[{
      ...forecast(s.asOf).items[0],asOf:'2026-11-21T09:00:00.000Z'}]}})],
  ] as Array<[string,Mutator]>)('refuses %s even under SYNTHETIC root',async(_name,mutate)=>{
    const h=await harness(mutate);
    expect((await h.direct()).statusCode).toBe(403);
    const created=await h.context();
    // Context creation must never accept an unvalidated nested projection either.
    if(created.statusCode===201) {
      expect((await h.app.inject({url:'/api/demo/contexts/'+created.json().contextId+'/snapshot'})).statusCode).toBe(403);
    }else expect(created.statusCode).toBe(403);
  });
});
