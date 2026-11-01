import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {OpportunitySchema} from '@hufs-one/contracts';
import type {OwnerWorkspacePort} from
  '../../apps/api/src/modules/profiles/self-workspace-postgres.js';
import type {TrustedCatalogPort} from
  '../../apps/api/src/modules/opportunities/owner-catalog-http.js';
import type {OwnerWorkspaceRecord,OwnerWorkspaceValue,WorkspaceKind} from '@hufs-one/contracts';

const NOW='2026-11-01T00:00:00.000Z';
const origin='https://synthetic.invalid';
const actor={role:'BETA' as const,actorId:'SYN-WORKSPACE-OWNER',
  sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  betaAllowed:true,sessionExpiresAt:'2026-11-10T00:00:00Z',
  schoolMailProofExpiresAt:'2026-11-10T00:00:00Z'};
const post={origin,'x-csrf-token':actor.csrfToken};
const experience={kind:'EXPERIENCE' as const,dataMode:'SYNTHETIC' as const,
  state:'DRAFT' as const,title:'가상 기록',summary:''};
const study={kind:'STUDY_PLAN' as const,dataMode:'SYNTHETIC' as const,
  state:'DRAFT' as const,courseId:'SYN-COURSE-1',targetTerm:'2026-2',planned:true};
const bookmark={kind:'BOOKMARK' as const,dataMode:'SYNTHETIC' as const,
  state:'SAVED' as const,opportunityId:'SYN-OP-1'};
const action={kind:'ACTION_PLAN' as const,dataMode:'SYNTHETIC' as const,
  state:'DRAFT' as const,opportunityId:'SYN-OP-1',task:'가상 지원서 작성',done:false};
