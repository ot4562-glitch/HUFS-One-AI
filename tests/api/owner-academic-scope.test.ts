import {describe,it,expect} from 'vitest';
import {createTrustedOwnerDoubleMajorSource,ownerDoubleMajorInputRefs,validateOwnerDoubleMajorInput} from '../../apps/api/src/modules/academics/owner-double-major-source.js';
import {PostgresOwnerDoubleMajorSnapshotLoader} from '../../apps/api/src/modules/academics/owner-double-major-postgres.js';
import {canonicalProjectionHash} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import {policyFingerprint,type CurrentEvidenceGrants} from '../../apps/api/src/modules/opportunities/temporal-gateway.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import {syntheticMultiDocumentPack,syntheticTrustedDocuments,SYNTHETIC_AS_OF as at} from '../fixtures/academic-133.js';
import {doubleMajorInput} from './owner-double-major-fixture.js';
const actorId='SYN-OWNER';
const a={sourceId:'SYN-SOURCE-A',revisionId:'SYN-REV-A',permissionRef:'SYN-PERM-A'};
const b={sourceId:'SYN-SOURCE-B',revisionId:'SYN-REV-B',permissionRef:'SYN-PERM-B'};
function input(){
  const base=doubleMajorInput(),pack=syntheticMultiDocumentPack();
  return {...base,profile:{...base.profile,campus:'SYN-CAMPUS',primaryMajor:'SYN-MAJOR',
    curriculumVersion:'SYN-CUR-2024',degreePath:'ADVANCED_SINGLE',track:'SYN-TRACK',
    secondaryMajor:{status:'NONE'},source:a},doubleMajor:null,
    transcript:{...base.transcript,source:a},
    primary:{pack:{...pack,scope:{...pack.scope,degreePath:'ADVANCED_SINGLE',track:'SYN-TRACK'}},
      trustedOriginal:syntheticTrustedDocuments(),courseAreas:{'SYN-SHARED':['A']},source:a,catalogSource:a,
      documentSources:[{documentId:'SYN-DOC-A',source:a},{documentId:'SYN-DOC-B',source:b}]},
    evidenceLinks:[{evidenceRef:'SYN-E1',href:'https://synthetic.invalid/rules',verifiedAt:at}],
  };
}
const inspect=(value:unknown)=>createTrustedOwnerDoubleMajorSource({snapshots:{
  load:async()=>({actorId,asOf:at,receipt:'SYN-ACADEMIC-RECEIPT',projectionVersion:'SYN-PROJ-1',input:value}),
  revalidate:async()=>true,
}}).inspect({actorId,now:at});
function pg(){
  const payload=input();
  const projection={projection_id:'SYN-PROJ',actor_id:actorId,kind:'PLAN_INPUT',entity_id:'CURRENT_DOUBLE_MAJOR',
    version:'SYN-PROJ-1',payload_json:payload as unknown,payload_sha256:canonicalProjectionHash(payload),
    sources_json:[a,b],reviewed_by:'SYN-REVIEWER',reviewed_at:at,as_of:at,starts_at:at,expires_at:'2026-12-01T00:00:00.000Z'};
  const source=(ref:typeof a,hash:string)=>({source_id:ref.sourceId,revision_id:ref.revisionId,permission_ref:ref.permissionRef,
    status:'ACTIVE',change_kind:'NEW',source_class:'SYNTHETIC',provenance:'SYNTHETIC',fetched_at:at,last_verified_at:at,
    valid_from:null,valid_until:null,original_sha256:hash,stored_original_sha256:hash,review_original_sha256:hash,
    content_sha256:'c'.repeat(64),review_content_sha256:'c'.repeat(64),review_decision:'APPROVED',reviewer_id:'SYN-REVIEWER',
    review_checked_at:at,rights_expires_at:'2026-12-01T00:00:00.000Z'});
  const sources=new Map([[a.sourceId,source(a,'a'.repeat(64))],[b.sourceId,source(b,'b'.repeat(64))]]);
  const calls:Array<{sql:string;params:readonly unknown[]}>=[];
  const pool:ReviewerSqlPool={connect:async()=>({query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes('FROM api_self_consents'))return {rows:[{version:'1',choices_json:{personalStorage:true},updated_at:at}]};
    if(sql.includes('FROM api_owner_approved_projections'))return {rows:[projection]};
    if(sql.includes('FROM source_effective_revisions_vnext'))return {rows:sources.has(String(params[0]))?[sources.get(String(params[0]))!]:[]};
    return {rows:[]};
  },release(){}})};
  const grants:CurrentEvidenceGrants={permissionRefs:new Set([a.permissionRef,b.permissionRef]),sourceIds:new Set([a.sourceId,b.sourceId]),
    policyVersion:'SYN-RIGHTS-1',sourceHeadVersion:'SYN-HEADS',campus:'SYN-CAMPUS',cohort:2024,admissionType:'REGULAR',
    majors:[{code:'SYN-MAJOR',role:'PRIMARY'}],degreePath:'ADVANCED_SINGLE',track:'SYN-TRACK',curriculumVersion:'SYN-CUR-2024'};
  const loader=new PostgresOwnerDoubleMajorSnapshotLoader(pool,{resolve:async()=>grants},()=>at);
  return {payload,projection,sources,grants,calls,loader,load:()=>loader.load({actorId,now:at}),
    setInput(value:unknown){projection.payload_json=value;projection.payload_sha256=canonicalProjectionHash(value);}};
}
describe('#133 current owner scope and every reviewed original',()=>{
  it('consumes a scoped multi-document pack through the existing owner source',async()=>{
    const value=await inspect(input());
    expect(value.check).toMatchObject({status:'CHECKED',state:'READY',missingInputs:[],
      primary:{audit:{requirements:[{state:'UNSATISFIED',requiredCreditUnits:84}]}},doubleMajor:{status:'NOT_APPLICABLE'}});
    expect(ownerDoubleMajorInputRefs(validateOwnerDoubleMajorInput(input(),at))).toContainEqual(b);
    for(const privateField of ['sourceDocuments','sourceDocumentHashes','trustedOriginal','attemptToken','documentSources']){
      expect(JSON.stringify(value.check)).not.toContain(privateField);
    }
  });
  it('returns explicit insufficient input for unselected degree or undecided track',async()=>{
    for(const [selection,missing] of [[{degreePath:'UNSELECTED'},'DEGREE_PATH'],[{track:'UNDECIDED'},'TRACK']] as const){
      const raw=input();const value=await inspect({...raw,profile:{...raw.profile,...selection}});
      expect(value.check).toMatchObject({status:'INPUT_REQUIRED',state:'INSUFFICIENT_DATA',missingInputs:[missing],uniqueCredits:null,
        primary:{audit:null}});
    }
  });
  it('rejects a concrete wrong profile axis, missing document source, or changed second trusted hash',async()=>{
    const wrong=input();wrong.profile.degreePath='DOUBLE_MAJOR';
    const missing=input();missing.primary.documentSources.pop();
    const hash=input();hash.primary.trustedOriginal.sourceDocuments[1]!.sourceDocumentSha256='c'.repeat(64);
    for(const raw of [wrong,missing,hash])await expect(inspect(raw)).rejects.toThrow();
  });
  it('connects AREA_SPREAD and GROUP_CHOICE to owner audit rows without raw transcript exposure',async()=>{
    for(const rule of [{kind:'AREA_SPREAD',areaIds:['A','B'],minAreas:2,requiredCreditUnits:12},
      {kind:'GROUP_CHOICE',groups:[['G1','G2'],['H1']],k:1}]){
      const raw=input(),old=raw.primary.pack.requirements[0]!;
      const {kind:_,requiredCreditUnits:__,...refs}=old as typeof old&{requiredCreditUnits:number};
      const changed={...raw,primary:{...raw.primary,pack:{...raw.primary.pack,requirements:[{...refs,...rule}]},
        courseAreas:{G1:['A'],G2:['B']}},transcript:{...raw.transcript,attempts:['G1','G2'].map(id=>({
          attemptToken:id,canonicalCourseId:id,creditUnits:6,ledger:'EARNED',recognition:'RECOGNIZED',term:'2025-2'}))}};
      expect((await inspect(changed)).check.primary.audit?.requirements[0]?.state).toBe('SATISFIED');
    }
  });
  it('compares live degree, track and curriculum before authorizing a scoped snapshot',async()=>{
    expect(await pg().load()).toMatchObject({actorId});
    for(const key of ['degreePath','track','curriculumVersion'] as const){
      const h=pg();delete h.grants[key];await expect(h.load()).rejects.toThrow();
    }
    const h=pg();h.grants.degreePath='DOUBLE_MAJOR';await expect(h.load()).rejects.toThrow();
  });
  it('reads both exact source identities and rejects changed or revoked second-document evidence',async()=>{
    const h=pg();expect(await h.load()).not.toBeNull();
    expect(h.calls.some(c=>c.sql.includes('original_sha256')&&c.params[0]===b.sourceId)).toBe(true);
    const hash=pg(),second=hash.sources.get(b.sourceId)!;
    second.original_sha256=second.stored_original_sha256=second.review_original_sha256='d'.repeat(64);
    await expect(hash.load()).rejects.toThrow();
    const omitted=pg();omitted.projection.sources_json=[a];await expect(omitted.load()).rejects.toThrow();
    const revoked=pg();revoked.sources.get(b.sourceId)!.status='RETRACTED';expect(await revoked.load()).toBeNull();
  });
  it('invalidates issued owner receipts when any academic scope axis changes and rejects actor replay',async()=>{
    for(const key of ['degreePath','track','curriculumVersion'] as const){
      const h=pg(),ticket=await h.load(),before=policyFingerprint(h.grants);
      if(key==='degreePath')h.grants.degreePath='DOUBLE_MAJOR';else h.grants[key]='CHANGED';
      expect(policyFingerprint(h.grants)).not.toBe(before);
      expect(await h.loader.revalidate({actorId,receipt:ticket!.receipt,now:at})).toBe(false);
    }
    const h=pg(),ticket=await h.load();
    expect(await h.loader.revalidate({actorId:'SYN-OTHER',receipt:ticket!.receipt,now:at})).toBe(false);
  });
  it('uses only explicitly sourced same-course approval and holds drafts',async()=>{
    const raw=input(),old=raw.primary.pack.requirements[0]!;
    const {kind:_,requiredCreditUnits:__,...refs}=old as typeof old&{requiredCreditUnits:number};
    const base={...raw,primary:{...raw.primary,pack:{...raw.primary.pack,requirements:[
      {...refs,kind:'REQUIRED_COURSE',canonicalCourseId:'NEW-CODE'}]}},transcript:{...raw.transcript,attempts:[
      {attemptToken:'OLD',canonicalCourseId:'OLD-CODE',creditUnits:6,ledger:'EARNED',recognition:'RECOGNIZED',term:'2025-2'}]}};
    expect((await inspect(base)).check.primary.audit?.requirements[0]?.state).toBe('UNSATISFIED');
    const rule={id:'SYN-EQUIVALENCE',fromCourseIds:['OLD-CODE'],toCourseId:'NEW-CODE',state:'APPROVED',
      evidenceRefs:['SYN-E1'],verifiedAt:at,source:b};
    expect((await inspect({...base,sameCourseRules:[rule]})).check.primary.audit?.requirements[0]?.state).toBe('SATISFIED');
    const held=await inspect({...base,sameCourseRules:[{...rule,state:'DRAFT'}]});
    expect(held.check.state).toBe('NEEDS_REVIEW');
    expect(held.check.primary.audit?.requirements[0]?.state).toBe('NEEDS_REVIEW');
    expect(held.check.uniqueCredits?.earnedCreditUnits).toBe(0);
  });
});
