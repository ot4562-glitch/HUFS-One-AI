import {describe,expect,it} from 'vitest';
import {DemoContextSchema} from '@hufs-one/contracts';
import {PostgresCalendarInputSource} from '../../apps/api/src/modules/calendar-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import type {CalendarReadRequest} from '../../apps/api/src/modules/calendar.js';
import {computeAuthorizedCalendar,computeAuthorizedSections} from '../../apps/api/src/modules/calendar.js';
import snapshotFixture from '../../packages/fixtures/synthetic/demo-snapshot.json';

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
  const snapshotRow:Record<string,unknown>={subject_id:'S01',dataset_version:'D1',projection_version:'P1',
    approved_by:'SYN-REVIEWER',approved_at:'2026-10-30T00:00:00Z',current:true,
    snapshot_json:{...structuredClone(snapshotFixture),asOf:now,versions:{...snapshotFixture.versions,projection:'P1'},
      feed:{...snapshotFixture.feed,asOf:now},notices:{...snapshotFixture.notices,asOf:now}}};
  const revisions:Record<string,unknown>[]=[{revision_id:'REV1',source_id:'SOURCE1',supersedes:null,status:'ACTIVE',change_kind:'NEW',
    provenance:'SYNTHETIC',permission_ref:'PERM1',published_at:'2026-10-29T00:00:00Z',
    fetched_at:'2026-10-29T00:00:00Z',last_verified_at:'2026-10-30T00:00:00Z',valid_from:null,valid_until:null}];
  const heads:Record<string,unknown>[]=[{source_id:'SOURCE1',revision_id:'REV1',last_checked_at:'2026-10-30T00:00:00Z'}];
  const rights:Record<string,unknown>[]=[{actor_id:'SYN-ACTOR',subject_id:'S01',source_id:'SOURCE1',permission_ref:'PERM1',
    policy_version:'RIGHTS1',approval_state:'APPROVED',approved_by:'SYN-REVIEWER',approved_at:'2026-10-30T00:00:00Z',
    expires_at:'2026-11-02T00:00:00Z',revoked_at:null,active:true}];
  const conflicts:Record<string,unknown>[]=[];
  const paragraphs:Record<string,unknown>[]=[];
  const log:{sql:string;params:readonly unknown[]}[]=[];
  let fail=false,releases=0;
  const pool:ReviewerSqlPool={connect:async()=>({
    query:async(sql,params=[])=>{
      log.push({sql,params});
      if(sql.includes('api_lock_authorized_calendar_inputs'))return {rows:[{authorized:true}]};
      if(fail&&sql.includes('api_calendar_input_projections'))throw Error('private DB diagnostic must not leak');
      if(sql.includes('FROM api_sharing_grants'))return {rows:[structuredClone(grant)]};
      if(sql.includes('FROM api_calendar_input_projections'))return {rows:[structuredClone(projection)]};
      if(sql.includes('FROM api_demo_snapshot_projections'))return {rows:[structuredClone(snapshotRow)]};
      if(sql.includes('FROM source_ingest_heads'))return {rows:structuredClone(heads)};
      if(sql.includes('FROM source_effective_revisions_vnext'))return {rows:structuredClone(revisions)};
      if(sql.includes('FROM api_calendar_source_permissions'))return {rows:structuredClone(rights)};
      if(sql.includes('FROM source_conflict_decisions_vnext'))return {rows:structuredClone(conflicts)};
      if(sql.includes('FROM source_paragraphs_vnext'))return {rows:structuredClone(paragraphs)};
      return {rows:[]};
    },release:()=>{releases++;},
  })};
  return {grant,projection,snapshotRow,revisions,heads,rights,conflicts,paragraphs,log,pool,get releases(){return releases;},fail:()=>{fail=true;}};
}

