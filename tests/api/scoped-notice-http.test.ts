import {afterEach,describe,expect,it} from 'vitest';
import {DemoSnapshotSchema,SharingGrantSchema} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {ScopedApiRepository} from '../../apps/api/src/scoped-repository.js';
import type {CalendarInputSource} from '../../apps/api/src/modules/calendar.js';
import snapshotRaw from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW='2026-10-31T00:00:00.000Z';
const ORIGIN='https://synthetic.invalid';
const actor={actorId:'SYN-SCOPED-NOTICE',role:'BETA' as const,sessionIdHash:'S'.repeat(32),
  csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-05T00:00:00.000Z'};
const opened:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(opened.splice(0).map(app=>app.close()));});

describe('approved academic notice source is used across BETA HTTP endpoints without overlay (#225)',()=>{
  it('does not re-publish precomputed ACADEMIC_REQUIRED/VERIFIED from the stored snapshot',async()=>{
    const grant=SharingGrantSchema.parse({grantId:'SYN-N-GRANT',actorId:actor.actorId,
      demoSubjectId:'S01',allowedSections:['FEED','NOTICES'],
      displayNameAllowed:false,recordingAllowed:false,version:'SYN-G1',
      expiresAt:actor.sessionExpiresAt});
    const stored=DemoSnapshotSchema.parse({...snapshotRaw,notices:{
      asOf:snapshotRaw.asOf,items:[{
        noticeId:'SYN-NOT-001',title:'Synthetic academic exam',
        priority:'ACADEMIC_REQUIRED',appliesTo:'YES',
        studentDeadline:'2026-11-02T00:00:00.000Z',
        evidenceRefs:['EV-SYN-NOTICE'],verificationState:'VERIFIED',
      }],pinnedIds:['SYN-NOT-001'],
    }});
    const profiles=(['S01','S02','S03','S04','S05'] as const).map(demoSubjectId=>({
      demoSubjectId,displayLabel:demoSubjectId,dataMode:'SYNTHETIC' as const,
      readiness:'READY' as const,allowedSections:['FEED','NOTICES'] as Array<'FEED'|'NOTICES'>,
    }));
    const base=new MemoryApiRepository({profiles,grants:[grant],projections:[stored]});
    const revision='SYN-NOTICE-REV1';
    // Simulates the restricted PostgreSQL calendar adapter *after* the
    // approved RulePack requirementRefs gate quarantines REQ-EXAMM.
    // The separate calendar-postgres tests exercise that gate itself.
    const source:CalendarInputSource={
      readAuthorizedInputs:async input=>({
        actorId:actor.actorId,context:input.context,grant,asOf:NOW,
        datasetMode:'SYNTHETIC',sourceVersion:'SYN-SRC1',authorizationToken:'SYN-RECEIPT1',
        scopeKey:'FEED,NOTICES',provenance:{},
        profile:{interestTopics:[],desiredJobTopics:[],approvedExperienceTopics:[],
          approvedLanguageCodes:[],officialMajorTopics:[],facts:{}},
        noticeStudent:{openRequirementIds:['REQ-EXAMM'],courseIds:[],interestTopics:[]},
        opportunities:[],notices:[{
          id:'SYN-NOT-001',sourceSnapshotId:revision,title:'Synthetic academic exam',
          issuer:'SYNTHETIC',category:'ACADEMIC',requirementRefs:['REQ-EXAMM'],
          verificationState:'NEEDS_REVIEW',studentDeadline:'2026-11-02T00:00:00.000Z',
          evidenceRefs:['EV-SYN-NOTICE'],
        }],
        revisions:[{revisionId:revision,sourceId:'SYN-NOTICE-SOURCE',
          status:'ACTIVE',changeKind:'NEW',provenance:'SYNTHETIC',
          permissionRef:'SYN-PERM',publishedAt:'2026-10-30T00:00:00.000Z',
          fetchedAt:'2026-10-30T00:00:00.000Z',
          lastVerifiedAt:'2026-10-30T00:00:00.000Z'}],
        authorizedRevisionIds:[revision],
      }),
      revalidateAuthorization:async()=>true,
    };
    const repository=new ScopedApiRepository(base,source,()=>NOW);
    const app=createApi({allowedOrigin:ORIGIN,now:()=>NOW,verifySession:async()=>actor,
      repository,calendarSource:source});
    opened.push(app);
    const select=await app.inject({method:'POST',url:'/api/demo/contexts',
      headers:{origin:ORIGIN,'x-csrf-token':actor.csrfToken},
      payload:{demoSubjectId:'S01',demoRunId:'SYN-NOTICE-HTTP'}});
    expect(select.statusCode).toBe(201);
    const contextId=select.json().contextId as string;
    const url='/api/demo/contexts/'+contextId;
    const snapshot=await app.inject({url:url+'/snapshot'});
    const notices=await app.inject({url:url+'/notices'});
    const calendar=await app.inject({url:url+'/calendar'});
    expect([snapshot.statusCode,notices.statusCode,calendar.statusCode]).toEqual([200,200,200]);
    const result=snapshot.json();
    expect(result.notices.items).toHaveLength(1);
    expect(result.notices.items[0]).toMatchObject({
      noticeId:'SYN-NOT-001',priority:'GENERAL',verificationState:'NEEDS_REVIEW'});
    expect(result.notices.pinnedIds).toEqual([]);
    expect(notices.json()).toEqual(result.notices);
    expect(calendar.json().entries).toEqual([]);
    // Stored precomputed projection is still unsafe and remains quarantined.
    expect((await base.readSnapshot('S01'))!.notices.items[0]).toMatchObject({
      priority:'ACADEMIC_REQUIRED',verificationState:'VERIFIED'});
  });
});
