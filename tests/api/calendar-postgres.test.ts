import {describe,expect,it} from 'vitest';
import {DemoContextSchema} from '@hufs-one/contracts';
import {PostgresCalendarInputSource} from '../../apps/api/src/modules/calendar-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import type {CalendarReadRequest} from '../../apps/api/src/modules/calendar.js';

const now='2026-11-01T00:00:00.000Z';
const request:CalendarReadRequest={actorId:'SYN-ACTOR',now,context:DemoContextSchema.parse({
  contextId:'SYN-CONTEXT',actorId:'SYN-ACTOR',sessionIdHash:'H'.repeat(30),demoSubjectId:'S01',demoRunId:'SYN-RUN',
  datasetVersion:'D1',projectionVersion:'P1',sharingGrantVersion:'G1',expiresAt:'2026-11-01T00:05:00.000Z'})};
function fakeDatabase(){
  const grant:Record<string,unknown>={grant_id:'G1',actor_id:'SYN-ACTOR',subject_id:'S01',version:'G1',
    allowed_sections:['FEED','NOTICES'],expires_at:'2026-11-02T00:00:00Z',revoked_at:null,
    approved_at:'2026-10-30T00:00:00Z',consent_ref:'SYN-CONSENT'};
  const projection:Record<string,unknown>={actor_id:'SYN-ACTOR',subject_id:'S01',dataset_version:'D1',projection_version:'P1',
    as_of:now,dataset_mode:'SYNTHETIC',approval_state:'APPROVED',approved_by:'SYN-REVIEWER',
    approved_at:'2026-10-31T00:00:00Z',consent_ref:'SYN-CONSENT',revoked_at:null,
    expires_at:'2026-11-02T00:00:00Z',source_ids:['SOURCE1'],
    input_json:{profile:{interestTopics:['DATA_ANALYTICS'],desiredJobTopics:[],approvedExperienceTopics:['AI_ML'],
      approvedLanguageCodes:[],officialMajorTopics:[],facts:{}},noticeStudent:{openRequirementIds:['SYN-REQ'],courseIds:[],interestTopics:[]},
      provenance:{},opportunities:[],notices:[]}};
  const revisions:Record<string,unknown>[]=[{revision_id:'REV1',source_id:'SOURCE1',supersedes:null,status:'ACTIVE',change_kind:'NEW',
    provenance:'SYNTHETIC',permission_ref:'PERM1',published_at:'2026-10-29T00:00:00Z',
    fetched_at:'2026-10-29T00:00:00Z',last_verified_at:'2026-10-30T00:00:00Z',valid_from:null,valid_until:null}];
  const heads:Record<string,unknown>[]=[{source_id:'SOURCE1',revision_id:'REV1',last_checked_at:'2026-10-30T00:00:00Z'}];
  const rights:Record<string,unknown>[]=[{actor_id:'SYN-ACTOR',subject_id:'S01',source_id:'SOURCE1',permission_ref:'PERM1',
    policy_version:'RIGHTS1',approval_state:'APPROVED',approved_by:'SYN-REVIEWER',approved_at:'2026-10-30T00:00:00Z',
    expires_at:'2026-11-02T00:00:00Z',revoked_at:null,active:true}];
  const conflicts:Record<string,unknown>[]=[];
  const log:{sql:string;params:readonly unknown[]}[]=[];
  let fail=false,releases=0;
  const pool:ReviewerSqlPool={connect:async()=>({
    query:async(sql,params=[])=>{
      log.push({sql,params});
      if(fail&&sql.includes('api_calendar_input_projections'))throw Error('private DB diagnostic must not leak');
      if(sql.includes('FROM api_sharing_grants'))return {rows:[structuredClone(grant)]};
      if(sql.includes('FROM api_calendar_input_projections'))return {rows:[structuredClone(projection)]};
      if(sql.includes('FROM source_ingest_heads'))return {rows:structuredClone(heads)};
      if(sql.includes('FROM source_revisions_vnext'))return {rows:structuredClone(revisions)};
      if(sql.includes('FROM api_calendar_source_permissions'))return {rows:structuredClone(rights)};
      if(sql.includes('FROM source_conflict_decisions_vnext'))return {rows:structuredClone(conflicts)};
      return {rows:[]};
    },release:()=>{releases++;},
  })};
  return {grant,projection,revisions,heads,rights,conflicts,log,pool,get releases(){return releases;},fail:()=>{fail=true;}};
}

