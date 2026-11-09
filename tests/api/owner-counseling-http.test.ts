import {afterEach,describe,expect,it,vi} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import type {TrustedOwnerCounselingSource} from '../../apps/api/src/modules/owner-counseling-http.js';
import {closedRepository} from '../../apps/api/src/repository.js';

const NOW='2026-11-08T00:00:00Z',ORIGIN='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-COUNSEL-OWNER',sessionIdHash:'H'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',
  schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
const service={id:'SYN-CAREER-OFFICE',active:true,purposeCodes:['CAREER'],relatedPurposeCodes:[],
  campuses:['SEOUL'],audienceCodes:[],languages:['ko'],
  officialUrl:'https://example.org/counseling',
  verifiedName:{text:'합성 진로상담센터',sourceSpanId:'SYN-S1'},
  source:{sourceId:'SYN-APPROVED-OFFICE',revisionId:'SYN-REV1',status:'VERIFIED' as const,
    rights:'CLEARED' as const,verifiedAt:'2026-01-02T00:00:00Z',
    effectiveFrom:'2026-01-01T00:00:00Z',evidenceSpanIds:['SYN-S1']}};
function fixture(withSource=true){
  let allowed=true,role='BETA',id=actor.actorId,sessionActive=true;
  const port:TrustedOwnerCounselingSource={
    read:vi.fn(async()=>({items:[service],receipt:{actorId:actor.actorId,
      sourceVersion:'SYN-REV1',expiresAt:'2026-11-30T00:00:00Z'}})),
    revalidate:vi.fn(async()=>allowed),
  };
  const app=createIntegratedApi({allowedOrigin:ORIGIN,repository:closedRepository,now:()=>NOW,
    auth:{verifySession:async()=>sessionActive?{...actor,role:role as 'BETA',actorId:id}:null,revokeSession:async()=>{}},
    ...(withSource?{ownerCounseling:port}:{})});
  apps.push(app);
  const send=(body:Record<string,unknown>,csrf=true)=>app.inject({url:'/api/owner/counseling/routes',method:'POST',
    ...(csrf?{headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken}}:{}),payload:body});
  return {app,port,send,revoke:()=>{allowed=false;},switchActor:()=>{id='SYN-OTHER';},
    logout:()=>{sessionActive=false;},setRole:(value:string)=>{role=value;}};
}
describe('#366 read-only owner counseling consumes only trusted current source',()=>{
  it('suggests only verified current office IDs and official URLs under BETA receipt',async()=>{
    const h=fixture(),r=await h.send({purposes:['CAREER']});
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json()).toMatchObject({state:'READY',asOf:NOW,sourceVersion:'SYN-REV1',
      guide:{status:'MATCHES',matches:[{serviceId:'SYN-CAREER-OFFICE',
        serviceName:'합성 진로상담센터',
        officialApplicationUrl:'https://example.org/counseling'}]}});
    expect(h.port.read).toHaveBeenCalledOnce();
    expect(h.port.revalidate).toHaveBeenCalledOnce();
    expect(r.body).not.toContain(actor.actorId);
  });
  it('does not expose an unnamed or unsourced institution as an official office',async()=>{
    for(const verifiedName of [
      {text:'불확인 이름',sourceSpanId:'SYN-MISSING-SPAN'},
      {text:'가상 조작 이름',sourceSpanId:'SYN-OTHER-SPAN'},
    ]){
      const h=fixture();
      h.port.read=vi.fn(async()=>({items:[{...service,verifiedName}],
        receipt:{actorId:actor.actorId,sourceVersion:'SYN-REV1',
          expiresAt:'2026-11-30T00:00:00Z'}}));
      const r=await h.send({purposes:['CAREER']});
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({state:'READY',guide:{
        status:'NO_MATCH',matches:[],excluded:1}});
      expect(r.body).not.toContain('SYN-CAREER-OFFICE');
    }
  });
  it('without an approved operator source the route returns NOT_CONNECTED, not guessed offices',async()=>{
    const h=fixture(false),r=await h.send({purposes:['CAREER']});
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({state:'NOT_CONNECTED',asOf:NOW});
    expect(h.port.read).not.toHaveBeenCalled();
  });
  it('checks current rights and actor again before disclosing office candidates',async()=>{
    const h=fixture();h.revoke();
    expect((await h.send({purposes:['CAREER']})).statusCode).toBe(403);
    h.switchActor();
    expect((await h.send({purposes:['CAREER']})).statusCode).toBe(503);
  });
  it('rejects unverified callers, CSRF omission and client-supplied data',async()=>{
    const h=fixture();
    expect((await h.send({purposes:['CAREER']},false)).statusCode).toBe(403);
    expect((await h.send({purposes:['CAREER'],actorId:'SYN-OTHER'})).statusCode).toBe(422);
    h.setRole('ADMIN');
    expect((await h.send({purposes:['CAREER']})).statusCode).toBe(403);
    h.logout();
    expect((await h.send({purposes:['CAREER']})).statusCode).toBe(401);
  });
});
