import {afterEach,describe,expect,it} from 'vitest';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {registerOpportunityRevisionComparisonRoutes} from
  '../../apps/api/src/modules/opportunities/opportunity-revision-comparison-http.js';
import type {TrustedOpportunityRevisionComparisonSource,TrustedOpportunityRevisionComparisonRights} from
  '../../apps/api/src/modules/opportunities/opportunity-revision-comparison.js';

const NOW='2026-11-01T00:00:00.000Z',ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-OWNER-A',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const input={beforeRevisionId:'rev1',afterRevisionId:'rev2',asOf:NOW};
const claim=(at:string)=>({field:'DEADLINE',value:{kind:'FIXED',at},evidenceRefs:['ev1']});
const revision=(id:string,capturedAt:string,at:string)=>({revisionId:id,sourceId:'source1',
  opportunityId:'opp1',reviewState:'REVIEWED',status:'ACTIVE',changeKind:'CORRECTED',
  capturedAt,checkedAt:'2026-10-31T00:00:00.000Z',verifiedAt:'2026-10-30T00:00:00.000Z',
  contentSha256:(id==='rev1'?'a':'b').repeat(64),claims:[claim(at)],dataMode:'SYNTHETIC',deliveryMode:'REPLAY'});
function snapshot(){return {actorId:actor.actorId,opportunityId:'opp1',sourceId:'source1',
  asOf:NOW,currentRevisionId:'rev2',receipt:'SYN-SOURCE-RECEIPT',
  before:revision('rev1','2026-10-20T00:00:00.000Z','2026-11-20T09:00:00Z'),
  after:revision('rev2','2026-10-25T00:00:00.000Z','2026-11-25T09:00:00Z')};}
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});
function fixture(options:{missingSource?:boolean;missingRights?:boolean}={}){
  let value:unknown=snapshot(),mayRead=true,mayDisclose=true,sourceValid=true,rightsValid=true;
  let identity:typeof actor|null=actor,late:undefined|(()=>void),checkValues=false,logoutPre=false;
  const seen:string[]=[];
  const source:TrustedOpportunityRevisionComparisonSource={
    inspect:async()=>{seen.push('source');return value;},
    revalidate:async()=>{seen.push('source-recheck');return sourceValid;},
  };
  const rights:TrustedOpportunityRevisionComparisonRights={
    mayInspect:async()=>{seen.push('rights-first');if(logoutPre)identity=null;return mayRead;},
    authorize:async args=>{seen.push('disclose');
      expect(args.revisions.map(r=>r.revisionId)).toEqual(['rev1','rev2']);
      expect(args.revisions[0]).toMatchObject({capturedAt:'2026-10-20T00:00:00.000Z',
        checkedAt:'2026-10-31T00:00:00.000Z',verifiedAt:'2026-10-30T00:00:00.000Z',
        contentSha256:'a'.repeat(64),reviewState:'REVIEWED',status:'ACTIVE',
        changeKind:'CORRECTED',sourceId:'source1',opportunityId:'opp1',
        dataMode:'SYNTHETIC',deliveryMode:'REPLAY'});
      const valuesAllowed=!checkValues||args.revisions.every(r=>r.claims.every(c=>
        c.field!=='DEADLINE'||c.value.kind!=='FIXED'
        ||['2026-11-20T09:00:00Z','2026-11-25T09:00:00Z'].includes(c.value.at)));
      return {allowed:mayDisclose&&valuesAllowed,rightsReceipt:'SYN-RIGHTS-RECEIPT'};},
    revalidate:async()=>{seen.push('rights-recheck');late?.();return rightsValid;},
  };
  const verify=async()=>identity;
  const app=createApi({repository:new MemoryApiRepository({profiles:[]}),
    allowedOrigin:ORIGIN,verifySession:verify,now:()=>NOW});apps.push(app);
  registerOpportunityRevisionComparisonRoutes({app,session:{verify,now:()=>NOW},
    ...(options.missingSource?{}:{source}),...(options.missingRights?{}:{rights})});
  const post=(payload:Record<string,unknown>=input)=>app.inject({method:'POST',
    url:'/api/opportunities/opp1/revisions/compare',
    headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},payload});
  return {app,post,seen,set:(next:unknown)=>{value=next;},
    denyRead:()=>{mayRead=false;},denyDisclosure:()=>{mayDisclose=false;},
    revokeSource:()=>{sourceValid=false;},revokeRights:()=>{rightsValid=false;},
    logout:()=>{identity=null;},changeActorLate:()=>{late=()=>{identity={...actor,actorId:'other'};};},
    checkValues:()=>{checkValues=true;},
    logoutDuringPreauthorization:()=>{logoutPre=true;},
  };
}
describe('#119 reviewed opportunity revision comparison',()=>{
  it('compares 11/20 to 11/25 as an extension with separate observed/reviewed times',async()=>{
    const h=fixture(),r=await h.post();expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({state:'READY',opportunityId:'opp1',asOf:NOW,
      changes:[{field:'DEADLINE',kind:'EXTENDED'}],
      after:{revisionId:'rev2',deliveryMode:'REPLAY',
        capturedAt:'2026-10-25T00:00:00.000Z',checkedAt:'2026-10-31T00:00:00.000Z',
        verifiedAt:'2026-10-30T00:00:00.000Z'}});
    expect(r.headers['cache-control']).toBe('no-store');
    expect(h.seen).toEqual(['rights-first','source','disclose','source-recheck','rights-recheck']);
  });
  it('detects shortening, cancellation and eligibility changes without applicant inference',async()=>{
    const h=fixture(),v=snapshot();
    v.after.claims=[claim('2026-11-19T09:00:00Z')];h.set(v);
    expect((await h.post()).json().changes).toEqual([{field:'DEADLINE',kind:'SHORTENED'}]);
    const cancelled={...v,after:{...v.after,status:'CANCELLED',claims:[
      {field:'STATUS',value:'CANCELLED',evidenceRefs:['ev1']},
      {field:'ELIGIBILITY',value:[{field:'campus',operator:'EQ',value:'SEOUL'}],evidenceRefs:['ev1']},
    ]},before:{...v.before,claims:[{field:'STATUS',value:'OPEN',evidenceRefs:['ev1']}]}};
    h.set(cancelled);const r=await h.post();expect(r.statusCode).toBe(200);
    expect(r.json().changes).toEqual([{field:'STATUS',kind:'CANCELLED'}]);
    expect(r.json().comparisons).toEqual([{field:'DEADLINE',state:'UNKNOWN'},
      {field:'STATUS',state:'CHANGED'},{field:'ELIGIBILITY',state:'UNKNOWN'}]);
  });
  it('equal hashes/304 observations never advance verification or fabricate changes',async()=>{
    const h=fixture(),v=snapshot();v.after.claims=v.before.claims;
    v.after.contentSha256=v.before.contentSha256;h.set(v);
    const r=await h.post();expect(r.statusCode).toBe(200);
    expect(r.json().changes).toEqual([]);
    expect(r.json().after.verifiedAt).toBe('2026-10-30T00:00:00.000Z');
    const unverified={...v,after:{...v.after,verifiedAt:undefined,reviewState:'PENDING'}};h.set(unverified);
    const pending=await h.post();expect(pending.statusCode).toBe(200);
    expect(pending.json()).toEqual({state:'NEEDS_REVIEW',opportunityId:'opp1',...input,
      reason:'REVISION_NOT_REVIEWED'});
  });
  it.each(['PENDING','CONFLICT','UNKNOWN'])('suppresses all contents for review state %s',async state=>{
    const h=fixture(),v=snapshot();h.set({...v,after:{...v.after,reviewState:state}});
    const r=await h.post();expect(r.statusCode).toBe(200);
    expect(r.json().state).toBe('NEEDS_REVIEW');expect(r.json()).not.toHaveProperty('before');
    expect(r.json()).not.toHaveProperty('claims');expect(r.json()).not.toHaveProperty('evidenceRefs');
  });
  it('denies withdrawn revisions and does not fall back from a new unreviewed head',async()=>{
    const h=fixture(),v=snapshot();h.set({...v,after:{...v.after,status:'WITHDRAWN'}});
    expect((await h.post()).statusCode).toBe(403);
    h.set({...v,currentRevisionId:'rev3'});expect((await h.post()).statusCode).toBe(409);
  });
  it('rejects identical/reversed pairs, browser actor fields, future asOf and query extras',async()=>{
    const h=fixture();
    expect((await h.post({...input,afterRevisionId:'rev1'})).statusCode).toBe(422);
    expect((await h.post({...input,actorId:'other'})).statusCode).toBe(422);
    expect((await h.post({...input,asOf:'2026-12-01T00:00:00Z'})).statusCode).toBe(422);
    const v=snapshot();h.set({...v,before:{...v.before,capturedAt:'2026-10-26T00:00:00Z'}});
    expect((await h.post()).statusCode).toBe(409);
  });
  it.each(['actorId','opportunityId','sourceId','asOf'])('denies provider binding mismatch %s',async field=>{
    const h=fixture(),v=snapshot();h.set({...v,[field]:field==='asOf'?'2026-10-31T00:00:00Z':'other'});
    expect((await h.post()).statusCode).toBe(503);
  });
  it('rejects substituted revisions, cross-source and replayed future verification',async()=>{
    const h=fixture(),v=snapshot();
    for(const after of [{...v.after,revisionId:'rev3'},{...v.after,sourceId:'other'},
      {...v.after,verifiedAt:'2026-11-02T00:00:00Z'},
      {...v.after,claims:[{...claim('2026-11-25T09:00:00Z'),rawOriginal:'private'}]}]){
      h.set({...v,after});expect((await h.post()).statusCode).toBe(503);
    }
  });
  it('fails closed for absent adapters and independent denial before source reads',async()=>{
    for(const options of [{missingSource:true},{missingRights:true}]){
      const h=fixture(options);expect((await h.post()).statusCode).toBe(503);expect(h.seen).toEqual([]);
    }
    const h=fixture();h.denyRead();expect((await h.post()).statusCode).toBe(403);
    expect(h.seen).toEqual(['rights-first']);
  });
  it('denies evidence disclosure, source/rights revocation, and actor changes during final checks',async()=>{
    for(const action of ['denyDisclosure','revokeSource','revokeRights','changeActorLate'] as const){
      const h=fixture();h[action]();const r=await h.post();expect(r.statusCode).toBe(403);
      expect(r.json()).not.toHaveProperty('before');
    }
  });
  it('enforces session and global Origin/CSRF protections',async()=>{
    const h=fixture();const r=await h.app.inject({method:'POST',
      url:'/api/opportunities/opp1/revisions/compare',headers:{origin:ORIGIN},payload:input});
    expect(r.statusCode).toBe(403);h.logout();expect((await h.post()).statusCode).toBe(401);
    expect(h.seen).toEqual([]);
  });
  it('reports changed eligibility only when both reviewed condition sets are present',async()=>{
    const h=fixture(),v=snapshot();
    const condition=(campus:string)=>({field:'ELIGIBILITY',value:[{
      field:'campus',operator:'EQ',value:campus}],evidenceRefs:['ev1']});
    h.set({...v,before:{...v.before,claims:[condition('SEOUL')]},
      after:{...v.after,claims:[condition('GLOBAL')]}});
    const r=await h.post();expect(r.statusCode).toBe(200);
    expect(r.json().changes).toEqual([{field:'ELIGIBILITY',kind:'CHANGED'}]);
  });
  it('requires independent exact value authorization despite a REVIEWED flag',async()=>{
    const h=fixture(),v=snapshot();h.checkValues();
    h.set({...v,after:{...v.after,claims:[claim('2026-12-01T09:00:00Z')]}});
    expect((await h.post()).statusCode).toBe(403);
    expect(h.seen).toEqual(['rights-first','source','disclose']);
  });
  it('suppresses contradictory hash/cancellation metadata and never promotes unknown changes',async()=>{
    const h=fixture(),v=snapshot();
    for(const after of [{...v.after,contentSha256:v.before.contentSha256},
      {...v.after,status:'CANCELLED'},
      {...v.after,changeKind:'CANCELLED'}]){
      h.set({...v,after});const r=await h.post();expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({...input,opportunityId:'opp1',state:'NEEDS_REVIEW',reason:'REVISION_CONFLICT'});
    }
    h.set({...v,after:{...v.after,changeKind:'UNKNOWN'}});
    expect((await h.post()).json()).toEqual({...input,opportunityId:'opp1',
      state:'NEEDS_REVIEW',reason:'REVISION_UNKNOWN'});
  });
  it('keeps future replay observations unavailable and does not rewrite checkedAt',async()=>{
    const h=fixture(),v=snapshot();h.set({...v,after:{...v.after,checkedAt:'2026-11-02T00:00:00Z'}});
    expect((await h.post()).statusCode).toBe(503);
  });
  it('rechecks the live session after preauthorization and before the source read',async()=>{
    const h=fixture();h.logoutDuringPreauthorization();
    expect((await h.post()).statusCode).toBe(401);
    expect(h.seen).toEqual(['rights-first']);
  });
  it('does not create equal-hash conflicts from reordered eligibility conjunctions or set values',async()=>{
    const h=fixture(),v=snapshot();
    const claims=(value:unknown)=>[{field:'ELIGIBILITY',value,evidenceRefs:['ev1']}];
    const before=[{field:'campus',operator:'IN',value:['SEOUL','GLOBAL']},
      {field:'major',operator:'NOT_IN',value:['A','B']}];
    const after=[{field:'major',operator:'NOT_IN',value:['B','A']},
      {field:'campus',operator:'IN',value:['GLOBAL','SEOUL']}];
    h.set({...v,before:{...v.before,claims:claims(before)},
      after:{...v.after,contentSha256:v.before.contentSha256,claims:claims(after)}});
    const r=await h.post();expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({state:'READY',changes:[],comparisons:[
      {field:'DEADLINE',state:'UNKNOWN'},{field:'STATUS',state:'UNKNOWN'},
      {field:'ELIGIBILITY',state:'UNCHANGED'}]});
    expect(r.json().before.claims[0].value).toEqual(before);
    expect(r.json().after.claims[0].value).toEqual(after);
  });
});