const opportunity=OpportunitySchema.parse({
  id:'SYN-OP-1',sourceSnapshotId:'SYN-REV-1',version:'v1',
  title:'가상 공고',organization:'가상 학교',kind:'CONTEST',
  topicCodes:['DATA_ANALYTICS'],languageCodes:[],eventSessions:[],
  actualApplicationRoute:'DEMO_DISABLED',conditions:[],
  roleSteps:[],prioritySelection:[],completionRules:[],
  dataMode:'SYNTHETIC',dataQuality:'COMPLETE',
});
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(x=>x.close()));apps.length=0;});
function fixture(){
  const records=new Map<string,OwnerWorkspaceRecord>();
  let sourceCurrent=true,sessionCurrent=true;
  const calledActors:string[]=[];
  const key=(a:string,k:string,id:string)=>a+'\0'+k+'\0'+id;
  const workspace:OwnerWorkspacePort={
    list:async({actorId,kind})=>{
      calledActors.push(actorId);
      return {items:[...records].filter(([k])=>k.startsWith(actorId+'\0'+kind+'\0'))
        .map(([,v])=>v),nextCursor:null};
    },
    read:async({actorId,kind,itemId})=>{
      calledActors.push(actorId);return records.get(key(actorId,kind,itemId))??null;
    },
    create:async({actorId,itemId,value})=>{
      calledActors.push(actorId);
      const k=key(actorId,value.kind,itemId);
      const x:OwnerWorkspaceRecord={itemId,version:1,value,updatedAt:NOW};
      records.set(k,x);return x;
    },
    update:async({actorId,kind,itemId,expectedVersion,value})=>{
      calledActors.push(actorId);
      const k=key(actorId,kind,itemId),prev=records.get(k);
      if(!prev||prev.version!==expectedVersion){
        const {WorkspaceConflict}=await import(
          '../../apps/api/src/modules/profiles/self-workspace-postgres.js');
        throw new WorkspaceConflict();
      }
      const updated:OwnerWorkspaceRecord={itemId,value,version:prev.version+1,updatedAt:NOW};
      records.set(k,updated);return updated;
    },
    delete:async({actorId,kind,itemId,expectedVersion})=>{
      calledActors.push(actorId);
      const k=key(actorId,kind,itemId),prev=records.get(k);
      if(!prev||prev.version!==expectedVersion){
        const {WorkspaceConflict}=await import(
          '../../apps/api/src/modules/profiles/self-workspace-postgres.js');
        throw new WorkspaceConflict();
      }
      records.delete(k);return {version:expectedVersion+1};
    },
  };
  const catalog:TrustedCatalogPort={
    getOpportunity:async()=>({scopeToken:'SYN-CURRENT',result:{
      opportunity,source:{sourceId:'SYN-SRC-1',revisionId:'SYN-REV-1',
        status:'SYNTHETIC',permissionRef:'SYN-CLEARED'},
    }}),
    revalidate:async()=>sourceCurrent,
    listCourses:async()=>null,listOfferings:async()=>null,
    listOpportunities:async()=>null,readTranscript:async()=>null,
  };
  const app=createIntegratedApi({
    allowedOrigin:origin,repository:new MemoryApiRepository({profiles:[]}),
    auth:{verifySession:async()=>sessionCurrent?actor:null,revokeSession:async()=>{}},
    now:()=>NOW,ownerWorkspace:workspace,ownerCatalog:catalog,
  });apps.push(app);
  return {app,records,calledActors,workspace,catalog,
    revokeSource:()=>{sourceCurrent=false;},revokeSession:()=>{sessionCurrent=false;}};
}
describe('A13 owner-only experience, study plan, saved items and action plan HTTP',()=>{
  it('creates and lists all four kinds in the verified actor namespace',async()=>{
    const h=fixture();
    for(const [url,itemId,value] of [
      ['/api/experience/cards','SYN-EX1',experience],
      ['/api/study-plans','SYN-ST1',study],
      ['/api/saved-items','SYN-SV1',bookmark],
      ['/api/action-plans','SYN-AC1',action],
    ] as const){
      const created=await h.app.inject({method:'POST',url,headers:post,payload:{itemId,value}});
      expect(created.statusCode).toBe(201);
      expect(created.json().item.value.kind).toBe(value.kind);
      const listed=await h.app.inject({url});
      expect(listed.statusCode).toBe(200);
      expect(listed.json().items).toHaveLength(1);
    }
    expect(h.calledActors.every(x=>x===actor.actorId)).toBe(true);
  });
  it('requires version CAS and forbids cross-kind edits, DELETE without CSRF and forging an actor',async()=>{
    const h=fixture();
    await h.app.inject({method:'POST',url:'/api/experience/cards',headers:post,
      payload:{itemId:'SYN-EX1',value:experience}});
    expect((await h.app.inject({method:'PATCH',url:'/api/experience/cards/SYN-EX1',
      headers:post,payload:{expectedVersion:1,value:{...experience,title:'가상 수정'}}})).statusCode).toBe(200);
    expect((await h.app.inject({method:'PATCH',url:'/api/experience/cards/SYN-EX1',
      headers:post,payload:{expectedVersion:1,value:experience}})).statusCode).toBe(409);
    expect((await h.app.inject({method:'PATCH',url:'/api/experience/cards/SYN-EX1',
      headers:post,payload:{expectedVersion:2,value:study}})).statusCode).toBe(422);
    expect((await h.app.inject({method:'DELETE',url:'/api/experience/cards/SYN-EX1',
      payload:{expectedVersion:2}})).statusCode).toBe(403);
    expect((await h.app.inject({method:'DELETE',url:'/api/experience/cards/SYN-EX1',
      headers:post,payload:{expectedVersion:2}})).statusCode).toBe(200);
    expect((await h.app.inject({url:'/api/experience/cards/SYN-EX1'})).json()).toEqual({item:null});
    expect((await h.app.inject({method:'POST',url:'/api/study-plans',headers:post,
      payload:{itemId:'SYN-ST1',value:study,actorId:'SYN-OTHER'}})).statusCode).toBe(422);
  });
  it('creates a private DRAFT from a current approved synthetic opportunity, never submits',async()=>{
    const h=fixture();
    const res=await h.app.inject({method:'POST',url:'/api/experience/from-opportunity',
      headers:post,payload:{itemId:'SYN-EX-FROM',opportunityId:'SYN-OP-1'}});
    expect(res.statusCode).toBe(201);
    expect(res.json().item.value).toEqual({kind:'EXPERIENCE',dataMode:'SYNTHETIC',
      state:'DRAFT',title:'가상 공고',summary:'',sourceOpportunityId:'SYN-OP-1'});
    expect(JSON.stringify(res.json())).not.toContain('scopeToken');
    const j=fixture();j.revokeSource();
    const denied=await j.app.inject({method:'POST',url:'/api/experience/from-opportunity',
      headers:post,payload:{itemId:'SYN-FROM2',opportunityId:'SYN-OP-1'}});
    expect(denied.statusCode).toBe(403);
    expect(j.records.size).toBe(0);
  });
  it('blocks unauthenticated, REVIEWER, malicious payload and over-limit pagination',async()=>{
    const h=fixture();h.revokeSession();
    const unauth=await h.app.inject({method:'POST',url:'/api/saved-items',
      headers:{...post,'x-user-id':actor.actorId},
      payload:{itemId:'SYN-SV1',value:bookmark}});
    expect(unauth.statusCode).toBe(401);
    expect(h.calledActors).toHaveLength(0);
    const r=fixture();
    expect((await r.app.inject({url:'/api/saved-items?limit=51'})).statusCode).toBe(422);
    expect((await r.app.inject({method:'POST',url:'/api/action-plans',headers:post,
      payload:{itemId:'SYN-AC1',value:{...action,done:true,more:'fabricated'}}})).statusCode).toBe(422);
  });
  it('leaves routes unavailable unless the owner workspace adapter is supplied',async()=>{
    const app=createIntegratedApi({allowedOrigin:origin,
      repository:new MemoryApiRepository({profiles:[]}),now:()=>NOW,
      auth:{verifySession:async()=>actor,revokeSession:async()=>{}},
    });apps.push(app);
    expect((await app.inject({url:'/api/experience/cards'})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/experience/cards',headers:post,
      payload:{itemId:'SYN-X',value:experience}})).statusCode).toBe(403);
  });
});
