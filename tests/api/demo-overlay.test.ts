import {describe,expect,it} from 'vitest';
import {DemoContextSchema,DemoSnapshotSchema,OpportunitySchema,SharingGrantSchema} from '@hufs-one/contracts';
import {DemoOverlayService,MemoryDemoOverlayStore} from '../../apps/api/src/modules/demo-overlay.js';
import {scopeInputsToGrant} from '../../packages/core/src/opportunities/scope.js';
import type {CalendarInputBundle,CalendarInputSource,CalendarReadRequest} from '../../apps/api/src/modules/calendar.js';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';
import {buildDemoSnapshots} from '../../packages/core/src/opportunities/demo-snapshot.js';

const NOW='2026-11-01T00:00:00.000Z';
function fixture(){
  const context=DemoContextSchema.parse({contextId:'CTX1',actorId:'google:synthetic',
    demoSubjectId:'S01',demoRunId:'RUN1',sessionIdHash:'SESSION1',
    datasetVersion:'DATA1',projectionVersion:'PROJ1',sharingGrantVersion:'GRANT1',
    expiresAt:'2026-11-02T00:00:00.000Z'});
  const input:CalendarReadRequest={actorId:context.actorId,context,now:NOW};
  const metadata=DemoSnapshotSchema.parse({...snapshot,contextId:'CTX1',asOf:NOW,
    versions:{...snapshot.versions,dataset:'DATA1',projection:'PROJ1',consent:'GRANT1'},
    academics:{state:'NOT_SHARED'},forecast:{state:'NOT_SHARED'}});
  const grant=SharingGrantSchema.parse({grantId:'G1',actorId:input.actorId,
    demoSubjectId:'S01',allowedSections:['FEED','NOTICES'],displayNameAllowed:false,
    recordingAllowed:false,version:'GRANT1',expiresAt:context.expiresAt});
  const profile={interestTopics:['DATA_ANALYTICS'] as const,desiredJobTopics:[],
    approvedExperienceTopics:[],approvedLanguageCodes:[],officialMajorTopics:[],facts:{}};
  const noticeStudent={interestTopics:['DATA_ANALYTICS'] as const,openRequirementIds:null,courseIds:[]};
  const bundle:CalendarInputBundle={actorId:input.actorId,context,asOf:NOW,datasetMode:'SYNTHETIC',
    grant,profile,noticeStudent,provenance:{},scopeKey:scopeInputsToGrant(profile,noticeStudent,
      grant.allowedSections).scopeKey,sourceVersion:'SOURCE1',authorizationToken:'receipt1',
    opportunities:['DATA_ANALYTICS','AI_ML'].map((topic,i)=>OpportunitySchema.parse({
      id:'OP'+i,version:'V1',sourceSnapshotId:'REV1',title:'Synthetic '+topic,
      organization:'Synthetic '+i,kind:'CONTEST',topicCodes:[topic],languageCodes:[],
      applyClosesAt:'2026-11-01T15:00:00.000Z',eventSessions:[],actualApplicationRoute:'DEMO_DISABLED',
      conditions:[],roleSteps:[],prioritySelection:[],completionRules:[],dataMode:'SYNTHETIC',dataQuality:'COMPLETE'})),
    notices:[],authorizedRevisionIds:['REV1'],revisions:[{revisionId:'REV1',sourceId:'SOURCE1',
      status:'ACTIVE',changeKind:'NEW',provenance:'SYNTHETIC',permissionRef:'PERMISSION1',
      publishedAt:'2026-10-29T00:00:00.000Z',fetchedAt:'2026-10-29T00:00:00.000Z',
      lastVerifiedAt:'2026-10-30T00:00:00.000Z'}]};
  let valid=true,afterRecheck:(()=>Promise<void>)|undefined;
  const source:CalendarInputSource={readAuthorizedInputs:async request=>({...bundle,context:request.context}),
    revalidateAuthorization:async()=>{if(afterRecheck)await afterRecheck();return valid;}};
  const store=new MemoryDemoOverlayStore();
  const service=new DemoOverlayService({source,store,now:()=>NOW});
  return {service,source,store,bundle,input,metadata,setValid:(v:boolean)=>{valid=v;},
    onRecheck:(v:()=>Promise<void>)=>{afterRecheck=v;}};
}

