import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {PostgresProviderAuthority} from '../../apps/api/src/modules/ai/provider-authority-postgres.js';
import type {ProviderRequest} from '../../apps/api/src/modules/ai/provider-authority-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const NOW='2026-11-03T10:00:00.000Z',BEFORE='2026-11-03T09:00:00.000Z',EXPIRES='2026-11-03T11:00:00.000Z';
const actor={actorId:'SYN-ACTOR',role:'BETA' as const,sessionIdHash:'SYN-SESSION-HASH',csrfToken:'SYN-CSRF-TOKEN-123456',
  sessionExpiresAt:EXPIRES,schoolMailProofExpiresAt:EXPIRES,betaAllowed:true};
const req:ProviderRequest&{now:string}={actor,inputRef:'SYN-INPUT',operation:'HCX_007',asOf:NOW,phaseId:'SYN-PHASE',idempotencyKey:'SYN-KEY',now:NOW};
const source={sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERMISSION',originalSha256:'a'.repeat(64)};
const packet={packetId:'DOC-PACKET',task:'opportunity_terms',providerInputClass:'SYNTHETIC_CLEARED',
  sourceTokens:[{token:'DOC1',paragraphs:[{id:'p1',text:'가상 활동 공고'}]}],allowedTopicCodes:[],allowedObjectTokens:[],approvedFacts:[],schemaVersion:'1',promptVersion:'1'};
function projection():Record<string,unknown>{return {projection_id:'SYN-PROJECTION',actor_id:actor.actorId,input_ref:req.inputRef,operation:req.operation,
  as_of:NOW,epoch:'epoch-1',policy_version:'input-policy-1',consent_version:'3',approved_by:'SYN-REVIEWER',approved_at:BEFORE,expires_at:EXPIRES,
  input_class:'SYNTHETIC_CLEARED',privacy_review_ref:'SYN-PRIVACY-REVIEW',source_refs:[source],safe_packet:packet,
  media_bytes:null,media_source_revision_id:null,media_asset_id:null,media_original_sha256:null,erased_at:null};}
function rights():Record<string,unknown>{return {source_id:source.sourceId,revision_id:source.revisionId,permission_ref:source.permissionRef,
  original_sha256:source.originalSha256,content_sha256:'b'.repeat(64),source_class:'SYNTHETIC',provenance:'SYNTHETIC',status:'ACTIVE',change_kind:'NEW',
  fetched_at:BEFORE,last_verified_at:BEFORE,valid_from:null,valid_until:null,
  receipt_id:'SYN-RECEIPT',rights_actor_id:actor.actorId,reviewed_by:'SYN-RIGHTS-REVIEWER',reviewed_at:BEFORE,starts_at:BEFORE,expires_at:EXPIRES,
  policy_version:'rights-policy-1',canonical_url:'https://example.org/synthetic',purposes:['STORE','EXTERNAL_TRANSFER'],revoked_at:null};}
function db(){
  const state={projection:projection(),consent:{version:'3',choices_json:{personalStorage:true,externalAi:true,teamReview:false,ncpStorage:false,presentation:false},updated_at:BEFORE},
    rights:[rights()],clock:NOW,hide:false,fail:false,afterFirst:undefined as (()=>void)|undefined};
  const queries:Array<{sql:string;params:readonly unknown[]}>=[];let commits=0;
  const release=vi.fn(),query=vi.fn(async(sql:string,params:readonly unknown[]=[])=>{
    queries.push({sql,params});if(state.fail)throw Error('private raw database failure');
    if(sql.includes('FROM api_ai_provider_input_heads'))return {rows:state.hide?[]:[structuredClone(state.projection)]};
    if(sql.includes('FROM api_self_consents'))return {rows:[structuredClone(state.consent)]};
    if(sql.includes('FROM source_ingest_heads'))return {rows:structuredClone(state.rights)};
    if(sql.includes('clock_timestamp() AS database_now'))return {rows:[{database_now:state.clock}]};
    if(sql==='COMMIT'&&++commits===1)state.afterFirst?.();
    return {rows:[]};
  });
  const pool:ReviewerSqlPool={connect:vi.fn(async()=>({query,release}))};
  const sessionIsCurrent=vi.fn(async()=>true);
  const authority=new PostgresProviderAuthority(pool,{policyVersion:'input-policy-1',sessionIsCurrent,now:()=>state.clock});
  return {state,queries,release,query,pool,sessionIsCurrent,authority};
}

describe('Postgres provider input authority — synthetic SQL adapter tests',()=>{
  it('reads two fresh repeatable-read snapshots with actor-local RLS and no data writes',async()=>{
    const d=db(),result=await d.authority.read(req);
    expect(result).toMatchObject({actorId:actor.actorId,sessionIdHash:actor.sessionIdHash,inputRef:req.inputRef,operation:req.operation,
      asOf:NOW,consentVersion:'3',policyVersion:'input-policy-1',approvedBy:'SYN-REVIEWER',sources:[source],packet});
    expect(result?.epoch).toMatch(/^input-[a-f0-9]{64}$/);expect(result?.grantVersion).toMatch(/^rights-[a-f0-9]{64}$/);
    expect(d.pool.connect).toHaveBeenCalledTimes(2);expect(d.release).toHaveBeenCalledTimes(2);
    expect(d.queries.filter(q=>q.sql==='BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')).toHaveLength(2);
    expect(d.queries.filter(q=>q.sql.includes("set_config('hufs.self_actor',$1,true)")).every(q=>q.params[0]===actor.actorId)).toBe(true);
    expect(d.queries.every(q=>!/^\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE)/i.test(q.sql))).toBe(true);
    const receiptSql=d.queries.find(q=>q.sql.includes('FROM source_ingest_heads'))!.sql;
    expect(receiptSql).toContain('ORDER BY');expect(receiptSql).toContain('LIMIT 1');
    // Revocation/purpose filtering must occur after latest receipt selection.
    expect(receiptSql).not.toMatch(/WHERE[^)]*revoked_at\s+IS\s+NULL/i);
  });
  it.each(['hidden','selfApproved','policy','consentVersion','privacy','inputClass','packetClass','packetMissing','actor','operation','expiry','futureApproval','duplicateSources','erased'] as const)('denies projection %s',async kind=>{
    const d=db(),p=d.state.projection;
    if(kind==='hidden')d.state.hide=true;if(kind==='selfApproved')p.approved_by=actor.actorId;
    if(kind==='policy')p.policy_version='old';if(kind==='consentVersion')p.consent_version='2';
    if(kind==='privacy')p.privacy_review_ref=null;if(kind==='inputClass')p.input_class='UNCHECKED';
    if(kind==='packetClass')p.safe_packet={...packet,providerInputClass:'PUBLIC_CLEARED'};
    if(kind==='packetMissing')p.safe_packet=null;if(kind==='actor')p.actor_id='OTHER';
    if(kind==='erased')p.erased_at=NOW;
    if(kind==='operation')p.operation='OCR_GENERAL';if(kind==='expiry')p.expires_at=NOW;
    if(kind==='futureApproval')p.approved_at=EXPIRES;if(kind==='duplicateSources')p.source_refs=[source,source];
    expect(await d.authority.read(req)).toBeNull();
  });
  it.each(['externalAi','personalStorage','futureConsent','malformedConsent'] as const)('denies consent %s',async kind=>{
    const d=db();if(kind==='externalAi')d.state.consent.choices_json.externalAi=false;
    if(kind==='personalStorage')d.state.consent.choices_json.personalStorage=false;
    if(kind==='futureConsent')d.state.consent.updated_at=EXPIRES;
    if(kind==='malformedConsent')(d.state.consent.choices_json as any).externalAi='true';
    expect(await d.authority.read(req)).toBeNull();
  });
  it.each(['revoked','missingTransfer','missingStore','selfApproved','expired','futureReview','sourceMismatch','headChanged','hash','research','unreviewed','futureFetch','futureVerify','notYetValid','noLongerValid','missingSource','rightsActor'] as const)('denies source rights %s',async kind=>{
    const d=db(),r=d.state.rights[0]!;
    if(kind==='revoked')r.revoked_at=NOW;if(kind==='missingTransfer')r.purposes=['STORE'];if(kind==='missingStore')r.purposes=['EXTERNAL_TRANSFER'];
    if(kind==='selfApproved')r.reviewed_by=actor.actorId;if(kind==='expired')r.expires_at=NOW;if(kind==='futureReview')r.reviewed_at=EXPIRES;
    if(kind==='sourceMismatch')r.source_id='OTHER';if(kind==='headChanged')r.revision_id='NEW-REV';if(kind==='hash')r.original_sha256='c'.repeat(64);
    if(kind==='research')r.source_class='RESEARCH_REFERENCE_ONLY';if(kind==='unreviewed')r.status='NEEDS_REVIEW';
    if(kind==='futureFetch')r.fetched_at=EXPIRES;if(kind==='futureVerify')r.last_verified_at=EXPIRES;
    if(kind==='notYetValid')r.valid_from=EXPIRES;if(kind==='noLongerValid')r.valid_until=NOW;
    if(kind==='missingSource')d.state.rights=[];if(kind==='rightsActor')r.rights_actor_id='OTHER';
    expect(await d.authority.read(req)).toBeNull();
  });
  it.each(['consent','rights','head','projection','expiry'] as const)('rechecks %s after the first transaction awaits',async kind=>{
    const d=db();d.state.afterFirst=()=>{
      if(kind==='consent')d.state.consent.choices_json.externalAi=false;
      if(kind==='rights')d.state.rights[0]!.revoked_at=NOW;
      if(kind==='head')d.state.rights[0]!.revision_id='NEW';
      if(kind==='projection')d.state.projection.epoch='epoch-2';
      if(kind==='expiry')d.state.clock=EXPIRES;
    };
    expect(await d.authority.read(req)).toBeNull();
  });
  it('denies a session revoked while awaiting SQL',async()=>{const d=db();d.sessionIsCurrent.mockResolvedValueOnce(true).mockResolvedValue(false);expect(await d.authority.read(req)).toBeNull();});
  it('denies non-BETA roles and future asOf before connecting',async()=>{const d=db();expect(await d.authority.read({...req,asOf:EXPIRES})).toBeNull();expect(await d.authority.read({...req,actor:{...actor,role:'ADMIN'}})).toBeNull();expect(d.pool.connect).not.toHaveBeenCalled();});
  it('fingerprints a changed latest receipt and operator epoch, without volatile DB clock',async()=>{
    const d=db(),first=await d.authority.read(req);d.state.clock='2026-11-03T10:01:00.000Z';
    const same=await d.authority.read({...req,now:d.state.clock});expect(same?.epoch).toBe(first?.epoch);expect(same?.grantVersion).toBe(first?.grantVersion);
    d.state.rights[0]!.receipt_id='SYN-RECEIPT-2';const changed=await d.authority.read({...req,now:d.state.clock});expect(changed?.grantVersion).not.toBe(first?.grantVersion);
    d.state.projection.epoch='epoch-2';expect((await d.authority.read({...req,now:d.state.clock}))?.epoch).not.toBe(first?.epoch);
  });
  it('copies approved private media and verifies its SHA binding',async()=>{
    const d=db(),bytes=Buffer.from('synthetic-private-byte-fixture'),hash=createHash('sha256').update(bytes).digest('hex');
    Object.assign(d.state.projection,{operation:'OCR_GENERAL',safe_packet:null,source_refs:[{...source,originalSha256:hash}],
      media_bytes:bytes,media_source_revision_id:source.revisionId,media_asset_id:'SYN-ASSET',media_original_sha256:hash});
    d.state.rights[0]!.original_sha256=hash;
    const result=await d.authority.read({...req,operation:'OCR_GENERAL'});expect(result?.media?.bytes).toEqual(bytes);expect(result?.media?.bytes).not.toBe(bytes);
    d.state.projection.media_original_sha256='0'.repeat(64);expect(await d.authority.read({...req,operation:'OCR_GENERAL'})).toBeNull();
  });
  it('sanitizes SQL errors and releases connections',async()=>{
    const d=db();d.state.fail=true;await expect(d.authority.read(req)).rejects.toThrow('Provider authority unavailable');expect(d.release).toHaveBeenCalledOnce();
  });
});
