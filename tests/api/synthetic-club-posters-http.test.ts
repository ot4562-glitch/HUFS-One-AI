import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {MemorySyntheticClubDemoStore} from '../../apps/api/src/dev/synthetic-club-store.js';

const bytes=readFileSync(new URL('../../packages/fixtures/synthetic/clubs/generated/ai-club-poster-v1.png',import.meta.url));
const descriptor={assetId:'SYN-POSTER-CLUB-090',sha256:'93446df5cc9a2859585e4801df7a74b7f602d71ae8084a4a51f5b563855af842',
  byteLength:1528702,width:1672,height:941,mimeType:'image/png' as const,
  alt:'가상 학생 세 명이 노트북과 작은 로봇을 함께 살펴보는 AI 생성 합성 그림. 실제 동아리나 학생이 아닙니다.',
  provenance:{kind:'AI_GENERATED_SYNTHETIC' as const,generator:'OpenAI imagegen' as const,
    generatedAt:null,recordedAt:'2026-11-04T23:10:31Z',reference:'GENERATED-CLUB-POSTER-20261105-V1'}};
const at='2026-11-20T00:00:00.000Z',origin='https://synthetic.invalid';
const base={sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const content={clubName:'가상동아리 AI 탐험대',summary:'합성 로봇 프로젝트 시연',category:'IT_AI',campus:'SEOUL',
  topicCodes:['AI_ML'],activities:['PROJECT'],conditions:[],posterAssetId:descriptor.assetId,dataMode:'SYNTHETIC'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
function fixture(){
  let role:'ADMIN'|'BETA'|'ANONYMOUS'='ADMIN',duringRead:undefined|(()=>Promise<void>),tamper=false;
  const store=new MemorySyntheticClubDemoStore({'synthetic-student':'S01'},()=>at);
  const app=createIntegratedApi({allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>role==='ANONYMOUS'?null:{...base,role,
      actorId:role==='ADMIN'?'synthetic-admin':'synthetic-student'},revokeSession:async()=>{}},
    now:()=>at,adminAuthority:{isApproved:async()=>true},
    syntheticClubs:{source:store.source,moderation:store.moderation,publication:store.publication,
      posters:{describe:async(id:string)=>id===descriptor.assetId?descriptor:null,
        read:async(id:string)=>{
          if(id!==descriptor.assetId)return null;await duringRead?.();
          const copy=Buffer.from(bytes);if(tamper)copy[copy.length-1]=0;
          return {descriptor,bytes:copy};
        }}}});
  apps.push(app);
  const call=(method:'GET'|'POST',url:string,payload?:unknown)=>app.inject({method,url,
    headers:{origin,'x-csrf-token':base.csrfToken,...(payload===undefined?{}:{'content-type':'application/json'})},...(payload===undefined?{}:{payload:JSON.stringify(payload)})});
  return {app,store,call,role:(next:typeof role)=>{role=next;},tamper:()=>{tamper=true;},
    during:(f:()=>Promise<void>)=>{duringRead=f;},
    setup:async()=>{await call('POST','/api/admin/synthetic/clubs',{id:'SYN-CLUB-090',content});},
    approve:()=>call('POST','/api/admin/synthetic/clubs/SYN-CLUB-090/decision',{decision:'APPROVE',expectedVersion:1}),
    image:()=>call('GET','/api/synthetic/clubs/SYN-CLUB-090/poster')};
}
describe('#123 authenticated generated poster route',()=>{
  it('serves the exact PNG only after the corresponding synthetic publication is approved',async()=>{
    const h=fixture();await h.setup();h.role('BETA');
    expect((await h.image()).statusCode).toBe(403);
    h.role('ADMIN');expect((await h.approve()).statusCode).toBe(200);h.role('BETA');
    const detail=await h.call('GET','/api/synthetic/clubs/SYN-CLUB-090');
    expect(detail.json().poster).toMatchObject({...descriptor,clubId:'SYN-CLUB-090',
      href:'/api/synthetic/clubs/SYN-CLUB-090/poster'});
    const image=await h.image();
    expect(image.statusCode).toBe(200);expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toBe('no-store');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.rawPayload.equals(bytes)).toBe(true);
    h.role('ANONYMOUS');expect((await h.image()).statusCode).toBe(401);
  });
  it('withholds image bytes if publication is revoked during loading',async()=>{
    const h=fixture();await h.setup();await h.approve();h.role('BETA');
    h.during(async()=>{await h.store.moderation.decide({adminActorId:'synthetic-admin',postId:'SYN-CLUB-090',
      expectedVersion:2,decision:'REVOKE',now:at,assertCurrentAdmin:async()=>true});});
    const result=await h.image();expect(result.statusCode).toBe(403);
    expect(result.headers['content-type']).toContain('application/json');
    expect(result.rawPayload.includes(bytes.subarray(0,8))).toBe(false);
  });
  it('rejects mismatched bytes and an unregistered asset instead of trusting its claimed MIME',async()=>{
    const h=fixture();await h.setup();await h.approve();h.role('BETA');h.tamper();
    expect((await h.image()).statusCode).toBe(503);
    expect((await h.call('GET','/api/synthetic/clubs/SYN-CLUB-001/poster')).statusCode).toBe(403);
  });
});