describe('PostgresCalendarInputSource: server-reviewed raw inputs and current grants/rights',()=>{
  it('real approved calendar projection only exposes source-proven deadlines and claim IDs',async()=>{
    const db=fakeDatabase(),expiry='2026-11-03T15:00:00.000Z';
    db.projection.dataset_mode='REAL_CONSENTED';
    (db.snapshotRow.snapshot_json as {datasetMode:string}).datasetMode='REAL_CONSENTED';
    db.revisions[0]!.provenance='REAL_APPROVED';
    const sentence='신청 마감 '+expiry;
    db.paragraphs.push({revision_id:'REV1',paragraph_id:'PAR1',paragraph_text:sentence});
    const span={kind:'TEXT',sourceRevisionId:'REV1',paragraphId:'PAR1',
      startCodePoint:0,endCodePoint:Array.from(sentence).length,quote:sentence};
    const proof=(kind:string,itemId:string,field:string,dateKind:string,claimId:string,
      clock='2026-10-30T00:00:00.000Z')=>({
      kind,itemId,sourceRevisionId:'REV1',
      paragraphs:[{revisionId:'REV1',paragraphId:'PAR1',text:sentence}],
      claims:[{claimId,sourceRevisionId:'REV1',field,value:expiry,
        state:'VERIFIED',dateKind,claimCheckedAt:clock,
        reviewerId:'SYN-INDEPENDENT-REVIEWER',evidence:[span]}],
    });
    const input=db.projection.input_json as Record<string,unknown>;
    const opp={id:'SYN-OP',version:'1',sourceSnapshotId:'REV1',title:'가상 공고',
      organization:'합성기관',kind:'CONTEST',topicCodes:['DATA_ANALYTICS'],
      languageCodes:[],eventSessions:[],actualApplicationRoute:'DEMO_DISABLED',
      conditions:[],roleSteps:[],prioritySelection:[],completionRules:[],
      dataMode:'REAL',dataQuality:'COMPLETE',deadlineKind:'FIXED',
      applyClosesAt:expiry};
    const notice={id:'SYN-NOTICE',sourceSnapshotId:'REV1',title:'가상 제출',
      issuer:'합성기관',category:'SCHOLARSHIP',verificationState:'VERIFIED',
      studentDeadline:expiry,evidenceRefs:['SYN-SOURCE']};
    input.opportunities=[opp];input.notices=[notice];
    const reader=new PostgresCalendarInputSource(db.pool);
    // Unreviewed raw projection dates (even if a caller marked them VERIFIED)
    // are stripped without creating a false verified calendar deadline.
    let bundle=await reader.readAuthorizedInputs(request);
    expect(bundle?.opportunities[0]?.applyClosesAt).toBeUndefined();
    expect(bundle?.opportunities[0]?.deadlineKind).toBe('UNKNOWN');
    expect(bundle?.notices[0]?.studentDeadline).toBeUndefined();
    input.deadlineProofs=[
      proof('OPPORTUNITY','SYN-OP','applyClosesAt','APPLY','SYN-APPLY'),
      proof('NOTICE','SYN-NOTICE','studentDeadline','STUDENT','SYN-STUDENT'),
    ];
    bundle=await reader.readAuthorizedInputs(request);
    expect(bundle?.opportunities[0]?.applyClosesAt).toBe(expiry);
    expect(bundle?.notices[0]?.studentDeadline).toBe(expiry);
    expect(bundle?.notices[0]?.evidenceRefs).toContain('SYN-STUDENT');
    expect(bundle?.deadlineClaimRefsByOpportunity).toEqual({'SYN-OP':['SYN-APPLY']});
    expect(db.log.some(x=>x.sql.includes('FROM source_paragraphs_vnext'))).toBe(true);
    expect(bundle).not.toHaveProperty('deadlineProofs');
    // Deliberately forge the alleged source paragraph in a reviewer-approved
    // projection. The immutable TEXT stored in PostgreSQL is authoritative.
    db.paragraphs[0]!.paragraph_text='TAMPERED ORIGINAL';
    await expect(reader.readAuthorizedInputs(request))
      .rejects.toThrow('Calendar input source unavailable');
    db.paragraphs[0]!.paragraph_text=sentence;
    const sections=computeAuthorizedSections(bundle!,request);
    const card=[...sections.feed.featured,...sections.feed.compact]
      .find(c=>c.opportunityId==='SYN-OP');
    expect(card?.evidenceRefs).toContain('SYN-APPLY');
    const entry=sections.calendar.entries.find(e=>e.refId==='SYN-OP'&&e.kind==='APPLY_DEADLINE');
    expect(entry?.evidenceRefs).toContain('SYN-APPLY');
    // As-of verification is evaluated again at read; a future review cannot
    // be laundered into an earlier approved source projection.
    (input.deadlineProofs as Array<{claims:Array<{claimCheckedAt:string}>}>)[0]!
      .claims[0]!.claimCheckedAt='2026-12-01T00:00:00Z';
    bundle=await reader.readAuthorizedInputs(request);
    expect(bundle?.opportunities[0]?.applyClosesAt).toBeUndefined();
    expect(bundle?.notices[0]?.studentDeadline).toBe(expiry);
  });
  it('uses a narrow definer helper so the API connection retains SELECT-only table privileges',async()=>{
    const db=fakeDatabase();await new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request);
    expect(db.log.some(x=>x.sql.includes('api_lock_authorized_calendar_inputs'))).toBe(true);
    expect(db.log.filter(x=>x.sql.includes('FOR SHARE'))).toEqual([]);
  });
  it('locks grants/projections/source heads/rights and derives scope from current authority',async()=>{
    const db=fakeDatabase(),source=new PostgresCalendarInputSource(db.pool),bundle=await source.readAuthorizedInputs(request);
    expect(bundle?.grant?.allowedSections).toEqual(['FEED','NOTICES']);
    expect(bundle?.scopeKey).toBe('FEED,NOTICES');
    expect(bundle?.authorizedRevisionIds).toEqual(['REV1']);
    expect(bundle?.context).toEqual(request.context);
    expect(bundle?.authorizationToken).toMatch(/^[0-9a-f]{64}$/);
    for(const table of ['api_sharing_grants','api_calendar_input_projections','source_ingest_heads','api_calendar_source_permissions'])
      expect(db.log.some(x=>x.sql.includes(`FROM ${table}`))).toBe(true);
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
  it.each(['grant','scope','input','permission','head','revision','conflict','snapshotWithdrawal','snapshotContent'])
    ('invalidates an in-flight receipt on changed %s',async fault=>{
      const db=fakeDatabase(),source=new PostgresCalendarInputSource(db.pool),bundle=await source.readAuthorizedInputs(request);
      if(fault==='grant')db.grant.revoked_at=now;
      if(fault==='scope')db.grant.allowed_sections=['FEED','NOTICES','ACADEMICS'];
      if(fault==='input')(db.projection.input_json as {provenance:unknown}).provenance={noticeScope:{campus:'FEED'}};
      if(fault==='permission')db.rights[0]!.policy_version='RIGHTS2';
      if(fault==='head')db.heads[0]!.revision_id='REV2';
      if(fault==='revision')db.revisions[0]!.status='STALE';
      if(fault==='conflict')db.conflicts.push({left_revision_id:'REV1',right_revision_id:'REV2',disposition:'CONFLICT',reviewed_at:now});
      if(fault==='snapshotWithdrawal')db.snapshotRow.current=false;
      if(fault==='snapshotContent')(db.snapshotRow.snapshot_json as {academics:unknown}).academics={state:'NOT_SHARED'};
      expect(await source.revalidateAuthorization(request,bundle!,now)).toBe(false);
    });
  it('retains cancelled/draft heads while refusing historical active fallback and confirmed conflicts',async()=>{
    const db=fakeDatabase();db.revisions.push({...db.revisions[0],revision_id:'REV2',supersedes:'REV1',status:'NEEDS_REVIEW',change_kind:'CANCELLED'});
    db.heads[0]!.revision_id='REV2';
    const bundle=await new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request);
    expect(bundle?.revisions.map(r=>r.revisionId)).toEqual(['REV1','REV2']);
    expect(bundle?.authorizedRevisionIds).toEqual(['REV2']);
    db.conflicts.push({left_revision_id:'REV1',right_revision_id:'REV2',disposition:'CONFLICT',reviewed_at:now});
    expect((await new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request))?.authorizedRevisionIds).toEqual([]);
  });
  it.each(['CANCELLED','UNKNOWN'] as const)('withholds old dates when current %s head is newer than the frozen projection asOf',async changeKind=>{
    const db=fakeDatabase();db.projection.as_of='2026-10-31T00:00:00Z';
    const snapshot=db.snapshotRow.snapshot_json as {asOf:string;feed:{asOf:string};notices:{asOf:string}};
    snapshot.asOf=String(db.projection.as_of);snapshot.feed.asOf=snapshot.asOf;snapshot.notices.asOf=snapshot.asOf;
    const input=db.projection.input_json as {notices:unknown[]};
    input.notices.push({id:'NOTICE1',sourceSnapshotId:'REV1',title:'Synthetic scholarship',issuer:'Synthetic office',
      category:'SCHOLARSHIP',verificationState:'VERIFIED',studentDeadline:'2026-11-02T00:00:00Z',evidenceRefs:['EV1']});
    db.revisions.push({...db.revisions[0],revision_id:'REV2',supersedes:'REV1',change_kind:changeKind,
      status:'NEEDS_REVIEW',fetched_at:'2026-10-31T12:00:00Z',last_verified_at:null});
    db.heads[0]!.revision_id='REV2';
    const bundle=await new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request);
    expect(bundle).not.toBeNull();
    expect(computeAuthorizedCalendar(bundle!,request).entries).toEqual([]);
    expect(bundle?.authorizedRevisionIds).not.toContain('REV1');
  });
  it('checks current conflicts reviewed after projection asOf and at or before the request',async()=>{
    const db=fakeDatabase();db.projection.as_of='2026-10-31T00:00:00Z';
    const snapshot=db.snapshotRow.snapshot_json as {asOf:string;feed:{asOf:string};notices:{asOf:string}};
    snapshot.asOf=String(db.projection.as_of);snapshot.feed.asOf=snapshot.asOf;snapshot.notices.asOf=snapshot.asOf;
    db.conflicts.push({left_revision_id:'REV1',right_revision_id:'REV2',disposition:'CONFLICT',reviewed_at:'2026-10-31T12:00:00Z'});
    const bundle=await new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request);
    expect(bundle?.authorizedRevisionIds).toEqual([]);
    expect(db.log.find(x=>x.sql.includes('FROM source_conflict_decisions_vnext'))?.params[1]).toBe(now);
  });
  it.each(['asOf','dataset','subject','unapproved'])('refuses an unbound approved snapshot: %s',async fault=>{
    const db=fakeDatabase(),snapshot=db.snapshotRow.snapshot_json as typeof snapshotFixture;
    if(fault==='asOf')snapshot.asOf='2026-10-31T12:00:00Z';
    if(fault==='dataset')snapshot.versions.dataset='OTHER';
    if(fault==='subject')snapshot.demoSubjectId='S02';
    if(fault==='unapproved')db.snapshotRow.approved_by='';
    expect(await new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request)).toBeNull();
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

  it.each([
    {name:'invalid pending shape',academics:{state:'PENDING'},forecast:{status:'PENDING'}},
    {name:'malformed',academics:null,forecast:{unexpected:'SYN-HIDDEN'}},
    {name:'older',academics:{state:'READY',rulePackVersion:'SYN-RULE',asOf:'2026-10-29T00:00:00.000Z',
      earnedCreditUnits:0,inProgressCreditUnits:0,plannedCreditUnits:0,deficits:[],caveats:[]},
      forecast:{status:'PARTIAL',asOf:'2026-10-29T00:00:00.000Z',items:[]}},
    {name:'future',academics:{state:'READY',rulePackVersion:'SYN-RULE',asOf:'2026-11-02T00:00:00.000Z',
      earnedCreditUnits:0,inProgressCreditUnits:0,plannedCreditUnits:0,deficits:[],caveats:[]},
      forecast:{status:'PARTIAL',asOf:'2026-11-02T00:00:00.000Z',items:[]}},
    {name:'large hidden prose',academics:{caveats:['SYN-HIDDEN-'.repeat(7000)]},forecast:null},
  ])('masks $name only after authorizing the grant, retaining the raw receipt fingerprint',async hidden=>{
    const db=fakeDatabase(),source=new PostgresCalendarInputSource(db.pool);
    const original=await source.readAuthorizedInputs(request);
    const snapshot=db.snapshotRow.snapshot_json as Record<string,unknown>;
    snapshot.academics=hidden.academics;snapshot.forecast=hidden.forecast;
    const bundle=await source.readAuthorizedInputs(request);
    expect(bundle).not.toBeNull();
    expect(bundle?.approvedSnapshot.academics).toEqual({state:'NOT_SHARED'});
    expect(bundle?.approvedSnapshot.forecast).toEqual({state:'NOT_SHARED'});
    expect(computeAuthorizedSections(bundle!,request)).toEqual(computeAuthorizedSections(original!,request));
    expect(await source.revalidateAuthorization(request,bundle!,now)).toBe(true);
    expect(await source.revalidateAuthorization(request,original!,now)).toBe(false);
  });
  it('does not mask malformed summaries for an academic/forecast grant',async()=>{
    const db=fakeDatabase();db.grant.allowed_sections=['FEED','NOTICES','ACADEMICS','FORECAST'];
    (db.snapshotRow.snapshot_json as Record<string,unknown>).academics=null;
    await expect(new PostgresCalendarInputSource(db.pool).readAuthorizedInputs(request))
      .rejects.toThrow('Calendar input source unavailable');
  });
});
