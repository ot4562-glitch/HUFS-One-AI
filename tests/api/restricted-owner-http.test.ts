import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {RestrictedOwnerSnapshot} from '../../apps/api/src/modules/private-intake/owner-registry.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';

const NOW='2026-11-02T00:00:00.000Z',ORIGIN='https://synthetic.invalid',URL='/api/private-intake/self';
const owner:VerifiedActor={role:'BETA',actorId:'SYN-RESTRICTED-ACTOR',sessionIdHash:'SYN-SESSION-HASH-0001',
  sessionExpiresAt:'2026-12-01T00:00:00.000Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z',
  betaAllowed:true,csrfToken:'SYN-CSRF-TOKEN-0000000001'};
const snapshot=():RestrictedOwnerSnapshot=>({actorId:owner.actorId,subjectKey:'SYN-PRIVATE-SUBJECT',
  storageNamespace:'SYN-PRIVATE-NAMESPACE',registryRevision:1,
  profile:{primaryMajor:'가상 전공',secondaryMajor:null,secondaryType:'미선택',campus:'가상캠퍼스',cohort:'2025',
    earnedCreditsSelfReported:'0',inProgressCreditsSelfReported:'미응답',interestsSelfReported:'가상 관심'},
  transcript:{version:1,sourceSha256:'a'.repeat(64),state:'STUDENT_REVIEW_PENDING',issueCodes:[],
    records:[{term:'2025-1',courseCode:'SYN101',courseName:'가상 과목',creditUnits:6,category:'가상 구분',ledger:'EARNED'}]},
  offeringStatus:'UNKNOWN',rulesStatus:'NEEDS_REVIEW'});
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function setup(options:{provider?:boolean;identity?:VerifiedActor|null;resolve?:(actorId:string)=>Promise<RestrictedOwnerSnapshot|null>}={}){
  let identity=options.identity===undefined?owner:options.identity;
  const calls:string[]=[];
  const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:new MemoryApiRepository({profiles:[]}),now:()=>NOW,
    auth:{verifySession:async()=>identity,revokeSession:async()=>{}},
    ...(options.provider===false?{}:{restrictedOwnerDirectory:{resolve:async(actorId:string)=>{
      calls.push(actorId);return options.resolve?options.resolve(actorId):snapshot();
    }}}),
  });apps.push(app);
  return {app,calls,setIdentity:(value:VerifiedActor|null)=>{identity=value;}};
}
function expectNoPrivateMetadata(body:string){
  for(const value of ['SYN-PRIVATE-SUBJECT','SYN-PRIVATE-NAMESPACE','registryRevision','subjectKey','actorId','sourceSha256','a'.repeat(64)])
    expect(body).not.toContain(value);
}
describe('restricted owner intake self HTTP',()=>{
  it('denies missing session and spoofed browser identity without reading the directory',async()=>{
    const h=setup({identity:null});
    const r=await h.app.inject({url:URL,headers:{'x-actor-id':owner.actorId}});
    expect(r.statusCode).toBe(401);expect(h.calls).toEqual([]);
  });
  it('denies REVIEWER and unverified BETA admission before reading private data',async()=>{
    for(const identity of [{role:'REVIEWER' as const,actorId:'SYN-REVIEWER',sessionIdHash:owner.sessionIdHash,
      csrfToken:owner.csrfToken,sessionExpiresAt:owner.sessionExpiresAt,verifiedEmail:'synthetic@example.invalid',
      identityProofExpiresAt:owner.sessionExpiresAt},{...owner,betaAllowed:false}]){
      const h=setup({identity}),r=await h.app.inject({url:URL});
      expect(r.statusCode).toBe(403);expect(h.calls).toEqual([]);
    }
  });
  it('fails closed with 503 when the restricted directory is absent',async()=>{
    const h=setup({provider:false}),r=await h.app.inject({url:URL});
    expect(r.statusCode).toBe(503);expectNoPrivateMetadata(r.body);
  });
  it('returns only the authenticated owner pending-review profile and transcript without cache',async()=>{
    const h=setup(),r=await h.app.inject({url:URL});
    expect(r.statusCode).toBe(200);expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toEqual({state:'STUDENT_REVIEW_PENDING',profile:snapshot().profile,
      transcript:{version:1,state:'STUDENT_REVIEW_PENDING',records:snapshot().transcript.records,issueCodes:[]},
      offeringStatus:'UNKNOWN',rulesStatus:'NEEDS_REVIEW'});
    expect(h.calls).toEqual([owner.actorId,owner.actorId]);expectNoPrivateMetadata(r.body);
  });
  it('shows own profile with an explicitly blocked empty malformed transcript and bounded issue codes',async()=>{
    const value:RestrictedOwnerSnapshot={...snapshot(),transcript:{...snapshot().transcript,state:'NEEDS_REVIEW',
      records:[],issueCodes:['HEADER_MISMATCH','HEADER_DUPLICATE']}};
    const h=setup({resolve:async()=>value}),r=await h.app.inject({url:URL});
    expect(r.statusCode).toBe(200);expect(r.json().state).toBe('STUDENT_REVIEW_PENDING');
    expect(r.json().profile).toEqual(value.profile);
    expect(r.json().transcript).toEqual({version:1,state:'NEEDS_REVIEW',records:[],issueCodes:value.transcript.issueCodes});
    expect(r.json().offeringStatus).toBe('UNKNOWN');expect(r.json().rulesStatus).toBe('NEEDS_REVIEW');
    expectNoPrivateMetadata(r.body);
  });
  it('accepts no browser actor, subject, owner or target selection and exposes no foreign direct route',async()=>{
    const h=setup();
    for(const query of ['actorId=foreign','subjectKey=foreign','owner=foreign','target=foreign']){
      const r=await h.app.inject({url:URL+'?'+query});expect(r.statusCode).toBe(422);expectNoPrivateMetadata(r.body);
    }
    expect(h.calls).toEqual([]);
    expect((await h.app.inject({url:'/api/private-intake/foreign'})).statusCode).not.toBe(200);
    expect((await h.app.inject({method:'POST',url:URL,headers:{origin:ORIGIN,'x-csrf-token':owner.csrfToken},payload:{}})).statusCode).not.toBe(200);
  });
  it('denies missing owner/ACL/consent and sanitizes provider errors',async()=>{
    const denied=setup({resolve:async()=>null}),r=await denied.app.inject({url:URL});
    expect(r.statusCode).toBe(403);expectNoPrivateMetadata(r.body);
    const unavailable=setup({resolve:async()=>{throw new Error('PRIVATE-PATH-AND-SQL');}});
    const failed=await unavailable.app.inject({url:URL});expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toContain('PRIVATE-PATH-AND-SQL');
  });
  it('refuses wrong actor, unapproved states, planned transcript or extra directory columns',async()=>{
    const inputs=[{...snapshot(),actorId:'SYN-OTHER'},
      {...snapshot(),rulesStatus:'APPROVED'},
      {...snapshot(),transcript:{...snapshot().transcript,records:[{...snapshot().transcript.records[0]!,ledger:'PLANNED'}]}},
      {...snapshot(),allOwnerRows:['SYN-OTHER']},
      {...snapshot(),transcript:{...snapshot().transcript,state:'NEEDS_REVIEW',issueCodes:['HEADER_MISMATCH']}},
      {...snapshot(),transcript:{...snapshot().transcript,state:'NEEDS_REVIEW',records:[],issueCodes:['PRIVATE-PATH-AND-SQL']}},
      {...snapshot(),transcript:{...snapshot().transcript,state:'STUDENT_REVIEW_PENDING',issueCodes:['HEADER_MISMATCH']}}];
    for(const value of inputs){
      const h=setup({resolve:async()=>value as RestrictedOwnerSnapshot}),r=await h.app.inject({url:URL});
      expect(r.statusCode).toBe(503);expectNoPrivateMetadata(r.body);expect(r.body).not.toContain('SYN-OTHER');
    }
  });
  it('denies registry revocation between first read and response serialization',async()=>{
    let count=0;const h=setup({resolve:async()=>++count===1?snapshot():null});
    const r=await h.app.inject({url:URL});expect(r.statusCode).toBe(403);expectNoPrivateMetadata(r.body);
    expect(r.body).not.toContain('가상 과목');
  });
  it('denies changed registry revision, source hash, transcript or profile on re-resolution',async()=>{
    for(const change of [(s:RestrictedOwnerSnapshot)=>({...s,registryRevision:2}),
      (s:RestrictedOwnerSnapshot)=>({...s,transcript:{...s.transcript,sourceSha256:'b'.repeat(64)}}),
      (s:RestrictedOwnerSnapshot)=>({...s,profile:{...s.profile,primaryMajor:'다른 가상 전공'}}),
      (s:RestrictedOwnerSnapshot)=>({...s,transcript:{...s.transcript,records:[]}})]){
      let count=0;const h=setup({resolve:async()=>++count===1?snapshot():change(snapshot())});
      const r=await h.app.inject({url:URL});expect(r.statusCode).toBe(403);expect(r.body).not.toContain('가상 과목');
    }
  });
  it('denies a server session actor or session-id swap during an awaited directory read',async()=>{
    for(const swapped of [{...owner,actorId:'SYN-OTHER'}, {...owner,sessionIdHash:'SYN-SWAPPED-SESSION'}]){
      const h=setup({resolve:async()=>{h.setIdentity(swapped);return snapshot();}});
      const r=await h.app.inject({url:URL});expect(r.statusCode).toBe(403);expectNoPrivateMetadata(r.body);
      expect(r.body).not.toContain('가상 과목');
    }
  });
});
