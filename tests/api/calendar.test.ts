import {afterEach,describe,expect,it,vi} from 'vitest';
import {CalendarResultSchema,DemoProfileOptionSchema,DemoSnapshotSchema,OpportunitySchema,SharingGrantSchema} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import type {ApiOptions} from '../../apps/api/src/types.js';
import type {CalendarInputBundle,CalendarInputSource} from '../../apps/api/src/modules/calendar.js';
import {scopeInputsToGrant} from '../../packages/core/src/opportunities/scope.js';
import {MemoryReviewerAccessStore,issueReviewerInvitation} from '../../apps/api/src/modules/auth/reviewer.js';
import profiles from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshot from '../../packages/fixtures/synthetic/demo-snapshot.json';

const now='2026-10-31T00:00:00.000Z',origin='https://example.test';
const actor={actorId:'SYN-ACTOR-01',sessionIdHash:'H'.repeat(30),
  sessionExpiresAt:'2026-11-05T00:00:00.000Z',schoolMailProofExpiresAt:'2026-11-03T00:00:00.000Z',
  role:'BETA' as const,betaAllowed:true,csrfToken:'C'.repeat(32)};
const grant=SharingGrantSchema.parse({grantId:'G1',actorId:actor.actorId,demoSubjectId:'S01',
  allowedSections:['FEED','NOTICES'],displayNameAllowed:false,recordingAllowed:false,
  version:'G1',expiresAt:actor.sessionExpiresAt});
const headers={cookie:'a',origin,'x-csrf-token':actor.csrfToken};
const opened:ReturnType<typeof createApi>[]=[];
afterEach(async()=>{await Promise.all(opened.map(app=>app.close()));opened.length=0;});

function fixture() {
  const repository=new MemoryApiRepository({profiles:profiles.profiles.map(p=>DemoProfileOptionSchema.parse(p)),
    grants:[grant],projections:[DemoSnapshotSchema.parse(snapshot)]});
  // Explicit synthetic test adapter for #55: context creation must not fetch an unsafe full-share
  // precomputed feed. This projection has no derived items; calendar recomputes its own scoped inputs.
  const syntheticSnapshot=DemoSnapshotSchema.parse({...snapshot,
    feed:{...snapshot.feed,featured:[],compact:[],totalCandidates:0,hasMore:false},
    notices:{...snapshot.notices,pinnedIds:[],items:[]},academics:{state:'NOT_SHARED'},forecast:{state:'NOT_SHARED'}});
  Object.assign(repository,{readAuthorizedSnapshot:async()=>structuredClone(syntheticSnapshot)});
  const profile={interestTopics:['DATA_ANALYTICS' as const],desiredJobTopics:[],approvedExperienceTopics:['AI_ML' as const],
    approvedLanguageCodes:[],officialMajorTopics:[],facts:{}};
  const noticeStudent={openRequirementIds:['REQ-PRIVATE'],courseIds:[],interestTopics:['DATA_ANALYTICS' as const]};
  const base:Omit<CalendarInputBundle,'context'>={actorId:actor.actorId,grant,
    asOf:now,datasetMode:'SYNTHETIC',scopeKey:scopeInputsToGrant(profile,noticeStudent,grant.allowedSections).scopeKey,
    sourceVersion:'sources-v1',authorizationToken:'opaque-server-receipt',profile,noticeStudent,provenance:{},
    opportunities:[OpportunitySchema.parse({id:'OPP1',version:'v1',sourceSnapshotId:'REV1',title:'Synthetic opportunity',
      organization:'Synthetic org',kind:'CONTEST',topicCodes:['DATA_ANALYTICS'],languageCodes:[],
      applyClosesAt:'2026-11-02T15:00:00.000Z',eventSessions:[],actualApplicationRoute:'DEMO_DISABLED',
      conditions:[],roleSteps:[],prioritySelection:[],completionRules:[],dataMode:'SYNTHETIC',dataQuality:'COMPLETE'})],
    notices:[{id:'NOTICE1',sourceSnapshotId:'REV1',title:'Synthetic scholarship',issuer:'Synthetic office',
      category:'SCHOLARSHIP',verificationState:'VERIFIED',studentDeadline:'2026-11-01T15:00:00.000Z',
      adminReportDeadline:'2026-11-01T00:00:00.000Z',evidenceRefs:['EV1']},
    {id:'PRIVATE-REQ',sourceSnapshotId:'REV1',title:'Synthetic requirement',issuer:'Synthetic office',
      category:'ACADEMIC',verificationState:'VERIFIED',requirementRefs:['REQ-PRIVATE'],
      studentDeadline:'2026-11-03T15:00:00.000Z',evidenceRefs:['EV1']}],
    revisions:[{revisionId:'REV1',sourceId:'SOURCE1',status:'ACTIVE',changeKind:'NEW',provenance:'SYNTHETIC',
      permissionRef:'PERM1',publishedAt:'2026-10-29T00:00:00.000Z',fetchedAt:'2026-10-29T00:00:00.000Z',
      lastVerifiedAt:'2026-10-30T00:00:00.000Z'}],authorizedRevisionIds:['REV1']};
  const read=vi.fn<CalendarInputSource['readAuthorizedInputs']>(async request=>({...structuredClone(base),context:request.context}));
  const revalidate=vi.fn<CalendarInputSource['revalidateAuthorization']>(async()=>true);
  const source:CalendarInputSource={readAuthorizedInputs:read,revalidateAuthorization:revalidate};
  let currentActor:unknown=actor;
  let clock=now;
  const options:ApiOptions={repository,allowedOrigin:origin,now:()=>clock,
    verifySession:async()=>currentActor as typeof actor,calendarSource:source};
  const app=createApi(options);opened.push(app);
  const select=async()=>{
    const response=await app.inject({method:'POST',url:'/api/demo/contexts',headers,
      payload:{demoSubjectId:'S01',demoRunId:'CALENDAR-TEST'}});
    expect(response.statusCode).toBe(201);
    return response.json().contextId as string;
  };
  const get=(id:string,query='')=>app.inject({url:`/api/demo/contexts/${id}/calendar${query}`,headers});
  return {base,source,read,revalidate,repository,app,select,get,
    setActor:(value:unknown)=>{currentActor=value;},setClock:(value:string)=>{clock=value;}};
}

