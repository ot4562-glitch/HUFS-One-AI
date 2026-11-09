import {describe,expect,it,vi} from 'vitest';
import {createPostgresOwnerRecommendations} from '../../apps/api/src/modules/opportunities/owner-recommendations-postgres.js';
import {canonicalProjectionHash} from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import {OWNER_FEED_AT as at,ownerOpportunity} from './owner-recommendations-fixture.js';

function fixture(){
  const actorId='SYN-OWNER',before='2026-11-03T23:00:00.000Z',expires='2026-12-01T00:00:00.000Z';
  const opportunities=[ownerOpportunity('SYN-A',['AI_ML']),ownerOpportunity('SYN-B',['TRADE_OVERSEAS'])];
  const state={consent:true,allowed:true,ownerAllowed:true,clock:at,profile:{version:'1',profile_json:{displayName:'PRIVATE-OWNER-NAME',
    interestTopics:['AI_ML'],desiredJobTopics:[]},updated_at:before},approvals:[] as Record<string,unknown>[],badSource:false};
  const grants={permissionRefs:new Set(['SYN-PERM']),policyVersion:'SYN-RIGHTS-1'};
  const query=vi.fn(async(sql:string,args:readonly unknown[]=[])=>{
    if(sql.includes('FROM api_self_consents'))return {rows:state.consent?[{version:'1',choices_json:{personalStorage:true},updated_at:before}]:[]};
    if(sql.includes('FROM api_owner_approved_projections'))return {rows:opportunities.filter(o=>args[2]===null||args[2]===o.id).map(o=>{
      const source={sourceId:'SYN-SOURCE-'+o.id,revisionId:o.sourceSnapshotId,permissionRef:'SYN-PERM'};
      const payload={opportunity:o,source:{...source,status:'SYNTHETIC'}};
      return {projection_id:'SYN-P-'+o.id,actor_id:args[0],kind:'OPPORTUNITY',entity_id:o.id,version:'SYN-V1',
        payload_json:payload,payload_sha256:canonicalProjectionHash(payload),sources_json:[source],reviewed_by:'SYN-INDEPENDENT',
        reviewed_at:before,as_of:before,starts_at:before,expires_at:expires};
    })};
    if(sql.includes('SELECT revision_id,published_at'))return {rows:opportunities.filter(o=>(args[0] as string[]).includes(o.sourceSnapshotId))
      .map(o=>({revision_id:o.sourceSnapshotId,published_at:before}))};
    if(sql.includes('FROM jsonb_to_recordset(')){
      const refs=JSON.parse(String(args[0])) as Array<{
        source_id:string;revision_id:string;permission_ref:string}>;
      return {rows:refs.map(ref=>({
        source_id:ref.source_id,revision_id:ref.revision_id,permission_ref:ref.permission_ref,
        status:state.badSource?'RETRACTED':'ACTIVE',change_kind:'NEW',
        source_class:'SYNTHETIC',provenance:'SYNTHETIC',
        original_sha256:'a'.repeat(64),stored_original_sha256:'a'.repeat(64),
        review_original_sha256:'a'.repeat(64),content_sha256:'b'.repeat(64),review_content_sha256:'b'.repeat(64),
        last_verified_at:before,fetched_at:before,review_checked_at:before,
        review_decision:'APPROVED',reviewer_id:'SYN-INDEPENDENT',
        rights_expires_at:expires,valid_from:null,valid_until:null,
      }))};
    }
    if(sql.includes('FROM api_self_profiles'))return {rows:[state.profile]};
    if(sql.includes('FROM api_experience_tag_approvals'))return {rows:state.approvals};
    return {rows:[]};
  });
  const pool={connect:vi.fn(async()=>({query,release:vi.fn()}))};
  const approval={isApproved:vi.fn(async()=>true)};
  const authority={resolve:async()=>state.allowed?grants:null};
  const make=()=>createPostgresOwnerRecommendations({pool,authority,approval,ownerAuthority:{mayRead:async()=>state.ownerAllowed},now:()=>state.clock});
  return {state,query,pool,approval,make,actorId,at,before};
}
describe('owner feed and #86 explanation from one current SQL snapshot',()=>{
  it('does not read any SQL or private projection after independent owner access is revoked',async()=>{
    const f=fixture();f.state.ownerAllowed=false;
    const ports=f.make();expect(await ports.ownerFeed.source.mayInspect({actorId:f.actorId,asOf:at,now:at})).toBe(false);
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it('reads current private inputs without construction IO and returns no private fields',async()=>{
    const f=fixture(),ports=f.make();expect(f.pool.connect).not.toHaveBeenCalled();
    const first=await ports.ownerFeed.source.inspect({actorId:f.actorId,asOf:at,now:at});
    expect(first.result.feed.featured.map(c=>c.opportunityId)).toEqual(['SYN-A']);
    expect(JSON.stringify(first.result)).not.toContain('PRIVATE-OWNER-NAME');
    expect(await ports.ownerFeed.source.revalidate({actorId:f.actorId,receipt:first.receipt,now:at})).toBe(true);
    const input={actorId:f.actorId,opportunityId:'SYN-B',sourceRevisionId:'SYN-REV-SYN-B',asOf:at,now:at,rankConfigVersion:'rank-v1.0'};
    expect(await ports.opportunityExplanation.rights.mayInspect(input)).toBe(true);
    const result=await ports.opportunityExplanation.source.inspect(input);
    expect(result.explanation).toMatchObject({state:'NOT_FEATURED',reason:'LOW_RELEVANCE'});
    expect(f.query.mock.calls.every(([sql])=>!/^\s*(INSERT|UPDATE|DELETE)/i.test(sql))).toBe(true);
  });
  it('invalidates old receipts and recomputes after current preferences change or source withdrawal',async()=>{
    const f=fixture(),ports=f.make(),input={actorId:f.actorId,asOf:at,now:at};
    const first=await ports.ownerFeed.source.inspect(input);
    f.state.profile={...f.state.profile,version:'2',profile_json:{...f.state.profile.profile_json,interestTopics:['TRADE_OVERSEAS']}};
    expect(await ports.ownerFeed.source.revalidate({actorId:f.actorId,receipt:first.receipt,now:at})).toBe(false);
    const second=await f.make().ownerFeed.source.inspect(input);
    expect(second.result.feed.featured.map(c=>c.opportunityId)).toEqual(['SYN-B']);
    expect(second.result.version).not.toBe(first.result.version);
    f.state.badSource=true;
    expect(await ports.ownerFeed.source.revalidate({actorId:f.actorId,receipt:first.receipt,now:at})).toBe(false);
  });
  it('never authorizes another actor, missing candidate, wrong revision or missing consent',async()=>{
    const f=fixture(),ports=f.make(),base={actorId:f.actorId,opportunityId:'SYN-A',sourceRevisionId:'SYN-REV-SYN-A',asOf:at,now:at,rankConfigVersion:'rank-v1.0'};
    const issued=await ports.ownerFeed.source.inspect({actorId:f.actorId,asOf:at,now:at});
    expect(await ports.ownerFeed.source.revalidate({actorId:'SYN-OTHER',receipt:issued.receipt,now:at})).toBe(false);
    expect(await ports.opportunityExplanation.rights.mayInspect({...base,opportunityId:'SYN-MISSING'})).toBe(false);
    expect(await ports.opportunityExplanation.rights.mayInspect({...base,sourceRevisionId:'SYN-WRONG'})).toBe(false);
    f.state.consent=false;
    expect(await ports.opportunityExplanation.rights.mayInspect(base)).toBe(false);
  });
  it('consumes only current explicit experience approvals and expires private receipts',async()=>{
    const f=fixture();f.state.profile.profile_json.interestTopics=[];
    f.state.approvals=[{actor_id:f.actorId,record_actor_id:f.actorId,experience_id:'SYN-EXPERIENCE',version:'1',
      content_version:'1',consent_version:'1',record_version:'1',state:'ACTIVE',provenance:'LOCAL_USER_SELECTION',
      topics:['TRADE_OVERSEAS'],record_kind:'EXPERIENCE',record_data_mode:'OWNER_CONSENTED',record_state:'DRAFT',
      record_deleted_at:null,approved_at:f.before,updated_at:f.before,record_updated_at:f.before}];
    const ports=f.make(),first=await ports.ownerFeed.source.inspect({actorId:f.actorId,asOf:at,now:at});
    expect(first.result.feed.featured.map(c=>c.opportunityId)).toEqual(['SYN-B']);
    f.state.approvals[0]!.record_version='2';
    expect(await ports.ownerFeed.source.revalidate({actorId:f.actorId,receipt:first.receipt,now:at})).toBe(false);
    const stale=await f.make().ownerFeed.source.inspect({actorId:f.actorId,asOf:at,now:at});
    expect(stale.result.feed.featured).toHaveLength(0);
    f.state.clock='2026-11-04T00:00:31.000Z';
    const before=f.pool.connect.mock.calls.length;
    expect(await ports.ownerFeed.source.revalidate({actorId:f.actorId,receipt:first.receipt,now:f.state.clock})).toBe(false);
    expect(f.pool.connect.mock.calls.length).toBe(before);
  });
});
