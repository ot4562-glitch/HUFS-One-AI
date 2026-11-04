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
function pausePoint(){
  let enter!:()=>void,resume!:()=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;});
  const resumed=new Promise<void>(resolve=>{resume=resolve;});
  return {entered,resume,wait:async()=>{enter();await resumed;}};
}
function fixture(){
  const records=new Map<string,OwnerWorkspaceRecord>();
  const receipts=new Set<string>();let nextReceipt=0;
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
    getOpportunity:async()=>{
      const scopeToken=String(++nextReceipt);receipts.add(scopeToken);
      return {scopeToken,result:{
        opportunity,source:{sourceId:'SYN-SRC-1',revisionId:'SYN-REV-1',
          status:'SYNTHETIC',permissionRef:'SYN-CLEARED'},
      }};
    },
    // The actual PostgreSQL catalog consumes each receipt exactly once.
    revalidate:async({actorId,scopeToken})=>
      receipts.delete(scopeToken)&&actorId===actor.actorId&&sourceCurrent,
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
  it.each(['catalog read','source revalidation'] as const)(
    'does not save a draft when its session is revoked during %s',async stage=>{
      const h=fixture(),pause=pausePoint();
      if(stage==='catalog read'){
        const read=h.catalog.getOpportunity;
        h.catalog.getOpportunity=async input=>{
          const result=await read(input);await pause.wait();return result;
        };
      }else{
        const revalidate=h.catalog.revalidate;
        h.catalog.revalidate=async input=>{
          const result=await revalidate(input);await pause.wait();return result;
        };
      }
      const pending=h.app.inject({method:'POST',url:'/api/experience/from-opportunity',
        headers:post,payload:{itemId:'SYN-EX-LATE',opportunityId:'SYN-OP-1'}})
        .then(result=>result);
      await pause.entered;h.revokeSession();pause.resume();
      const result=await pending;
      expect(result.statusCode).toBe(401);
      expect(h.records.size).toBe(0);
      expect(result.body).not.toContain('가상 공고');
    });
  it.each(['withdrawn','unavailable'] as const)(
    'withholds a saved draft response when source rights become %s during storage',async state=>{
      const h=fixture(),pause=pausePoint(),create=h.workspace.create;
      h.workspace.create=async input=>{
        const result=await create(input);await pause.wait();return result;
      };
      const pending=h.app.inject({method:'POST',url:'/api/experience/from-opportunity',
        headers:post,payload:{itemId:'SYN-EX-LATE',opportunityId:'SYN-OP-1'}})
        .then(result=>result);
      await pause.entered;
      if(state==='withdrawn')h.revokeSource();
      else h.catalog.revalidate=async()=>{throw new Error('Synthetic authority unavailable');};
      pause.resume();
      const result=await pending;
      expect(result.statusCode).toBe(403);
      expect(result.json()).not.toHaveProperty('item');
      expect(result.body).not.toContain('가상 공고');
      // Independent catalog/workspace ports cannot undo an already committed
      // owner draft. Never claim rollback or delete a concurrent owner's edit.
      expect(h.records.size).toBe(1);
    });
  it.each(['source revision','permission','opportunity version','title','data mode'] as const)(
    'withholds a draft derived from a changed %s',async change=>{
      const h=fixture(),read=h.catalog.getOpportunity,create=h.workspace.create;
      let saved=false;
      h.workspace.create=async input=>{
        const result=await create(input);saved=true;return result;
      };
      h.catalog.getOpportunity=async input=>{
        const receipt=await read(input);if(!receipt||!saved)return receipt;
        const detail={opportunity:{...receipt.result.opportunity},source:{...receipt.result.source}};
        if(change==='source revision'){
          detail.source.revisionId='SYN-REV-2';
          detail.opportunity.sourceSnapshotId='SYN-REV-2';
        }else if(change==='permission')detail.source.permissionRef='SYN-PERM-2';
        else if(change==='opportunity version')detail.opportunity.version='v2';
        else if(change==='title')detail.opportunity.title='가상 정정 공고';
        else{
          detail.opportunity.dataMode='REAL';
          detail.source.status='ACTIVE';
          detail.source.verifiedAt='2026-10-31T00:00:00.000Z';
        }
        return {...receipt,result:detail};
      };
      const result=await h.app.inject({method:'POST',url:'/api/experience/from-opportunity',
        headers:post,payload:{itemId:'SYN-EX-CHANGED',opportunityId:'SYN-OP-1'}});
      expect(result.statusCode).toBe(403);
      expect(result.json()).not.toHaveProperty('item');
      expect(result.body).not.toContain('가상 공고');
    });
  it('rechecks the session after the final source-rights read',async()=>{
    const h=fixture(),revalidate=h.catalog.revalidate;let checks=0;
    h.catalog.revalidate=async input=>{
      const result=await revalidate(input);
      if(++checks===2)h.revokeSession();
      return result;
    };
    const result=await h.app.inject({method:'POST',url:'/api/experience/from-opportunity',
      headers:post,payload:{itemId:'SYN-EX-LATE',opportunityId:'SYN-OP-1'}});
    expect(result.statusCode).toBe(401);
    expect(result.json()).not.toHaveProperty('item');
    expect(result.body).not.toContain('가상 공고');
  });
  it.each([
    ['empty',''],['oversized','T'.repeat(2049)],['non-string',42],['missing',null],
  ])('rejects an unusable catalog receipt before storing a draft (%s)',async(_label,scopeToken)=>{
      const h=fixture(),read=h.catalog.getOpportunity;
      h.catalog.getOpportunity=async input=>{
        const result=await read(input);
        return {...result!,scopeToken} as unknown as NonNullable<typeof result>;
      };
      const result=await h.app.inject({method:'POST',url:'/api/experience/from-opportunity',
        headers:post,payload:{itemId:'SYN-EX-BAD',opportunityId:'SYN-OP-1'}});
      expect(result.statusCode).toBe(503);
      expect(h.records.size).toBe(0);
      expect(result.body).not.toContain('가상 공고');
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
  it('does not publish extra owner columns or another workspace kind from storage',async()=>{
    const h=fixture(),privateItem={itemId:'SYN-EX1',version:1,value:experience,
      updatedAt:NOW,actorId:'SYN-PRIVATE'};
    h.workspace.read=async()=>privateItem as OwnerWorkspaceRecord;
    const detail=await h.app.inject({url:'/api/experience/cards/SYN-EX1'});
    expect(detail.statusCode).toBe(503);
    expect(detail.body).not.toContain('SYN-PRIVATE');
    h.workspace.list=async()=>({items:[{itemId:'SYN-SV1',version:1,
      value:experience,updatedAt:NOW}],nextCursor:null});
    const list=await h.app.inject({url:'/api/saved-items'});
    expect(list.statusCode).toBe(503);
    expect(list.json()).not.toHaveProperty('items');
  });
  it('rejects a malformed owner paging cursor even if each record is valid',async()=>{
    const h=fixture();
    h.workspace.list=async()=>({items:[],nextCursor:'SYN-UNKNOWN'});
    const res=await h.app.inject({url:'/api/study-plans?limit=1'});
    expect(res.statusCode).toBe(503);
    expect(res.json()).not.toHaveProperty('items');
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