describe('authenticated calendar API (#52)',()=>{
  it('returns a validated no-store calendar computed from scoped authoritative inputs',async()=>{
    const f=fixture(),id=await f.select(),response=await f.get(id);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const result=CalendarResultSchema.parse(response.json());
    expect(result.asOf).toBe(now);
    expect(result.entries.map(e=>[e.refId,e.kind])).toEqual([
      ['NOTICE1','STUDENT_DEADLINE'],['OPP1','APPLY_DEADLINE']]);
    expect(result.needsConfirmation).toEqual([{refId:'PRIVATE-REQ',title:'Synthetic requirement',unknownScope:['academicStatus']}]);
    expect(response.body).not.toContain('REQ-PRIVATE');
    expect(response.body).not.toContain('sourceVersion');
    expect(f.read).toHaveBeenCalledWith(expect.objectContaining({actorId:actor.actorId,context:expect.objectContaining({contextId:id}),now}));
    expect(f.revalidate).toHaveBeenCalledOnce();
  });
  it('recomputes recommendation inputs so an unshared experience cannot create calendar entries',async()=>{
    const f=fixture();f.base.profile.interestTopics=[];
    f.base.opportunities[0]!.topicCodes=['AI_ML'];
    const response=await f.get(await f.select());
    expect(response.statusCode).toBe(200);
    expect(response.json().entries.every((e:{source:string})=>e.source!=='OPPORTUNITY')).toBe(true);
  });
  it('does not reuse full academic applicability for a partially shared calendar',async()=>{
    const f=fixture();f.base.grant={...grant,allowedSections:['FEED','NOTICES','ACADEMICS']};
    f.repository.setGrant(f.base.grant);
    f.base.scopeKey=scopeInputsToGrant(f.base.profile,f.base.noticeStudent,f.base.grant.allowedSections).scopeKey;
    const response=await f.get(await f.select());
    expect(response.statusCode).toBe(200);
    expect(response.json().entries.some((e:{refId:string})=>e.refId==='PRIVATE-REQ')).toBe(true);
  });
  it('rejects anonymous, other-actor/session, unknown and expired contexts before reading inputs',async()=>{
    const f=fixture(),id=await f.select();
    f.setActor(null);expect((await f.get(id)).statusCode).toBe(401);
    f.setActor({...actor,actorId:'OTHER'});expect((await f.get(id)).statusCode).toBe(403);
    f.setActor({...actor,sessionIdHash:'X'.repeat(30)});expect((await f.get(id)).statusCode).toBe(403);
    f.setActor(actor);expect((await f.get('unknown')).statusCode).toBe(403);
    f.setClock('2026-10-31T00:06:00.000Z');expect((await f.get(id)).statusCode).toBe(409);
    expect(f.read).not.toHaveBeenCalled();
  });
  it('fails closed when no atomic calendar provider is connected',async()=>{
    const f=fixture(),app=createApi({repository:f.repository,allowedOrigin:origin,now:()=>now,verifySession:async()=>actor});
    opened.push(app);
    const selection=await app.inject({method:'POST',url:'/api/demo/contexts',headers,payload:{demoSubjectId:'S01',demoRunId:'CLOSED'}});
    const response=await app.inject({url:`/api/demo/contexts/${selection.json().contextId}/calendar`,headers});
    expect(response.statusCode).toBe(503);
  });
  it.each(['actor','subject','projection','dataset','grant','scopeKey','futureAsOf','missingFeed','expiredGrant','revokedGrant'])
    ('rejects mismatched/expired authorized receipt: %s',async fault=>{
      const f=fixture(),id=await f.select();
      f.read.mockImplementation(async request=>{
        const result:CalendarInputBundle={...structuredClone(f.base),context:structuredClone(request.context)};
        if(fault==='actor')result.actorId='OTHER';
        if(fault==='subject')result.context.demoSubjectId='S02';
        if(fault==='projection')result.context.projectionVersion='OTHER';
        if(fault==='dataset')result.context.datasetVersion='OTHER';
        if(fault==='grant')result.grant={...grant,version:'OTHER'};
        if(fault==='scopeKey')result.scopeKey='ACADEMICS,EXPERIENCE,FEED,NOTICES';
        if(fault==='futureAsOf')result.asOf='2026-11-01T00:00:00.000Z';
        if(fault==='missingFeed')result.grant={...grant,allowedSections:['NOTICES']};
        if(fault==='expiredGrant')result.grant={...grant,expiresAt:now};
        if(fault==='revokedGrant')result.grant={...grant,revokedAt:now};
        return result;
      });
      const response=await f.get(id);
      expect([403,409]).toContain(response.statusCode);
      expect(response.body).not.toContain('Synthetic scholarship');
    });
  it('rejects client asOf, grant, section and source overrides',async()=>{
    const f=fixture(),id=await f.select();
    for(const query of ['?asOf=2026-10-29T00:00:00Z','?sections=ACADEMICS','?grantVersion=G1','?sourceVersion=v1'])
      expect((await f.get(id,query)).statusCode).toBe(422);
    expect(f.read).not.toHaveBeenCalled();
  });
  it('denies a revoked grant or changed source during the read-to-response race',async()=>{
    const f=fixture(),id=await f.select();f.revalidate.mockResolvedValue(false);
    const response=await f.get(id);
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain('Synthetic scholarship');
  });
  it('does not serialize malformed server-side dates as a client input error',async()=>{
    const f=fixture();f.base.notices[0]!.eventSessions=[{start:'2026-11-01T15:00:00Z',end:'2026-11-01T14:00:00Z'}];
    const response=await f.get(await f.select());
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('Synthetic scholarship');
  });
  it('includes actor-owned saved opportunities only while their revision remains visible',async()=>{
    const f=fixture();f.base.profile.interestTopics=[];f.base.savedOpportunityIds=['OPP1'];
    const id=await f.select(),saved=await f.get(id);
    expect(saved.statusCode).toBe(200);
    expect(saved.json().entries.find((e:{refId:string})=>e.refId==='OPP1').importance).toBe('SAVED');
    f.base.authorizedRevisionIds=[];
    expect((await f.get(id)).json().entries).toEqual([]);
  });
  it.each(['noRights','future','stale','retracted','unverified','research','fork','cancelledCorrection'])
    ('excludes unusable source revisions: %s',async fault=>{
      const f=fixture(),revision=f.base.revisions[0]!;
      if(fault==='noRights')f.base.authorizedRevisionIds=[];
      if(fault==='future')revision.fetchedAt='2026-11-01T00:00:00.000Z';
      if(fault==='stale')revision.status='STALE';
      if(fault==='retracted')revision.status='RETRACTED';
      if(fault==='unverified')delete revision.lastVerifiedAt;
      if(fault==='research')revision.provenance='RESEARCH_ONLY';
      if(fault==='fork')f.base.revisions.push({...revision,revisionId:'REV2'});
      if(fault==='cancelledCorrection')f.base.revisions.push({...revision,revisionId:'REV2',supersedes:'REV1',changeKind:'CANCELLED'});
      const response=await f.get(await f.select());
      expect(response.statusCode).toBe(200);
      expect(response.json().entries).toEqual([]);
      expect(response.json().needsConfirmation).toEqual([]);
    });

  async function reviewerFixture(){
    const f=fixture(),store=new MemoryReviewerAccessStore();
    const identity={actorId:'SYN-REVIEWER',role:'REVIEWER' as const,verifiedEmail:'synthetic-reviewer@example.test',
      identityProofExpiresAt:actor.sessionExpiresAt,sessionExpiresAt:actor.sessionExpiresAt,
      sessionIdHash:'R'.repeat(30),csrfToken:actor.csrfToken};
    const invite=await issueReviewerInvitation(store,{startsAt:'2026-10-30T00:00:00Z',
      endsAt:'2026-11-02T00:00:00Z',label:'Synthetic calendar test'},{now});
    const synthetic=DemoSnapshotSchema.parse(snapshot);
    const app=createApi({repository:{listProfiles:async()=>{throw Error('Real repository accessed');},
      readSnapshot:async()=>{throw Error('Real repository accessed');},
      readGrant:async()=>{throw Error('Real repository accessed');},readSafePacket:async()=>null},
      allowedOrigin:origin,now:()=>now,verifySession:async()=>identity,reviewerAccess:store,
      reviewerDemo:{listProfiles:async()=>profiles.profiles.map(p=>DemoProfileOptionSchema.parse({...p,readiness:'READY',dataMode:'SYNTHETIC'})),
        readSnapshot:async()=>synthetic},calendarSource:f.source});
    opened.push(app);
    expect((await app.inject({method:'POST',url:'/api/reviewer/invitations/redeem',headers,
      payload:{enrollmentCode:invite.enrollmentCode}})).statusCode).toBe(200);
    const selected=await app.inject({method:'POST',url:'/api/demo/contexts',headers,
      payload:{demoSubjectId:'S01',demoRunId:'REVIEWER-CALENDAR'}});
    expect(selected.statusCode).toBe(201);
    delete f.base.grant;f.base.actorId=identity.actorId;
    f.base.scopeKey=scopeInputsToGrant(f.base.profile,f.base.noticeStudent,
      ['FEED','NOTICES','ACADEMICS','FORECAST','EXPERIENCE']).scopeKey;
    const get=()=>app.inject({url:`/api/demo/contexts/${selected.json().contextId}/calendar`,headers});
    return {...f,store,invite,get};
  }
  it('supports active REVIEWER invitations with isolated synthetic inputs only',async()=>{
    const f=await reviewerFixture(),response=await f.get();
    expect(response.statusCode).toBe(200);
    expect(f.read).toHaveBeenCalledWith(expect.objectContaining({reviewerInviteId:f.invite.invitationId}));
    await f.store.revoke(f.invite.invitationId,now);
    expect((await f.get()).statusCode).toBe(403);
  });
  it.each(['MIXED','REAL_CONSENTED'] as const)('rejects REVIEWER calendar data mode %s',async mode=>{
    const f=await reviewerFixture();f.base.datasetMode=mode;
    expect((await f.get()).statusCode).toBe(403);
  });
  it('rejects REVIEWER real source revisions and invitation revocation during source revalidation',async()=>{
    const f=await reviewerFixture();f.base.revisions[0]!.provenance='REAL_APPROVED';
    expect((await f.get()).statusCode).toBe(403);
    f.base.revisions[0]!.provenance='SYNTHETIC';
    f.revalidate.mockImplementation(async()=>{await f.store.revoke(f.invite.invitationId,now);return true;});
    expect((await f.get()).statusCode).toBe(403);
  });
});
