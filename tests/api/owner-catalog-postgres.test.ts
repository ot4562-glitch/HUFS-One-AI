import {describe,expect,it} from 'vitest';
import {PostgresTrustedOwnerCatalog,canonicalProjectionHash} from
  '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const now='2026-11-01T00:00:00.000Z', actorId='SYN-OWNER';
const grants={permissionRefs:new Set(['SYN-PERMISSION']),sourceIds:new Set(['SYN-SOURCE']),
  policyVersion:'SYN-POLICY',sourceHeadVersion:'SYN-HEAD',campus:'SEOUL'};
const course={courseId:'SYN-COURSE',courseCode:'SYN101',title:'Synthetic course',campus:'SEOUL',
  creditUnits:6,source:{sourceId:'SYN-SOURCE',revisionId:'SYN-REV',
    permissionRef:'SYN-PERMISSION',status:'SYNTHETIC'}};
function fixture(){
  let consent=true,current=true,policy=true,payload:unknown=course;
  let hash=canonicalProjectionHash(payload),sourceStatus='ACTIVE';
  const calls:string[]=[];
  const source={revision_id:'SYN-REV',source_id:'SYN-SOURCE',permission_ref:'SYN-PERMISSION',
    status:'ACTIVE',change_kind:'NEW',source_class:'SYNTHETIC',provenance:'SYNTHETIC',
    fetched_at:now,last_verified_at:now,valid_from:null,valid_until:null,
    original_sha256:'a'.repeat(64),stored_original_sha256:'a'.repeat(64),
    review_original_sha256:'a'.repeat(64),content_sha256:'b'.repeat(64),
    review_content_sha256:'b'.repeat(64),review_decision:'APPROVED',reviewer_id:'SYN-INDEPENDENT',
    review_checked_at:now,scope_campuses:['SEOUL'],scope_majors:null,
    scope_colleges:null,scope_major_roles:null,scope_admission_types:null,
    scope_enrollment_states:null,scope_graduation_terms:null,cohort_min:null,cohort_max:null};
  const pool:ReviewerSqlPool={connect:async()=>({query:async(sql)=>{
    calls.push(sql);
    if(sql.includes('FROM api_self_consents'))return {rows:consent?[{version:'1',
      choices_json:{personalStorage:true},updated_at:now}]:[]};
    if(sql.includes('FROM api_owner_approved_projections'))return {rows:current?[{
      projection_id:'SYN-PROJECTION',actor_id:actorId,kind:'COURSE',entity_id:'SYN-COURSE',
      version:'SYN-CATALOG-1',payload_json:payload,payload_sha256:hash,
      sources_json:[{sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERMISSION'}],
      reviewed_by:'SYN-INDEPENDENT',reviewed_at:now,as_of:now,
      starts_at:now,expires_at:'2026-12-01T00:00:00Z'}]:[]};
    if(sql.includes('FROM source_effective_revisions_vnext'))return {rows:[{...source,status:sourceStatus}]};
    return {rows:[]};
  },release:()=>{}})};
  const catalog=new PostgresTrustedOwnerCatalog(pool,{resolve:async()=>policy?grants:null},()=>now);
  return {catalog,calls,source,setConsent:(value:boolean)=>{consent=value;},
    setCurrent:(value:boolean)=>{current=value;},setPolicy:(value:boolean)=>{policy=value;},
    setPayload:(value:unknown,rehashed=false)=>{payload=value;if(rehashed)hash=canonicalProjectionHash(value);},
    setStatus:(value:string)=>{sourceStatus=value;}};
}
const query={actorId,now,asOf:now,limit:10};
describe('approved owner PostgreSQL catalog (SQL protocol tests)',()=>{
  it('canonicalizes JSONB key order without accepting changed values',()=>{
    expect(canonicalProjectionHash({b:[{z:1,a:2}],a:1}))
      .toBe(canonicalProjectionHash({a:1,b:[{a:2,z:1}]}));
    expect(canonicalProjectionHash({a:1})).not.toBe(canonicalProjectionHash({a:2}));
  });
  it('reads and validates approved source-bound courses and revalidates the exact owner receipt',async()=>{
    const h=fixture(),result=await h.catalog.listCourses(query);
    expect(result?.result).toEqual({asOf:now,nextCursor:null,items:[course]});
    expect(await h.catalog.revalidate({actorId,scopeToken:result!.scopeToken,now})).toBe(true);
    expect(await h.catalog.revalidate({actorId:'SYN-OTHER',scopeToken:result!.scopeToken,now})).toBe(false);
    expect(h.calls.some(sql=>sql.includes('REPEATABLE READ'))).toBe(true);
    expect(h.calls.some(sql=>sql.includes("set_config('hufs.self_actor'"))).toBe(true);
  });
  it('does not read a projection before current owner consent and independent source authority',async()=>{
    const h=fixture();h.setConsent(false);
    expect(await h.catalog.listCourses(query)).toBeNull();
    expect(h.calls.some(sql=>sql.includes('FROM api_owner_approved_projections'))).toBe(false);
    const denied=fixture();denied.setPolicy(false);
    expect(await denied.catalog.listCourses(query)).toBeNull();
    expect(denied.calls.some(sql=>sql.includes('FROM api_owner_approved_projections'))).toBe(false);
  });
  it('rejects withdrawn heads, forged source review SHA, future review and source scope mismatch',async()=>{
    for(const mutate of [
      (h:ReturnType<typeof fixture>)=>h.setStatus('RETRACTED'),
      (h:ReturnType<typeof fixture>)=>{h.source.review_original_sha256='c'.repeat(64);},
      (h:ReturnType<typeof fixture>)=>{h.source.review_checked_at='2026-11-02T00:00:00Z';},
      (h:ReturnType<typeof fixture>)=>{h.source.scope_campuses=['GLOBAL'];},
    ]){const h=fixture();mutate(h);expect(await h.catalog.listCourses(query)).toBeNull();}
  });
  it('rejects changed approved payloads and unbound source IDs even with a correct new hash',async()=>{
    const h=fixture();h.setPayload({...course,creditUnits:8});
    await expect(h.catalog.listCourses(query)).rejects.toThrow();
    const wrong=fixture();wrong.setPayload({...course,source:{...course.source,revisionId:'SYN-OTHER'}},true);
    await expect(wrong.catalog.listCourses(query)).rejects.toThrow();
  });
  it('invalidates a read receipt after owner consent, source policy or current projection withdrawal',async()=>{
    for(const mutate of [
      (h:ReturnType<typeof fixture>)=>h.setConsent(false),
      (h:ReturnType<typeof fixture>)=>h.setPolicy(false),
      (h:ReturnType<typeof fixture>)=>h.setCurrent(false),
    ]){const h=fixture(),result=await h.catalog.listCourses(query);mutate(h);
      expect(await h.catalog.revalidate({actorId,scopeToken:result!.scopeToken,now})).toBe(false);}
  });
  it('filters and paginates only validated visible records without returning a source manifest',async()=>{
    const h=fixture();expect((await h.catalog.listCourses({...query,q:'missing'}))?.result.items).toEqual([]);
    const result=await h.catalog.listCourses({...query,afterId:'SYN-COURSE'});
    expect(result?.result.items).toEqual([]);
    expect(JSON.stringify(result?.result)).not.toContain('payload_sha256');
  });
});
