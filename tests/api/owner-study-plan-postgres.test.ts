import {afterEach,describe,expect,it} from 'vitest';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {canonicalProjectionHash} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import {PostgresOwnerStudyPlanSnapshotLoader} from '../../apps/api/src/modules/academics/owner-study-plan-postgres.js';
import {createTrustedOwnerStudyPlanSource} from '../../apps/api/src/modules/academics/owner-study-plan-source.js';
import {createPostgresPlatformServices} from '../../apps/api/src/platform-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const at='2026-11-02T00:00:00.000Z',term='2027-1',actorId='SYN-OWNER';
const actor={role:'BETA' as const,actorId,sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),
  betaAllowed:true,sessionExpiresAt:'2026-12-01T00:00:00Z',schoolMailProofExpiresAt:'2026-12-01T00:00:00Z'};
const apps:Array<ReturnType<typeof createIntegratedApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(app=>app.close()));apps.length=0;});
function fixture(){
  let clock=at,consent=true,policy=true,current=true;
  const payload={term,transcript:{version:'SYN-TRANSCRIPT',state:'APPROVED',attempts:[]},
    catalog:{version:'SYN-CATALOG',courseCreditUnits:{'SYN-A':6,'SYN-B':6}},
    rulePack:{version:'SYN-RULES',state:'APPROVED',termRules:{creditCapUnits:10,capEvidenceRefs:['SYN-CAP']}},
    approval:{rulePackState:'APPROVED',rulePackVersion:'SYN-RULES',officialEvidenceRefs:['SYN-CAP'],
      verifiedAt:at,sourceRightsVersion:'SYN-POLICY',consentVersion:'1',coreVersion:'SYN-CORE-116'},
    evidenceLinks:[{evidenceRef:'SYN-CAP',href:'https://synthetic.invalid/cap',verifiedAt:at}],
    visibility:{mode:'OWNER_VERIFIED',allowedCourseRefs:['SYN-A','SYN-B']}};
  const projection={projection_id:'SYN-INPUT',actor_id:actorId,kind:'PLAN_INPUT',entity_id:term,
    version:'SYN-INPUT-1',payload_json:payload,payload_sha256:canonicalProjectionHash(payload),
    sources_json:[{sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERM'}],
    reviewed_by:'SYN-REVIEWER',reviewed_at:at,as_of:at,starts_at:at,expires_at:'2026-12-01T00:00:00Z'};
  const source={revision_id:'SYN-REV',source_id:'SYN-SOURCE',permission_ref:'SYN-PERM',
    status:'ACTIVE',change_kind:'NEW',source_class:'SYNTHETIC',provenance:'SYNTHETIC',
    fetched_at:at,last_verified_at:at,valid_from:null,valid_until:null,
    original_sha256:'a'.repeat(64),stored_original_sha256:'a'.repeat(64),review_original_sha256:'a'.repeat(64),
    content_sha256:'b'.repeat(64),review_content_sha256:'b'.repeat(64),
    review_decision:'APPROVED',reviewer_id:'SYN-REVIEWER',review_checked_at:at,
    rights_expires_at:'2026-12-01T00:00:00Z'};
  const row=(id:string)=>({actor_id:actorId,kind:'STUDY_PLAN',item_id:id,version:'1',updated_at:new Date(at),
    value_json:{kind:'STUDY_PLAN',dataMode:'SYNTHETIC',state:'DRAFT',courseId:id,targetTerm:term,planned:true}});
  let rows=[row('SYN-A'),row('SYN-B')];const calls:{sql:string;params:readonly unknown[]|undefined}[]=[];
  const pool:ReviewerSqlPool={connect:async()=>({query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.includes('FROM api_self_consents'))return {rows:consent?[{version:'1',choices_json:{personalStorage:true}}]:[]};
    if(sql.includes('FROM api_owner_approved_projections'))return {rows:current?[projection]:[]};
    if(sql.includes('FROM source_effective_revisions_vnext'))return {rows:[source]};
    if(sql.includes('FROM api_self_workspace_records'))return {rows:structuredClone(rows)};
    return {rows:[]};
  },release:()=>{}})};
  const authority={resolve:async()=>policy?{permissionRefs:new Set(['SYN-PERM']),
    sourceIds:new Set(['SYN-SOURCE']),policyVersion:'SYN-POLICY',sourceHeadVersion:'SYN-REV'}:null};
  const loader=new PostgresOwnerStudyPlanSnapshotLoader(pool,authority,()=>clock);
  const input={actorId,term,now:at};
  return {loader,input,pool,authority,payload,projection,source,calls,
    load:()=>loader.load(input),setRows:(next:typeof rows)=>{rows=next;},getRows:()=>structuredClone(rows),
    setClock:(next:string)=>{clock=next;},denyConsent:()=>{consent=false;},
    denyPolicy:()=>{policy=false;},withdraw:()=>{current=false;},
    rehash:()=>{projection.payload_sha256=canonicalProjectionHash(payload);}};
}
describe('durable approved owner study-plan snapshot',()=>{
  it('computes the existing core from current persisted drafts and hashes the actual plan head',async()=>{
    const h=fixture(),first=await h.load();expect(first).not.toBeNull();
    expect(first?.plan.items).toHaveLength(2);expect(first?.plan.version).toMatch(/^plan-[a-f0-9]{64}$/);
    const source=createTrustedOwnerStudyPlanSource({snapshots:h.loader});
    const result=await source.inspect({...h.input,expectedPlanVersion:'obsolete-plan'});
    expect(result.check).toMatchObject({state:'NEEDS_REVIEW',termLoadCreditUnits:12,creditCapUnits:10,
      planIssues:expect.arrayContaining([{code:'CREDIT_CAP_EXCEEDED',reasonCode:'EXCEEDS_APPROVED_LIMIT',
        courseRefs:['SYN-A','SYN-B'],evidenceRefs:['SYN-CAP']},
        {code:'NEEDS_REVIEW',reasonCode:'COURSE_NOT_CONFIRMED',courseRefs:['SYN-A','SYN-B'],evidenceRefs:[]}]),
      versions:{plan:first?.plan.version}});
    const data=JSON.stringify(result.check);expect(data).not.toContain('attempts');
    const rows=h.getRows();h.setRows(rows.slice(0,1));
    expect((await h.load())?.plan.version).not.toBe(first?.plan.version);
    expect((await source.inspect(h.input)).check).toMatchObject({termLoadCreditUnits:6});
    expect(h.calls.some(c=>c.sql.includes('REPEATABLE READ'))).toBe(true);
    expect(h.calls.find(c=>c.sql.includes('FROM api_self_workspace_records'))?.params?.[0]).toBe(actorId);
  });
  it('denies unapproved inputs and current permission loss before a workspace read',async()=>{
    for(const deny of [(h:ReturnType<typeof fixture>)=>h.denyConsent(),
      (h:ReturnType<typeof fixture>)=>h.denyPolicy(),(h:ReturnType<typeof fixture>)=>h.withdraw()]){
      const h=fixture();deny(h);expect(await h.load()).toBeNull();
      expect(h.calls.some(c=>c.sql.includes('FROM api_self_workspace_records'))).toBe(false);
    }
  });
  it('revalidates edits, additions, deletions and all independent input withdrawals',async()=>{
    for(const change of [
      (h:ReturnType<typeof fixture>)=>{const rows=h.getRows();rows[0]!.version='2';h.setRows(rows);},
      (h:ReturnType<typeof fixture>)=>{const rows=h.getRows();rows.push({...rows[0]!,item_id:'SYN-EXTRA'});h.setRows(rows);},
      (h:ReturnType<typeof fixture>)=>h.setRows([]),
      (h:ReturnType<typeof fixture>)=>h.denyConsent(),(h:ReturnType<typeof fixture>)=>h.denyPolicy(),
      (h:ReturnType<typeof fixture>)=>h.withdraw(),(h:ReturnType<typeof fixture>)=>{h.source.status='RETRACTED';},
    ]){const h=fixture(),snapshot=await h.load();change(h);
      expect(await h.loader.revalidate({actorId,receipt:snapshot!.receipt,now:at})).toBe(false);}
  });
  it('uses bounded expiring single-use receipts and rejects cross-owner replay',async()=>{
    const h=fixture(),one=await h.load();
    expect(await h.loader.revalidate({actorId:'SYN-OTHER',receipt:one!.receipt,now:at})).toBe(false);
    expect(await h.loader.revalidate({actorId,receipt:one!.receipt,now:at})).toBe(false);
    const two=await h.load();
    expect(await h.loader.revalidate({actorId,receipt:two!.receipt,now:at})).toBe(true);
    expect(await h.loader.revalidate({actorId,receipt:two!.receipt,now:at})).toBe(false);
    const three=await h.load();h.setClock('2026-11-02T00:01:00Z');
    expect(await h.loader.revalidate({actorId,receipt:three!.receipt,now:at})).toBe(false);
  });
  it('offers retained validation for independent HTTP gates without changing consume-once validation',async()=>{
    const h=fixture(),one=await h.load(),input={actorId,receipt:one!.receipt,now:at};
    expect(await h.loader.revalidateCurrent(input)).toBe(true);
    expect(await h.loader.revalidateCurrent(input)).toBe(true);
    expect(await h.loader.revalidateCurrent({...input,actorId:'SYN-OTHER'})).toBe(false);
    expect(await h.loader.revalidate(input)).toBe(true);
    expect(await h.loader.revalidateCurrent(input)).toBe(false);
  });
  it('rejects a receipt that expires during an awaited source authorization',async()=>{
    const h=fixture(),snapshot=await h.load(),resolve=h.authority.resolve;
    h.authority.resolve=async()=>{h.setClock('2026-11-02T00:01:00Z');return resolve();};
    expect(await h.loader.revalidate({actorId,receipt:snapshot!.receipt,now:at})).toBe(false);
  });
  it.each(['projection','rights'] as const)('rejects %s expiry during an await before the ticket TTL',async kind=>{
    const h=fixture(),deadline='2026-11-02T00:00:10Z';
    if(kind==='projection')h.projection.expires_at=deadline;else h.source.rights_expires_at=deadline;
    const snapshot=await h.load(),resolve=h.authority.resolve;let checks=0;
    h.setClock('2026-11-02T00:00:05Z');
    h.authority.resolve=async()=>{if(++checks===2)h.setClock('2026-11-02T00:00:15Z');return resolve();};
    expect(await h.loader.revalidate({actorId,receipt:snapshot!.receipt,now:'2026-11-02T00:00:05Z'})).toBe(false);
  });
  it('preserves a stable snapshot while current authorization time advances inside the TTL',async()=>{
    const h=fixture(),snapshot=await h.load(),later='2026-11-02T00:00:10Z';h.setClock(later);
    expect(await h.loader.revalidate({actorId,receipt:snapshot!.receipt,now:later})).toBe(true);
  });
  it('refuses noisy-owner overflow without evicting another current receipt',async()=>{
    const h=fixture(),first=await h.load(),originalRows=h.getRows();
    h.projection.actor_id='SYN-NOISY';
    h.setRows(originalRows.map(row=>({...row,actor_id:'SYN-NOISY'})));
    const noisy={...h.input,actorId:'SYN-NOISY'};
    for(let i=0;i<128;i++)expect(await h.loader.load(noisy)).not.toBeNull();
    await expect(h.loader.load(noisy)).rejects.toThrow('Receipt admission unavailable');
    h.projection.actor_id=actorId;h.setRows(originalRows);
    expect(await h.loader.revalidate({actorId,receipt:first!.receipt,now:at})).toBe(true);
    expect(await h.loader.revalidate({actorId,receipt:first!.receipt,now:at})).toBe(false);
    expect(await h.load()).not.toBeNull();
    h.setClock('2026-11-02T00:00:31.000Z');
    h.projection.actor_id='SYN-NOISY';
    h.setRows(originalRows.map(row=>({...row,actor_id:'SYN-NOISY'})));
    expect(await h.loader.load({...noisy,now:'2026-11-02T00:00:31.000Z'})).not.toBeNull();
  });
  it('rejects foreign, future, malformed or oversized workspace inputs and wrong term/consent binding',async()=>{
    for(const mutate of [
      (h:ReturnType<typeof fixture>)=>{const rows=h.getRows();rows[0]!.actor_id='SYN-OTHER';h.setRows(rows);},
      (h:ReturnType<typeof fixture>)=>{const rows=h.getRows();rows[0]!.updated_at=new Date('2027-01-01T00:00:00Z');h.setRows(rows);},
      (h:ReturnType<typeof fixture>)=>{const rows=h.getRows();rows[0]!.version='9007199254740992';h.setRows(rows);},
      (h:ReturnType<typeof fixture>)=>{h.setRows(Array.from({length:201},()=>h.getRows()[0]!));},
      (h:ReturnType<typeof fixture>)=>{h.payload.term='2028-1';h.rehash();},
      (h:ReturnType<typeof fixture>)=>{h.payload.approval.consentVersion='old';h.rehash();},
    ]){const h=fixture();mutate(h);await expect(h.load()).rejects.toThrow();}
  });
  it('wires explicit PostgreSQL features without bypassing independent HTTP rights/approval',async()=>{
    const h=fixture();let allowed=true,approved=true;
    const rights={mayInspect:async()=>allowed,authorize:async()=>({allowed:true,rightsReceipt:'SYN-RIGHTS-RECEIPT'}),
      revalidate:async()=>true};
    const services=createPostgresPlatformServices({pools:{projections:h.pool,calendar:h.pool,personal:h.pool,evidence:h.pool},
      evidenceRights:{resolveFor:async()=>null},now:()=>at,
      ownerCatalog:{pool:h.pool,authority:h.authority},
      studyPlanCheck:{pool:h.pool,authority:h.authority,rights,approvalGate:{isApproved:async()=>approved}}});
    expect(services.ownerCatalog).toBeDefined();
    const app=createIntegratedApi({...services,allowedOrigin:'https://synthetic.invalid',
      repository:new MemoryApiRepository({profiles:[]}),now:()=>at,
      auth:{verifySession:async()=>actor,revokeSession:async()=>{}}});apps.push(app);
    const check=(expectedPlanVersion?:string)=>app.inject({method:'POST',url:'/api/study-plans/check',
      headers:{origin:'https://synthetic.invalid','x-csrf-token':actor.csrfToken},
      payload:{term,...(expectedPlanVersion?{expectedPlanVersion}:{})}});
    expect((await check()).statusCode).toBe(200);
    expect((await check('obsolete-plan')).statusCode).toBe(409);
    approved=false;expect((await check()).statusCode).toBe(503);
    allowed=false;const reads=h.calls.length;expect((await check()).statusCode).toBe(403);
    expect(h.calls).toHaveLength(reads);
  });
});
