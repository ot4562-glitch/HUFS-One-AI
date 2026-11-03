import {describe,expect,it} from 'vitest';
import {doubleMajorInput} from './owner-double-major-fixture.js';
import {PostgresOwnerDoubleMajorSnapshotLoader,createPostgresOwnerDoubleMajorServices} from '../../apps/api/src/modules/academics/owner-double-major-postgres.js';
import {canonicalProjectionHash} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
const at='2026-11-03T00:00:00.000Z',actorId='SYN-OWNER';
function fixture(){
  let now=at,consent=true,active=true;
  const payload=doubleMajorInput();
  const projection={projection_id:'SYN-PROJ',actor_id:actorId,kind:'PLAN_INPUT',entity_id:'CURRENT_DOUBLE_MAJOR',version:'SYN-PROJ-V1',
    payload_json:payload,payload_sha256:canonicalProjectionHash(payload),sources_json:[{sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERM'}],
    reviewed_by:'SYN-REVIEWER',reviewed_at:at,as_of:at,starts_at:at,expires_at:'2026-12-01T00:00:00.000Z'};
  const source={revision_id:'SYN-REV',source_id:'SYN-SOURCE',permission_ref:'SYN-PERM',status:'ACTIVE',change_kind:'NEW',
    source_class:'SYNTHETIC',provenance:'SYNTHETIC',fetched_at:at,last_verified_at:at,valid_from:null,valid_until:null,
    original_sha256:'a'.repeat(64),stored_original_sha256:'a'.repeat(64),review_original_sha256:'a'.repeat(64),
    content_sha256:'b'.repeat(64),review_content_sha256:'b'.repeat(64),review_decision:'APPROVED',reviewer_id:'SYN-REVIEWER',
    review_checked_at:at,rights_expires_at:'2026-12-01T00:00:00.000Z'};
  const calls:string[]=[];
  const pool:ReviewerSqlPool={connect:async()=>({query:async(sql)=>{
    calls.push(sql);
    if(sql.includes('FROM api_self_consents'))return {rows:consent?[{version:'1',choices_json:{personalStorage:true},updated_at:at}]:[]};
    if(sql.includes('FROM api_owner_approved_projections'))return {rows:active?[projection]:[]};
    if(sql.includes('FROM source_effective_revisions_vnext'))return {rows:[source]};
    return {rows:[]};
  },release(){}})};
  const grants={permissionRefs:new Set(['SYN-PERM']),sourceIds:new Set(['SYN-SOURCE']),policyVersion:'SYN-RIGHTS-1',sourceHeadVersion:'SYN-REV',
    campus:'SEOUL',cohort:2024,admissionType:'REGULAR',majors:[{code:'SYN-P',role:'PRIMARY' as const},{code:'SYN-D',role:'DOUBLE' as const}]};
  const authority={resolve:async()=>grants};
  const loader=new PostgresOwnerDoubleMajorSnapshotLoader(pool,authority,()=>now);
  return {loader,pool,authority,projection,payload,source,grants,calls,load:()=>loader.load({actorId,now:at}),
    withdraw:()=>{active=false;},denyConsent:()=>{consent=false;},clock:(value:string)=>{now=value;},rehash:()=>{projection.payload_sha256=canonicalProjectionHash(payload);}};
}
describe('durable current double-major approved projection loader',()=>{
  it('loads an actor/source-scoped two-pack snapshot in repeatable read and computes the source bridge',async()=>{
    const h=fixture(),value=await h.load();
    expect(value).toMatchObject({actorId,asOf:at,projectionVersion:'SYN-PROJ-V1'});
    expect(h.calls.some(sql=>sql.includes('REPEATABLE READ'))).toBe(true);
    const service=createPostgresOwnerDoubleMajorServices({pool:h.pool,authority:h.authority,now:()=>at});
    expect(await service.rights.mayInspect({actorId,now:at})).toBe(true);
    const result=await service.source.inspect({actorId,now:at});
    expect(result.check).toMatchObject({state:'NEEDS_REVIEW',selection:'SELECTED'});
    const rights=await service.rights.authorize({actorId,sourceReceipt:result.receipt,check:result.check,now:at});
    expect(rights.allowed).toBe(true);
    expect(await service.source.revalidate({actorId,receipt:result.receipt,now:at})).toBe(true);
    expect(await service.rights.revalidate({actorId,sourceReceipt:result.receipt,rightsReceipt:rights.rightsReceipt!,now:at})).toBe(true);
  });
  it('invalidates receipts for profile, source head, consent, policy and source expiry changes',async()=>{
    for(const mutate of [
      (h:ReturnType<typeof fixture>)=>{h.payload.profile.secondaryMajor.majorId='OTHER';h.rehash();},
      (h:ReturnType<typeof fixture>)=>h.withdraw(),(h:ReturnType<typeof fixture>)=>h.denyConsent(),
      (h:ReturnType<typeof fixture>)=>{h.grants.policyVersion='changed';},
      (h:ReturnType<typeof fixture>)=>{h.source.status='RETRACTED';},
      (h:ReturnType<typeof fixture>)=>h.clock('2026-12-02T00:00:00.000Z'),
    ]){const h=fixture(),value=await h.load();mutate(h);expect(await h.loader.revalidate({actorId,receipt:value!.receipt,now:at})).toBe(false);}
  });
  it('refuses foreign/current-profile mismatch, unbound pack sources, wrong source hash and stale consent versions',async()=>{
    for(const mutate of [
      (h:ReturnType<typeof fixture>)=>{h.grants.majors[1]!.code='OTHER';},
      (h:ReturnType<typeof fixture>)=>{h.payload.doubleMajor.source={...h.payload.doubleMajor.source,revisionId:'UNBOUND'};h.rehash();},
      (h:ReturnType<typeof fixture>)=>{h.source.original_sha256='c'.repeat(64);h.source.stored_original_sha256=h.source.original_sha256;h.source.review_original_sha256=h.source.original_sha256;},
      (h:ReturnType<typeof fixture>)=>{h.payload.approval.consentVersion='old';h.rehash();},
    ]){const h=fixture();mutate(h);await expect(h.load()).rejects.toThrow();}
  });
  it('binds disclosure authorization to the exact computed response and rejects actor replay',async()=>{
    const h=fixture(),service=createPostgresOwnerDoubleMajorServices({pool:h.pool,authority:h.authority,now:()=>at});
    const result=await service.source.inspect({actorId,now:at});
    expect(await service.rights.authorize({actorId,sourceReceipt:result.receipt,check:{...result.check,selection:'NONE'},now:at})).toMatchObject({allowed:false});
    expect(await service.source.revalidate({actorId:'SYN-OTHER',receipt:result.receipt,now:at})).toBe(false);
  });
});