describe('PostgresCalendarInputSource: server-reviewed raw inputs and current grants/rights',()=>{
  it('locks grants/projections/source heads/rights and derives scope from current authority',async()=>{
    const db=fakeDatabase(),source=new PostgresCalendarInputSource(db.pool),bundle=await source.readAuthorizedInputs(request);
    expect(bundle?.grant?.allowedSections).toEqual(['FEED','NOTICES']);
    expect(bundle?.scopeKey).toBe('FEED,NOTICES');
    expect(bundle?.authorizedRevisionIds).toEqual(['REV1']);
    expect(bundle?.context).toEqual(request.context);
    expect(bundle?.authorizationToken).toMatch(/^[0-9a-f]{64}$/);
    for(const table of ['api_sharing_grants','api_calendar_input_projections','source_ingest_heads','api_calendar_source_permissions'])
      expect(db.log.some(x=>x.sql.includes(`FROM ${table}`)&&x.sql.includes('FOR SHARE'))).toBe(true);
    expect(db.log.find(x=>x.sql.includes('FROM api_sharing_grants'))?.params.slice(0,3)).toEqual(['SYN-ACTOR','S01','G1']);
    expect(db.log.some(x=>x.sql==='COMMIT')).toBe(true);
    expect(db.releases).toBe(1);
    expect(await source.revalidateAuthorization(request,bundle!,now)).toBe(true);
  });
  it.each(['actor','subject','dataset','projection','revokedGrant','expiredGrant','partialGrant','unapprovedProjection','revokedProjection','futureApproval','expiredProjection'])
    ('rejects stale/cross-boundary authority: %s',async fault=>{
      const db=fakeDatabase();
      if(fault==='actor')db.grant.actor_id='OTHER';
      if(fault==='subject')db.projection.subject_id='S02';
      if(fault==='dataset')db.projection.dataset_version='D2';
      if(fault==='projection')db.projection.projection_version='P2';
      if(fault==='revokedGrant')db.grant.revoked_at=now;
      if(fault==='expiredGrant')db.grant.expires_at=now;
      if(fault==='partialGrant')db.grant.allowed_sections=['NOTICES'];
      if(fault==='unapprovedProjection')db.projection.approval_state='NEEDS_REVIEW';
      if(fault==='revokedProjection')db.projection.revoked_at=now;
      if(fault==='futureApproval')db.projection.approved_at='2026-11-02T00:00:00Z';
      if(fault==='expiredProjection')db.projection.expires_at=now;
      expect(await new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request)).toBeNull();
      expect(db.log.some(x=>x.sql==='COMMIT')).toBe(false);
      expect(db.releases).toBe(1);
    });
  it('does not authorize a revision without a current separately reviewed source permission',async()=>{
    const db=fakeDatabase(),source=new PostgresCalendarInputSource(db.pool);
    for(const mutate of [()=>{db.rights[0]!.revoked_at=now;},()=>{db.rights[0]!.revoked_at=null;db.rights[0]!.approval_state='NEEDS_REVIEW';},
      ()=>{db.rights[0]!.approval_state='APPROVED';db.rights[0]!.expires_at=now;}]){
      mutate();const bundle=await source.readAuthorizedInputs(request);
      expect(bundle?.authorizedRevisionIds).toEqual([]);
    }
  });
  it.each(['grant','scope','input','permission','head','revision','conflict'])
    ('invalidates an in-flight receipt on changed %s',async fault=>{
      const db=fakeDatabase(),source=new PostgresCalendarInputSource(db.pool),bundle=await source.readAuthorizedInputs(request);
      if(fault==='grant')db.grant.revoked_at=now;
      if(fault==='scope')db.grant.allowed_sections=['FEED','NOTICES','ACADEMICS'];
      if(fault==='input')(db.projection.input_json as {provenance:unknown}).provenance={noticeScope:{campus:'FEED'}};
      if(fault==='permission')db.rights[0]!.policy_version='RIGHTS2';
      if(fault==='head')db.heads[0]!.revision_id='REV2';
      if(fault==='revision')db.revisions[0]!.status='STALE';
      if(fault==='conflict')db.conflicts.push({left_revision_id:'REV1',right_revision_id:'REV2',disposition:'CONFLICT',reviewed_at:now});
      expect(await source.revalidateAuthorization(request,bundle!,now)).toBe(false);
    });
  it('retains cancelled/draft heads while refusing historical active fallback and confirmed conflicts',async()=>{
    const db=fakeDatabase();db.revisions.push({...db.revisions[0],revision_id:'REV2',supersedes:'REV1',status:'NEEDS_REVIEW',change_kind:'CANCELLED'});
    db.heads[0]!.revision_id='REV2';
    const bundle=await new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request);
    expect(bundle?.revisions.map(r=>r.revisionId)).toEqual(['REV1','REV2']);
    expect(bundle?.authorizedRevisionIds).toEqual(['REV1','REV2']);
    db.conflicts.push({left_revision_id:'REV1',right_revision_id:'REV2',disposition:'CONFLICT',reviewed_at:now});
    expect((await new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request))?.authorizedRevisionIds).toEqual([]);
  });
  it('rejects REVIEWER on the production adapter before querying any student table',async()=>{
    const db=fakeDatabase();
    expect(await new PostgresCalendarInputSource(db.pool).readAuthorizedInputs({...request,reviewerInviteId:'SYN-INVITE'})).toBeNull();
    expect(db.log).toEqual([]);
  });
  it('rolls back provider failure, releases its connection and suppresses private diagnostics',async()=>{
    const db=fakeDatabase();db.fail();
    await expect(new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request)).rejects.toThrow('Calendar input source unavailable');
    expect(db.log.some(x=>x.sql==='ROLLBACK')).toBe(true);
    expect(db.releases).toBe(1);
  });
});
