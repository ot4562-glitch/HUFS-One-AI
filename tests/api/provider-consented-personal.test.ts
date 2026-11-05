import {describe,expect,it,vi} from 'vitest';
import {SafeLlmPacketSchema,ProviderInputClassSchema} from '@hufs-one/contracts';
import {PostgresProviderAuthority} from '../../apps/api/src/modules/ai/provider-authority-postgres.js';

const now='2026-11-05T00:00:00.000Z',before='2026-11-04T00:00:00.000Z',expires='2026-11-06T00:00:00.000Z';
const kind='PERSONAL_CONSENTED_CLEARED';
const actor={actorId:'SYN-OWNER',role:'BETA' as const,sessionIdHash:'S'.repeat(32),csrfToken:'C'.repeat(32),
  betaAllowed:true,sessionExpiresAt:expires,schoolMailProofExpiresAt:expires};
const packet={packetId:'OPAQUE-PACKET',task:'personal_action_brief',providerInputClass:kind,
  sourceTokens:[{token:'EXP1',paragraphs:[{id:'P1',text:'Synthetic owner describes a personally attributed project.'}]}],
  allowedTopicCodes:['DATA_ANALYTICS'],allowedObjectTokens:['EXP1'],approvedFacts:[],schemaVersion:'1',promptVersion:'1'};
function setup(){
  const source={sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERM',originalSha256:'a'.repeat(64)};
  const projection={projection_id:'SYN-PROJECTION',actor_id:actor.actorId,input_ref:'SYN-INPUT',operation:'HCX_007',
    as_of:now,epoch:'v1',policy_version:'input-policy-1',consent_version:'1',approved_by:'PROJECT-OWNER',
    approved_at:before,expires_at:expires,input_class:kind,privacy_review_ref:'OWNER-CONFIRMED-APPROVED',
    source_refs:[source],safe_packet:structuredClone(packet),erased_at:null,
    media_bytes:null,media_source_revision_id:null,media_asset_id:null,media_original_sha256:null};
  const consent={version:1,choices_json:{personalStorage:true,externalAi:true,teamReview:false,ncpStorage:true,presentation:false},updated_at:before};
  const rights={source_id:source.sourceId,revision_id:source.revisionId,permission_ref:source.permissionRef,
    original_sha256:source.originalSha256,content_sha256:'b'.repeat(64),source_class:'PERSONAL_CONSENTED',
    provenance:'REAL_APPROVED',status:'ACTIVE',change_kind:'NEW',fetched_at:before,last_verified_at:before,
    valid_from:null,valid_until:null,receipt_id:'SYN-RIGHTS',rights_actor_id:actor.actorId,
    reviewed_by:'PROJECT-OWNER',reviewed_at:before,starts_at:before,expires_at:expires,
    policy_version:'rights-v1',canonical_url:'https://example.test/synthetic-experience',
    purposes:['STORE','EXTERNAL_TRANSFER'],revoked_at:null as string|null};
  let commits=0;
  const state={projection,consent,rights,afterFirst:undefined as (()=>void)|undefined};
  const query=vi.fn(async(sql:string)=>{
    if(sql.includes('FROM api_self_consents'))return {rows:[structuredClone(consent)]};
    if(sql.includes('FROM api_ai_provider_input_heads'))return {rows:[structuredClone(projection)]};
    if(sql.includes('FROM source_ingest_heads'))return {rows:[structuredClone(rights)]};
    if(sql.includes('clock_timestamp() AS database_now'))return {rows:[{database_now:now}]};
    if(sql==='COMMIT'&&++commits===1)state.afterFirst?.();
    return {rows:[]};
  });
  const release=vi.fn(),pool={connect:vi.fn(async()=>({query,release}))};
  const authority=new PostgresProviderAuthority(pool,{policyVersion:'input-policy-1',now:()=>now,sessionIsCurrent:async()=>true});
  const request={actor,inputRef:'SYN-INPUT',operation:'HCX_007' as const,asOf:now,phaseId:'SYN-PHASE',idempotencyKey:'SYN-KEY',now};
  return {state,query,pool,release,authority,request};
}

describe('owner-confirmed use of consented personal information',()=>{
  it('represents the actual personal classification instead of calling the data anonymous or public',()=>{
    expect(ProviderInputClassSchema.safeParse(kind).success).toBe(true);
    expect(SafeLlmPacketSchema.parse(packet).providerInputClass).toBe(kind);
  });
  it('reads the currently consented owner projection under actor-bound SQL without changing its content',async()=>{
    const h=setup(),result=await h.authority.read(h.request);
    expect(result?.packet).toEqual(packet);
    expect(h.pool.connect).toHaveBeenCalledTimes(2);
    expect(h.query.mock.calls.every(([sql])=>!/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE)/.test(sql))).toBe(true);
  });
  it('refuses an unbound personal experience-skills packet even with project authorization',async()=>{
    const h=setup();h.state.projection.safe_packet.task='experience_skills';
    expect(await h.authority.read(h.request)).toBeNull();
  });
  it.each(['differentOwner','revokedSource','revokedConsent','staleVersion','unclassified','researchOnly'])('still refuses %s',async condition=>{
    const h=setup();
    if(condition==='differentOwner')h.state.rights.rights_actor_id='SYN-OTHER';
    if(condition==='revokedSource')h.state.rights.revoked_at=now;
    if(condition==='revokedConsent')h.state.consent.choices_json.externalAi=false;
    if(condition==='staleVersion')h.state.projection.consent_version='2';
    if(condition==='unclassified')h.state.projection.safe_packet.providerInputClass='PUBLIC_CLEARED';
    if(condition==='researchOnly')h.state.rights.source_class='RESEARCH_REFERENCE_ONLY';
    expect(await h.authority.read(h.request)).toBeNull();
  });
  it('observes a later individual revocation despite completed project authorization',async()=>{
    const h=setup();h.state.afterFirst=()=>{h.state.rights.revoked_at=now;};
    expect(await h.authority.read(h.request)).toBeNull();
  });
});
