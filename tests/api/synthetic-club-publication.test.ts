import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {MemorySyntheticClubDemoStore} from '../../apps/api/src/dev/synthetic-club-store.js';

const origin='https://synthetic.invalid',start='2026-11-20T00:00:00.000Z';
const base={sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const content={clubName:'가상동아리 AI 탐험대',summary:'작은 합성 로봇 프로젝트를 함께 만드는 시연 모임',
  category:'IT_AI',campus:'SEOUL',topicCodes:['AI_ML','DATA_ANALYTICS'],activities:['PROJECT','STUDY'],recruitClosesAt:'2026-11-22T00:00:00.000Z',
  conditions:[],posterAssetId:'SYN-POSTER-CLUB-090',dataMode:'SYNTHETIC'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function fixture(){
  let wall=start,asOf=start,role:'ADMIN'|'BETA'|'REVIEWER'|'ANONYMOUS'='ADMIN',allowed=true;
  const store=new MemorySyntheticClubDemoStore({'synthetic-student':'S01'},()=>wall,{asOf:()=>asOf});
  const app=createIntegratedApi({allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>role==='ANONYMOUS'?null:role==='REVIEWER'
      ?{role,actorId:'synthetic-reviewer',sessionIdHash:base.sessionIdHash,csrfToken:base.csrfToken,
        sessionExpiresAt:base.sessionExpiresAt,verifiedEmail:'reviewer@example.invalid',
        identityProofExpiresAt:base.sessionExpiresAt}
      :{...base,role,actorId:role==='ADMIN'?'synthetic-admin':'synthetic-student'},revokeSession:async()=>{}},
    now:()=>wall,adminAuthority:{isApproved:async()=>allowed},
    syntheticClubs:{source:store.source,moderation:store.moderation,publication:store.publication}});
  apps.push(app);
  const request=(method:'GET'|'POST'|'PATCH',url:string,payload?:unknown)=>app.inject({
    method,url,headers:{origin,'x-csrf-token':base.csrfToken,...(payload===undefined?{}:{'content-type':'application/json'})},...(payload===undefined?{}:{payload:JSON.stringify(payload)})});
  return {store,request,role:(next:typeof role)=>{role=next;},revoke:()=>{allowed=false;},
    at:(next:string)=>{asOf=next;},wall:(next:string)=>{wall=next;},
    create:()=>request('POST','/api/admin/synthetic/clubs',{id:'SYN-CLUB-090',content}),
    edit:(expectedVersion:number,summary='수정 후 다시 검수해야 하는 합성 모집 글')=>
      request('PATCH','/api/admin/synthetic/clubs/SYN-CLUB-090',{expectedVersion,content:{...content,summary}}),
    decide:(decision:'APPROVE'|'REJECT'|'REVOKE',expectedVersion:number)=>
      request('POST','/api/admin/synthetic/clubs/SYN-CLUB-090/decision',{decision,expectedVersion}),
    detail:()=>request('GET','/api/synthetic/clubs/SYN-CLUB-090'),
    list:()=>request('GET','/api/synthetic/clubs')};
}
describe('#123 actual synthetic publication API',()=>{
  it('creates an unpublished revision, approves it, invalidates approval on same-clock edit, and revokes it',async()=>{
    const h=fixture();
    const created=await h.create();
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({record:{version:1,post:{id:'SYN-CLUB-090',state:'REVIEW_PENDING'},
      sourceRef:'SYNTHETIC_CLUB_DEMO_V1',lastActor:{actorId:'synthetic-admin',role:'ADMIN'}}});
    h.role('BETA');expect((await h.detail()).statusCode).toBe(403);
    h.role('ADMIN');expect((await h.decide('APPROVE',1)).statusCode).toBe(200);
    h.role('BETA');
    expect((await h.detail()).json().item.post.summary).toBe(content.summary);
    const before=(await h.list()).json();
    expect(before.recommendedIds).toContain('SYN-CLUB-090');
    h.role('ADMIN');
    const edited=await h.edit(2);
    expect(edited.statusCode).toBe(200);
    expect(edited.json().record.post.state).toBe('REVIEW_PENDING');
    expect(edited.json().record.post).not.toHaveProperty('approvedAt');
    h.role('BETA');expect((await h.detail()).statusCode).toBe(403);
    expect((await h.list()).json().recommendedIds).not.toContain('SYN-CLUB-090');
    h.role('ADMIN');expect((await h.decide('APPROVE',3)).statusCode).toBe(200);
    h.role('BETA');expect((await h.detail()).json().item.post.summary).toContain('다시 검수');
    h.role('ADMIN');expect((await h.decide('REVOKE',4)).statusCode).toBe(200);
    h.role('BETA');expect((await h.detail()).statusCode).toBe(403);
    expect((await h.list()).json().recommendedIds).not.toContain('SYN-CLUB-090');
  });
  it('rejects duplicate creation and stale edits/decisions as 409 without overwriting the winning version',async()=>{
    const h=fixture();expect((await h.create()).statusCode).toBe(201);
    expect((await h.create()).statusCode).toBe(409);
    const results=await Promise.all([h.edit(1,'첫 번째 합성 수정'),h.edit(1,'두 번째 합성 수정')]);
    expect(results.map(x=>x.statusCode).sort()).toEqual([200,409]);
    expect((await h.decide('APPROVE',1)).statusCode).toBe(409);
    const admin=await h.request('GET','/api/admin/synthetic/clubs');
    expect(admin.statusCode).toBe(200);
    expect(admin.json().records.find((x:{post:{id:string}})=>x.post.id==='SYN-CLUB-090').version).toBe(2);
  });
  it('denies anonymous, students, reviewers, unapproved administrators and expired sessions before writes',async()=>{
    const h=fixture();
    h.role('ANONYMOUS');expect((await h.create()).statusCode).toBe(401);
    h.role('BETA');expect((await h.create()).statusCode).toBe(403);
    h.role('REVIEWER');expect((await h.create()).statusCode).toBe(403);
    h.role('ADMIN');h.revoke();expect((await h.create()).statusCode).toBe(403);
    const expired=fixture();expired.wall('2026-12-01T00:00:00Z');
    expect((await expired.create()).statusCode).toBe(401);
  });
  it('never accepts browser role, source, state or asOf claims',async()=>{
    const h=fixture();
    for(const forged of [{actorId:'synthetic-other'},{role:'ADMIN'},{asOf:start},{sourceRef:'REAL_SCHOOL'},
      {approvedAt:start},{state:'APPROVED'}]){
      const result=await h.request('POST','/api/admin/synthetic/clubs',
        {id:'SYN-CLUB-090',content,...forged});
      expect(result.statusCode).toBe(422);
    }
  });
  it('does not expose future revisions, and a revoked record never reappears during an earlier replay',async()=>{
    const h=fixture();expect((await h.create()).statusCode).toBe(201);
    h.at('2026-11-21T00:00:00.000Z');expect((await h.decide('APPROVE',1)).statusCode).toBe(200);
    h.at(start);h.role('BETA');expect((await h.detail()).statusCode).toBe(403);
    h.at('2026-11-21T00:00:00.000Z');expect((await h.detail()).statusCode).toBe(200);
    h.role('ADMIN');expect((await h.decide('REVOKE',2)).statusCode).toBe(200);
    h.role('BETA');expect((await h.detail()).statusCode).toBe(403);
    h.at(start);expect((await h.detail()).statusCode).toBe(403);
  });
});
