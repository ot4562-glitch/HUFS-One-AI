import {describe,expect,it} from 'vitest';
import {PostgresApprovedRevisionClaims} from '../../apps/api/src/modules/opportunities/approved-revision-claims-postgres.js';
import {canonicalProjectionHash} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import {compareOpportunityRevisions} from '../../apps/api/src/modules/opportunities/opportunity-revision-comparison.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const now='2026-11-03T00:00:00.000Z',beforeAt='2026-11-01T00:00:00.000Z',afterAt='2026-11-02T00:00:00.000Z';
const scope={actorId:'SYN-OWNER',opportunityId:'SYN-OPP',beforeRevisionId:'SYN-R1',afterRevisionId:'SYN-R2',asOf:now};
function fixture(){
  let consent=true,authority=true,head='SYN-R2';
  const images:Array<Record<string,unknown>>=[];
  const right={receipt_id:'SYN-RIGHTS',actor_id:scope.actorId,source_id:'SYN-SOURCE',permission_ref:'SYN-PERM',
    purposes:['SEARCH'],reviewed_by:'SYN-RIGHTS-REVIEWER',reviewed_at:beforeAt,starts_at:beforeAt,expires_at:'2026-12-01T00:00:00.000Z',revoked_at:null as null|string};
  const calls:string[]=[];
  const revisions=[beforeAt,afterAt].map((at,i)=>({revision_id:`SYN-R${i+1}`,source_id:'SYN-SOURCE',
    permission_ref:'SYN-PERM',supersedes:i?'SYN-R1':null,status:'ACTIVE',change_kind:i?'EXTENDED':'NEW',
    fetched_at:at,last_checked_at:at,last_verified_at:at,published_at:null,valid_from:null,valid_until:null,
    source_class:'SYNTHETIC',provenance:'SYNTHETIC',media_kind:'TEXT',content_sha256:(i?'b':'a').repeat(64),
    original_sha256:'c'.repeat(64),stored_original_sha256:'c'.repeat(64),review_original_sha256:'c'.repeat(64),
    review_content_sha256:(i?'b':'a').repeat(64),review_decision:'APPROVED',reviewer_id:'SYN-REVIEWER',review_checked_at:at,
    scope_campuses:null,scope_majors:null,scope_colleges:null,scope_major_roles:null,scope_admission_types:null,
    scope_enrollment_states:null,scope_graduation_terms:null,cohort_min:null,cohort_max:null}));
  const approvals=revisions.map((r,i)=>{
    const payload={claims:[{field:'DEADLINE',value:{kind:'FIXED',at:i?'2026-11-25T00:00:00Z':'2026-11-20T00:00:00Z'},evidenceRefs:[`SYN-E${i}`]}],
      evidence:[{evidenceRef:`SYN-E${i}`,span:{kind:'TEXT',sourceRevisionId:r.revision_id,paragraphId:'SYN-P',startCodePoint:0,endCodePoint:5,quote:'마감 안내'}}]};
    return {approval_id:`SYN-A${i}`,actor_id:scope.actorId,opportunity_id:scope.opportunityId,
      revision_id:r.revision_id,source_id:r.source_id,permission_ref:r.permission_ref,
      content_sha256:r.content_sha256,payload_json:payload,payload_sha256:canonicalProjectionHash(payload),
      reviewed_by:'SYN-INDEPENDENT',reviewed_at:r.fetched_at,starts_at:r.fetched_at,expires_at:'2026-12-01T00:00:00.000Z',
      consent_version:'1',revoked_at:null};
  });
  const pool:ReviewerSqlPool={connect:async()=>({query:async(sql,params)=>{
    calls.push(sql);
    if(sql.includes('FROM api_self_consents'))return {rows:consent?[{version:'1',choices_json:{personalStorage:true},updated_at:beforeAt}]:[]};
    if(sql.includes('FROM source_ingest_heads'))return {rows:[{revision_id:head,status:'ACTIVE',change_kind:'NEW',asof_revision_id:head}]};
    if(sql.includes('FROM source_effective_revisions_vnext'))return {rows:revisions};
    if(sql.includes('FROM api_opportunity_revision_claim_approvals'))return {rows:approvals};
    if(sql.includes('FROM source_rights_receipts'))return {rows:[right]};
    if(sql.includes('FROM api_reviewed_revision_image_evidence'))return {rows:images};
    if(sql.includes('FROM source_paragraphs_vnext'))return {rows:[{revision_id:params?.[0],paragraph_id:'SYN-P',paragraph_text:'마감 안내'}]};
    if(sql.includes('clock_timestamp() AS database_now'))return {rows:[{database_now:now}]};
    return {rows:[]};
  },release:()=>{}})};
  const adapter=new PostgresApprovedRevisionClaims(pool,{resolve:async()=>authority?{
    permissionRefs:new Set(['SYN-PERM']),sourceIds:new Set(['SYN-SOURCE']),policyVersion:'SYN-POLICY'}:null},()=>now);
  const compare=()=>compareOpportunityRevisions({actorId:scope.actorId,opportunityId:scope.opportunityId,
    request:{beforeRevisionId:scope.beforeRevisionId,afterRevisionId:scope.afterRevisionId,asOf:now},source:adapter.source,rights:adapter.rights,now:()=>now});
  return {adapter,compare,calls,revisions,approvals,images,right,setConsent:(v:boolean)=>{consent=v;},
    setAuthority:(v:boolean)=>{authority=v;},setHead:(v:string)=>{head=v;},
    rehash:(i:number)=>{approvals[i]!.payload_sha256=canonicalProjectionHash(approvals[i]!.payload_json);}};
}
describe('durable independently approved revision claims',()=>{
  it('compares the exact approved source versions without disclosing private evidence',async()=>{
    const h=fixture(),result=await h.compare();
    expect(result).toMatchObject({state:'READY',changes:[{field:'DEADLINE',kind:'EXTENDED'}],after:{revisionId:'SYN-R2',capturedAt:afterAt,verifiedAt:afterAt}});
    expect(JSON.stringify(result)).not.toContain('마감 안내');
    expect(JSON.stringify(result)).not.toContain('reviewed_by');
  });
  it('does not load claims before current actor authority and consent',async()=>{
    for(const deny of [(h:ReturnType<typeof fixture>)=>h.setAuthority(false),(h:ReturnType<typeof fixture>)=>h.setConsent(false)]){
      const h=fixture();deny(h);await expect(h.compare()).rejects.toThrow();
      expect(h.calls.some(sql=>sql.includes('FROM api_opportunity_revision_claim_approvals'))).toBe(false);
    }
  });
  it('rejects modified values, mismatched exact text, actor binding and source approvals',async()=>{
    for(const mutate of [
      (h:ReturnType<typeof fixture>)=>{h.approvals[1]!.payload_json.claims[0]!.value.at='2026-11-30T00:00:00Z';},
      (h:ReturnType<typeof fixture>)=>{h.approvals[1]!.payload_json.evidence[0]!.span.quote='다른 안내';h.rehash(1);},
      (h:ReturnType<typeof fixture>)=>{h.approvals[1]!.actor_id='SYN-OTHER';},
      (h:ReturnType<typeof fixture>)=>{h.revisions[1]!.review_original_sha256='d'.repeat(64);},
      (h:ReturnType<typeof fixture>)=>{h.approvals[1]!.reviewed_by=scope.actorId;},
      (h:ReturnType<typeof fixture>)=>{h.approvals[1]!.consent_version='0';},
    ]){const h=fixture();mutate(h);await expect(h.compare()).rejects.toThrow();}
  });
  it('does not resurrect an earlier approval after a new unreviewed source head',async()=>{
    const h=fixture();h.setHead('SYN-R3');await expect(h.compare()).rejects.toThrow();
  });
  it('rechecks current consent and consumes source receipts once',async()=>{
    const h=fixture(),pair=await h.adapter.source.inspect({...scope,now}) as {receipt:string};
    h.setConsent(false);
    expect(await h.adapter.source.revalidate({...scope,receipt:pair.receipt,now})).toBe(false);
    h.setConsent(true);
    expect(await h.adapter.source.revalidate({...scope,receipt:pair.receipt,now})).toBe(false);
  });
  it('keeps unknown/pending/cancelled revisions incomplete instead of inventing approved values',async()=>{
    const pending=fixture();pending.approvals.pop();pending.revisions[1]!.status='NEEDS_REVIEW';
    expect(await pending.compare()).toMatchObject({state:'NEEDS_REVIEW',reason:'REVISION_NOT_REVIEWED'});
    const unknown=fixture();unknown.approvals.pop();unknown.revisions[1]!.change_kind='UNKNOWN';
    expect(await unknown.compare()).toMatchObject({state:'NEEDS_REVIEW',reason:'REVISION_UNKNOWN'});
    const cancelled=fixture();cancelled.revisions[1]!.change_kind='CANCELLED';cancelled.revisions[1]!.status='RETRACTED';
    expect(await cancelled.compare()).toMatchObject({state:'NEEDS_REVIEW',reason:'REVISION_CONFLICT'});
  });
  it('denies a changed disclosure value even when the source receipt is valid',async()=>{
    const h=fixture(),pair=await h.adapter.source.inspect({...scope,now}) as {receipt:string;sourceId:string;before:Record<string,unknown>;after:Record<string,unknown>};
    const revisions=[pair.before,pair.after].map(r=>({...r,evidenceRefs:['SYN-E0']}));
    const result=await h.adapter.rights.authorize({...scope,now,sourceId:pair.sourceId,sourceReceipt:pair.receipt,
      revisions:revisions as never});
    expect(result.allowed).toBe(false);
  });
  it('invalidates tickets after current rights revocation',async()=>{
    const h=fixture(),pair=await h.adapter.source.inspect({...scope,now}) as {receipt:string};
    h.right.revoked_at=now;
    expect(await h.adapter.source.revalidate({...scope,now,receipt:pair.receipt})).toBe(false);
  });
  it('checks exact current source rights before loading private field claims',async()=>{
    const h=fixture();h.right.revoked_at=now;await expect(h.compare()).rejects.toThrow();
    expect(h.calls.some(sql=>sql.includes('FROM api_opportunity_revision_claim_approvals'))).toBe(false);
  });
  it('validates independently reviewed IMAGE line text, original hash, page and geometry',async()=>{
    const make=()=>{
      const h=fixture(),r=h.revisions[1]!,p=h.approvals[1]!;
      r.media_kind='IMAGE';
      const span={kind:'IMAGE',sourceRevisionId:r.revision_id,assetId:'SYN-IMAGE',originalSha256:'c'.repeat(64),
        pageIndex:0,bboxNorm:[0,0,1,1],ocrLineIds:['SYN-LINE'],quote:'마감 안내',extractionEngine:'HUMAN',transformVersion:'SYN-TRANSFORM'};
      // The SQL driver returns unknown JSON; IMAGE and TEXT manifests share
      // the same independently approved payload boundary.
      (p.payload_json.evidence[0] as unknown as {span:unknown}).span=span;h.rehash(1);
      const payload={assetId:'SYN-IMAGE',originalSha256:'c'.repeat(64),transformVersion:'SYN-TRANSFORM',pageCount:1,width:100,height:100,
        ocrLines:[{id:'SYN-LINE',text:'마감 안내',pageIndex:0,bboxNorm:[0.1,0.1,0.9,0.9]}]};
      h.images.push({evidence_id:'SYN-IMAGE-EVIDENCE',revision_id:r.revision_id,payload_json:payload,
        payload_sha256:canonicalProjectionHash(payload),reviewed_by:'SYN-IMAGE-REVIEWER',reviewed_at:afterAt,
        review_ref:'SYN-PIXEL-REVIEW',revoked_at:null});
      return {h,span,payload};
    };
    expect(await make().h.compare()).toMatchObject({state:'READY'});
    for(const mutate of [
      (v:ReturnType<typeof make>)=>{v.payload.ocrLines[0]!.text='다른 안내';},
      (v:ReturnType<typeof make>)=>{v.payload.ocrLines[0]!.pageIndex=1;},
      (v:ReturnType<typeof make>)=>{v.payload.ocrLines.push({...v.payload.ocrLines[0]!,text:'다른 마감 안내'});},
      (v:ReturnType<typeof make>)=>{v.payload.ocrLines.push({...v.payload.ocrLines[0]!,bboxNorm:[0.2,0.2,0.8,0.8]});},
      (v:ReturnType<typeof make>)=>{v.payload.ocrLines.push({...v.payload.ocrLines[0]!});},
      (v:ReturnType<typeof make>)=>{v.span.bboxNorm=[0.2,0.2,0.8,0.8];v.h.rehash(1);},
      (v:ReturnType<typeof make>)=>{v.payload.originalSha256='d'.repeat(64);},
      (v:ReturnType<typeof make>)=>{v.h.images[0]!.reviewed_by=scope.actorId;},
      (v:ReturnType<typeof make>)=>{v.h.images[0]!.revoked_at=now;},
      (v:ReturnType<typeof make>)=>{v.h.images[0]!.reviewed_at='2026-11-02T12:00:00.000Z';},
      (v:ReturnType<typeof make>)=>{v.h.revisions[1]!.media_kind='TEXT';},
    ]){const v=make();mutate(v);v.h.images[0]!.payload_sha256=canonicalProjectionHash(v.payload);
      await expect(v.h.compare()).rejects.toThrow();}
  });
});
