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
  let consent=true,current=true,policy=true,payload:unknown=course,driverDates=false;
  let projectionCount=1,refsPerProjection=1,projectionKind:'COURSE'|'V2_CATALOG'='COURSE',
    proofMode:'NORMAL'|'MISSING'|'DUPLICATE'='NORMAL';
  let projectionActor=actorId;
  let hash=canonicalProjectionHash(payload),sourceStatus='ACTIVE';
  const calls:string[]=[],proofInputs:unknown[][]=[];
  const source={revision_id:'SYN-REV',source_id:'SYN-SOURCE',permission_ref:'SYN-PERMISSION',
    status:'ACTIVE',change_kind:'NEW',source_class:'SYNTHETIC',provenance:'SYNTHETIC',
    fetched_at:now,last_verified_at:now,valid_from:null,valid_until:null,
    original_sha256:'a'.repeat(64),stored_original_sha256:'a'.repeat(64),
    review_original_sha256:'a'.repeat(64),content_sha256:'b'.repeat(64),
    review_content_sha256:'b'.repeat(64),review_decision:'APPROVED',reviewer_id:'SYN-INDEPENDENT',
    review_checked_at:now,rights_expires_at:'2026-12-01T00:00:00Z',scope_campuses:['SEOUL'],scope_majors:null,
    scope_colleges:null,scope_major_roles:null,scope_admission_types:null,
    scope_enrollment_states:null,scope_graduation_terms:null,cohort_min:null,cohort_max:null};
  const pool:ReviewerSqlPool={connect:async()=>({query:async(sql,params)=>{
    calls.push(sql);
    if(sql.includes('FROM api_self_consents'))return {rows:consent?[{version:'1',
      choices_json:{personalStorage:true},updated_at:now}]:[]};
    if(sql.includes('FROM api_owner_approved_projections')
      &&(projectionCount!==1||refsPerProjection!==1))return {rows:current?
      Array.from({length:projectionCount},(_,index)=>{
        const value={...course,courseId:'SYN-COURSE-'+index};
        return {projection_id:'SYN-PROJECTION-'+index,actor_id:projectionActor,kind:projectionKind,
          entity_id:'SYN-COURSE-'+index,version:'SYN-CATALOG-1',payload_json:value,
          payload_sha256:canonicalProjectionHash(value),
          sources_json:Array.from({length:refsPerProjection},()=>({
            sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERMISSION'})),
          reviewed_by:'SYN-INDEPENDENT',reviewed_at:now,as_of:now,starts_at:now,
          expires_at:'2026-12-01T00:00:00Z'};
      }).filter(row=>typeof params?.[6]!=='string'||row.entity_id>String(params[6]))
        .slice(0,typeof params?.[7]==='number'?Number(params[7]):501):[]};
    if(sql.includes('FROM api_owner_approved_projections'))return {rows:current?[{
      projection_id:'SYN-PROJECTION',actor_id:projectionActor,kind:'COURSE',entity_id:'SYN-COURSE',
      version:'SYN-CATALOG-1',payload_json:payload,payload_sha256:hash,
      sources_json:[{sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERMISSION'}],
      reviewed_by:'SYN-INDEPENDENT',
      reviewed_at:driverDates?new Date(now):now,as_of:driverDates?new Date(now):now,
      starts_at:driverDates?new Date(now):now,
      expires_at:driverDates?new Date('2026-12-01T00:00:00Z'):'2026-12-01T00:00:00Z'}]:[]};
    if(sql.includes('FROM jsonb_to_recordset(')){
      proofInputs.push(params?[...params]:[]);
      const row={...source,
        ...(driverDates?{fetched_at:new Date(now),last_verified_at:new Date(now),
          review_checked_at:new Date(now)}:{}),status:sourceStatus};
      return {rows:proofMode==='MISSING'?[]:proofMode==='DUPLICATE'?[row,row]:[row]};
    }
    return {rows:[]};
  },release:()=>{}})};
  const catalog=new PostgresTrustedOwnerCatalog(pool,{resolve:async()=>policy?grants:null},()=>now);
  return {catalog,calls,proofInputs,source,
    setBatch:(count:number,perProjection:number)=>{projectionCount=count;refsPerProjection=perProjection;},
    setKind:(value:'COURSE'|'V2_CATALOG')=>{projectionKind=value;},
    setProofMode:(mode:'NORMAL'|'MISSING'|'DUPLICATE')=>{proofMode=mode;},
    setConsent:(value:boolean)=>{consent=value;},
    setActor:(value:string)=>{projectionActor=value;},
    setCurrent:(value:boolean)=>{current=value;},setPolicy:(value:boolean)=>{policy=value;},
    setPayload:(value:unknown,rehashed=false)=>{payload=value;if(rehashed)hash=canonicalProjectionHash(value);},
    setStatus:(value:string)=>{sourceStatus=value;},
    useDriverDates:(flag:boolean)=>{driverDates=flag;}};
}
const query={actorId,now,asOf:now,limit:10};
describe('approved owner PostgreSQL catalog (SQL protocol tests)',()=>{
  it('canonicalizes JSONB key order without accepting changed values',()=>{
    expect(canonicalProjectionHash({b:[{z:1,a:2}],a:1}))
      .toBe(canonicalProjectionHash({a:1,b:[{a:2,z:1}]}));
    expect(canonicalProjectionHash({a:1})).not.toBe(canonicalProjectionHash({a:2}));
  });
  it('treats PostgreSQL timestamptz Date objects as stable ISO instants in integrity receipts',async()=>{
    const h=fixture();
    h.useDriverDates(true);
    const result=await h.catalog.listCourses(query);
    expect(result?.result.items).toEqual([course]);
    expect(await h.catalog.revalidate({actorId,scopeToken:result!.scopeToken,now})).toBe(true);
    expect(canonicalProjectionHash({at:new Date(now)}))
      .toBe(canonicalProjectionHash({at:'2026-11-01T00:00:00.000Z'}));
    expect(()=>canonicalProjectionHash({at:new Date('not-a-date')})).toThrow();
  });
  it('reads and validates approved source-bound courses and revalidates the exact owner receipt',async()=>{
    const h=fixture(),result=await h.catalog.listCourses(query);
    expect(result?.result).toEqual({asOf:now,nextCursor:null,items:[course]});
    expect(await h.catalog.revalidate({actorId,scopeToken:result!.scopeToken,now})).toBe(true);
    expect(await h.catalog.revalidate({actorId:'SYN-OTHER',scopeToken:result!.scopeToken,now})).toBe(false);
    expect(h.calls.some(sql=>sql.includes('REPEATABLE READ'))).toBe(true);
    expect(h.calls.some(sql=>sql.includes("set_config('hufs.self_actor'"))).toBe(true);
  });
  it('consumes current-read tickets once, including a cross-actor attempt',async()=>{
    const a=fixture(),first=await a.catalog.listCourses(query);
    expect(await a.catalog.revalidate({actorId,scopeToken:first!.scopeToken,now})).toBe(true);
    expect(await a.catalog.revalidate({actorId,scopeToken:first!.scopeToken,now})).toBe(false);
    const b=fixture(),second=await b.catalog.listCourses(query);
    expect(await b.catalog.revalidate({actorId:'SYN-OTHER',scopeToken:second!.scopeToken,now}))
      .toBe(false);
    expect(await b.catalog.revalidate({actorId,scopeToken:second!.scopeToken,now}))
      .toBe(false);
  });
  it('bounds pending tickets so a burst of abandoned reads cannot block subsequent owners',async()=>{
    const h=fixture(),first=await h.catalog.listCourses(query);
    h.setActor('SYN-NOISY');
    for(let index=0;index<128;index++)
      expect(await h.catalog.listCourses({...query,actorId:'SYN-NOISY'})).not.toBeNull();
    await expect(h.catalog.listCourses({...query,actorId:'SYN-NOISY'})).rejects.toThrow('Receipt admission unavailable');
    h.setActor(actorId);
    expect(await h.catalog.revalidate({actorId,scopeToken:first!.scopeToken,now})).toBe(true);
    const next=await h.catalog.listCourses(query);
    expect(next).not.toBeNull();
    expect(await h.catalog.revalidate({actorId,scopeToken:next!.scopeToken,now})).toBe(true);
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
  it('runs one distinct-source SQL proof lookup for 500 projections with 100 repeated refs each',async()=>{
    const h=fixture();h.setBatch(500,100);
    const read=await h.catalog.reader.read({actorId,kind:'COURSE',asOf:now},now);
    expect(read?.rows).toHaveLength(500);
    expect(h.calls.filter(sql=>sql.includes('FROM jsonb_to_recordset('))).toHaveLength(1);
    expect(h.proofInputs).toHaveLength(1);
    expect(JSON.parse(String(h.proofInputs[0]![0]))).toEqual([{
      source_id:'SYN-SOURCE',revision_id:'SYN-REV',permission_ref:'SYN-PERMISSION',
    }]);
    expect(h.calls.some(sql=>sql.includes('REPEATABLE READ READ ONLY'))).toBe(true);
  });
  it('fails closed if requested proofs are missing or SQL joins yield duplicate matches',async()=>{
    for(const mode of ['MISSING','DUPLICATE'] as const){
      const h=fixture();h.setProofMode(mode);
      expect(await h.catalog.reader.read({actorId,kind:'COURSE',asOf:now},now)).toBeNull();
      expect(h.calls.some(sql=>sql.includes('FROM jsonb_to_recordset('))).toBe(true);
    }
  });
  it('reads V2 PostgreSQL keysets in exact C order with validated lookahead',async()=>{
    const h=fixture();h.setBatch(5,1);h.setKind('V2_CATALOG');
    const start=await h.catalog.reader.readV2KeysetPage({
      actorId,asOf:now,pageSize:2,
    },now);
    expect(start?.rows.map(x=>x.entity_id)).toEqual(['SYN-COURSE-0','SYN-COURSE-1']);
    expect(start?.hasMore).toBe(true);
    expect(start?.nextAfterEntityId).toBe('SYN-COURSE-1');
    const middle=await h.catalog.reader.readV2KeysetPage({
      actorId,asOf:now,pageSize:2,afterEntityId:start!.nextAfterEntityId!,
    },now);
    expect(middle?.rows.map(x=>x.entity_id)).toEqual(['SYN-COURSE-2','SYN-COURSE-3']);
    expect(middle?.hasMore).toBe(true);
    const last=await h.catalog.reader.readV2KeysetPage({
      actorId,asOf:now,pageSize:2,afterEntityId:middle!.nextAfterEntityId!,
    },now);
    expect(last?.rows.map(x=>x.entity_id)).toEqual(['SYN-COURSE-4']);
    expect(last?.hasMore).toBe(false);
    expect(last?.nextAfterEntityId).toBeNull();
    expect(h.calls.filter(sql=>sql.includes('FROM jsonb_to_recordset('))).toHaveLength(3);
    expect(h.calls.some(sql=>sql.includes('p.entity_id COLLATE "C" > $7'))).toBe(true);
  });
  it('rejects invalid V2 page bounds and denies pages after current proof withdrawal',async()=>{
    const h=fixture();h.setBatch(3,1);h.setKind('V2_CATALOG');
    for(const bad of [0,51,-1,1.5]){
      await expect(h.catalog.reader.readV2KeysetPage({
        actorId,asOf:now,pageSize:bad,
      },now)).rejects.toThrow('Invalid approved owner keyset scope');
    }
    await expect(h.catalog.reader.readV2KeysetPage({
      actorId,asOf:now,pageSize:2,afterEntityId:'../../other-actor',
    },now)).rejects.toThrow();
    h.setProofMode('MISSING');
    expect(await h.catalog.reader.readV2KeysetPage({
      actorId,asOf:now,pageSize:2,
    },now)).toBeNull();
    h.setProofMode('NORMAL');h.setStatus('RETRACTED');
    expect(await h.catalog.reader.readV2KeysetPage({
      actorId,asOf:now,pageSize:2,
    },now)).toBeNull();
  });
  it('deduplicates 100 source references within a single projection before its SQL lookup',async()=>{
    const h=fixture();h.setBatch(1,100);
    const read=await h.catalog.reader.read({actorId,kind:'COURSE',asOf:now},now);
    expect(read?.rows).toHaveLength(1);
    expect(h.calls.filter(sql=>sql.includes('FROM jsonb_to_recordset('))).toHaveLength(1);
    expect(JSON.parse(String(h.proofInputs[0]![0]))).toHaveLength(1);
  });
  it('binds a deduplicated source proof to every reviewed ref count and original hash',async()=>{
    const h=fixture(),q={actorId,kind:'COURSE' as const,asOf:now};
    h.setBatch(1,100);
    const first=await h.catalog.reader.read(q,now);
    expect(first?.rows[0]?.sources_json).toHaveLength(100);
    h.setBatch(1,99);
    const fewer=await h.catalog.reader.read(q,now);
    expect(fewer?.fingerprint).not.toBe(first?.fingerprint);
    h.setBatch(1,100);
    const newOriginal='c'.repeat(64);
    h.source.original_sha256=newOriginal;
    h.source.stored_original_sha256=newOriginal;
    h.source.review_original_sha256=newOriginal;
    const reverified=await h.catalog.reader.read(q,now);
    expect(reverified).not.toBeNull();
    expect(reverified?.fingerprint).not.toBe(first?.fingerprint);
    expect(h.calls.filter(sql=>sql.includes('FROM jsonb_to_recordset('))).toHaveLength(3);
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