describe('BETA context-local demo preference overlay',()=>{
  it('accepts exact generated projection/dataset versions including scope commas and plus suffixes',async()=>{
    const f=fixture(),generated=buildDemoSnapshots()[0]!;
    f.input.context.projectionVersion=generated.versions.projection;
    f.input.context.datasetVersion=generated.versions.dataset+'+snapshot-v1';
    f.metadata.versions.projection=f.input.context.projectionVersion;
    f.metadata.versions.dataset=f.input.context.datasetVersion;
    const result=await f.service.put(f.input,f.metadata,{expectedVersion:0,value:{interestTopics:['AI_ML']}});
    expect(result.overlay.version).toBe(1);
    expect(result.snapshot.versions.projection).toBe(generated.versions.projection);
    expect(result.snapshot.versions.dataset).toBe(f.input.context.datasetVersion);
  });
  it('rechecks source rights after the final overlay storage read',async()=>{
    const f=fixture();let reads=0;
    const service=new DemoOverlayService({source:f.source,now:()=>NOW,store:{
      read:async key=>{
        const value=await f.store.read(key);
        if(++reads===2)f.setValid(false);
        return value;
      },put:(...args)=>f.store.put(...args),
    }});
    await expect(service.read(f.input,f.metadata)).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('reranks cloned authorized inputs and stamps overlay without changing original summaries',async()=>{
    const f=fixture(),before=JSON.stringify(f.bundle);
    const initial=await f.service.read(f.input,f.metadata);
    expect(initial.snapshot.feed.featured[0]?.opportunityId).toBe('OP0');
    const changed=await f.service.put(f.input,f.metadata,{expectedVersion:0,
      value:{interestTopics:['AI_ML'],desiredJobTopics:['AI_ML']}});
    expect(changed.snapshot.feed.featured[0]?.opportunityId).toBe('OP1');
    expect(changed.snapshot.versions.overlay).toBe('BETA_OVERLAY:1');
    expect(changed.snapshot.academics).toEqual(f.metadata.academics);
    expect(changed.snapshot.forecast).toEqual(f.metadata.forecast);
    expect(JSON.stringify(f.bundle)).toBe(before);
  });
  it('hides only the actor overlay opportunity and recomputes matching calendar entries',async()=>{
    const f=fixture();
    const changed=await f.service.put(f.input,f.metadata,{expectedVersion:0,
      value:{hiddenOpportunityIds:['OP0']}});
    expect([...changed.snapshot.feed.featured,...changed.snapshot.feed.compact]
      .some(c=>c.opportunityId==='OP0')).toBe(false);
    expect(changed.calendar.entries.some(c=>c.refId==='OP0')).toBe(false);
    expect(f.bundle.opportunities).toHaveLength(2);
  });
  it('rejects stale CAS and reset restores original preferences with a new version',async()=>{
    const f=fixture();
    await f.service.put(f.input,f.metadata,{expectedVersion:0,value:{interestTopics:['AI_ML']}});
    await expect(f.service.put(f.input,f.metadata,{expectedVersion:0,value:{}}))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    const reset=await f.service.reset(f.input,f.metadata,{expectedVersion:1});
    expect(reset.overlay).toEqual({version:2,value:{},updatedAt:NOW});
    expect(reset.snapshot.feed.featured[0]?.opportunityId).toBe('OP0');
  });
  it('isolates runs, sessions, subjects and source/grant versions',async()=>{
    const f=fixture();
    await f.service.put(f.input,f.metadata,{expectedVersion:0,value:{hiddenOpportunityIds:['OP0']}});
    for(const field of ['demoRunId','sessionIdHash','datasetVersion','projectionVersion','sharingGrantVersion'] as const){
      const context={...f.input.context,[field]:'OTHER'};
      const key={actorId:context.actorId,sessionIdHash:context.sessionIdHash,demoRunId:context.demoRunId,
        demoSubjectId:context.demoSubjectId,datasetVersion:context.datasetVersion,
        projectionVersion:context.projectionVersion,sharingGrantVersion:context.sharingGrantVersion};
      expect((await f.store.read(key)).version).toBe(0);
    }
    const key={actorId:'OTHER',sessionIdHash:'SESSION1',demoRunId:'RUN1',demoSubjectId:'S01' as const,
      datasetVersion:'DATA1',projectionVersion:'PROJ1',sharingGrantVersion:'GRANT1'};
    expect((await f.store.read(key)).version).toBe(0);
    expect((await f.store.read({...key,actorId:f.input.actorId,demoSubjectId:'S02'})).version).toBe(0);
  });
  it('denies missing/expired/reviewer authority and metadata bound to another dataset',async()=>{
    const f=fixture();
    await expect(f.service.read({...f.input,actorId:'OTHER'},f.metadata)).rejects.toThrow();
    await expect(f.service.read({...f.input,reviewerInviteId:'R1'},f.metadata)).rejects.toThrow();
    await expect(f.service.read({...f.input,now:f.input.context.expiresAt},f.metadata)).rejects.toThrow();
    await expect(f.service.read(f.input,{...f.metadata,versions:{...f.metadata.versions,dataset:'OTHER'}}))
      .rejects.toMatchObject({code:'VERSION_CONFLICT'});
    f.setValid(false);
    await expect(f.service.put(f.input,f.metadata,{expectedVersion:0,value:{}})).rejects.toThrow();
    f.setValid(true);
    expect((await f.service.read(f.input,f.metadata)).overlay.version).toBe(0);
  });
  it('discards a computed response when another overlay write wins during authorization recheck',async()=>{
    const f=fixture();
    f.onRecheck(async()=>{
      await f.store.put({actorId:f.input.actorId,sessionIdHash:'SESSION1',demoRunId:'RUN1',
        demoSubjectId:'S01',datasetVersion:'DATA1',projectionVersion:'PROJ1',sharingGrantVersion:'GRANT1'},
      {expectedVersion:0,value:{interestTopics:['AI_ML']}},NOW);
    });
    await expect(f.service.read(f.input,f.metadata)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  });
  it('does not allow overlay fields to add eligibility facts, academic or experience signals',async()=>{
    const f=fixture();
    for(const value of [{facts:{major:'FAKE'}},{approvedExperienceTopics:['AI_ML']},
      {interestTopics:['UNREGISTERED']},{hiddenOpportunityIds:Array(201).fill('OP0')},
      {hiddenOpportunityIds:['OP0','OP0']}]){
      await expect(f.service.put(f.input,f.metadata,{expectedVersion:0,value})).rejects.toThrow();
    }
    expect((await f.service.read(f.input,f.metadata)).overlay.version).toBe(0);
  });
});
