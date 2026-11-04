import {describe,expect,it,vi} from 'vitest';
import {PostgresApprovedSourceRightsResolver,PostgresEvidenceRightsResolver} from
  '../../apps/api/src/modules/opportunities/rights-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const NOW='2026-11-01T00:00:00.000Z';
const actor={actorId:'SYN-ACTOR',role:'BETA' as const,sessionIdHash:'H'.repeat(30),
  csrfToken:'C'.repeat(32),sessionExpiresAt:'2026-11-02T00:00:00Z',
  schoolMailProofExpiresAt:'2026-11-02T00:00:00Z',betaAllowed:true};
const receipt=()=>({receipt_id:'SYN-R1',actor_id:actor.actorId,source_id:'SYN-S1',
  permission_ref:'SYN-P1',canonical_url:'https://example.org/synthetic',
  purposes:['COLLECT','STORE','SEARCH'],reviewed_by:'SYN-REVIEWER',
  reviewed_at:'2026-10-30T00:00:00Z',starts_at:'2026-10-31T00:00:00Z',
  expires_at:'2026-11-02T00:00:00Z',policy_version:'v1',revoked_at:null,
  database_now:NOW});
const academic=()=>({scope_receipt_id:'SYN-SCOPE1',actor_id:actor.actorId,
  scope_json:{campus:'SEOUL',majors:[{code:'ECONOMICS',role:'PRIMARY'}],cohort:2023},
  reviewed_by:'SYN-ACADEMIC-REVIEWER',reviewed_at:'2026-10-30T00:00:00Z',
  starts_at:'2026-10-31T00:00:00Z',expires_at:'2026-11-02T00:00:00Z',
  scope_version:'scope-v1',revoked_at:null,database_now:NOW});
const head=()=>({source_id:'SYN-S1',revision_id:'SYN-REV1',permission_ref:'SYN-P1',
  status:'ACTIVE',last_verified_at:'2026-10-31T00:00:00Z',
  fetched_at:'2026-10-30T00:00:00Z',content_sha256:'a'.repeat(64)});
function db(options:{grants?:Record<string,unknown>[];scope?:Record<string,unknown>[];
  heads?:Record<string,unknown>[];pairs?:Record<string,unknown>[];fail?:boolean}={}){
  const calls:Array<{sql:string;params:readonly unknown[]}>=[];
  const release=vi.fn();
  const pool:ReviewerSqlPool={connect:async()=>({release,query:async(sql,params=[])=>{
    calls.push({sql,params});if(options.fail)throw new Error('private SQL detail');
    if(sql.includes('FROM source_rights_receipts'))return {rows:options.grants??[receipt()]};
    if(sql.includes('FROM source_actor_scope_receipts'))return {rows:options.scope??[academic()]};
    if(sql.includes('JOIN source_effective_revisions_vnext'))return {rows:options.heads??[head()]};
    if(sql.includes('SELECT DISTINCT source_id,permission_ref'))return {rows:options.pairs??[{source_id:'SYN-S1',permission_ref:'SYN-P1'}]};
    return {rows:[]};
  }})};
  return {pool,calls,release};
}
describe('persisted exact-actor source rights and independent academic scope',()=>{
  it('resolves real persisted purpose rights without inventing EXTERNAL_TRANSFER',async()=>{
    const x=db();const r=new PostgresApprovedSourceRightsResolver(x.pool,{actorId:actor.actorId,now:()=>NOW});
    const g=await r.resolve({sourceId:'SYN-S1',permissionRef:'SYN-P1',now:NOW});
    expect(g?.status).toBe('APPROVED');expect(g?.canonicalUrl).toBe('https://example.org/synthetic');
    expect([...g!.allowedPurposes]).toEqual(['COLLECT','STORE','SEARCH']);
    expect(g?.allowedPurposes.has('EXTERNAL_TRANSFER')).toBe(false);
    expect(x.calls.some(c=>c.params.includes(actor.actorId))).toBe(true);
    expect(x.release).toHaveBeenCalledOnce();
  });
  it.each([
    ['other actor',{actor_id:'OTHER'}],['other source',{source_id:'OTHER'}],
    ['other permission',{permission_ref:'OTHER'}],['self approval',{reviewed_by:actor.actorId}],
    ['future approval',{reviewed_at:'2026-11-03T00:00:00Z'}],
    ['expired',{expires_at:NOW}],['not yet valid',{starts_at:'2026-11-03T00:00:00Z'}],
    ['revoked',{revoked_at:NOW}],['noncanonical URL',{canonical_url:'https://example.org:8443/source'}],
    ['unrecognized purpose',{purposes:['ADMIN']}],
    ['DB clock passed expiry',{database_now:'2026-11-03T00:00:00Z'}],
  ])('denies %s even if a malformed SQL adapter returns it',async(_label,patch)=>{
    const x=db({grants:[{...receipt(),...patch}]});
    const r=new PostgresApprovedSourceRightsResolver(x.pool,{actorId:actor.actorId,now:()=>NOW});
    expect(await r.resolve({sourceId:'SYN-S1',permissionRef:'SYN-P1',now:NOW})).toBeNull();
  });
  it('denies future supplied time and expiry crossed on fresh server time',async()=>{
    const x=db();const r=new PostgresApprovedSourceRightsResolver(x.pool,{actorId:actor.actorId,now:()=>NOW});
    expect(await r.resolve({sourceId:'SYN-S1',permissionRef:'SYN-P1',now:'2026-11-03T00:00:00Z'})).toBeNull();
    const late=new PostgresApprovedSourceRightsResolver(x.pool,{actorId:actor.actorId,now:()=>'2026-11-03T00:00:00Z'});
    expect(await late.resolve({sourceId:'SYN-S1',permissionRef:'SYN-P1',now:NOW})).toBeNull();
  });
  it('does not derive BETA/ADMIN or owner scope from the browser',async()=>{
    const x=db();const r=new PostgresEvidenceRightsResolver(x.pool,{now:()=>NOW});
    expect(await r.resolveFor({actor:{...actor,role:'REVIEWER'} as unknown as typeof actor,now:NOW})).toBeNull();
    expect(await r.resolveFor({actor:{...actor,betaAllowed:false},now:NOW})).toBeNull();
    expect(x.calls).toHaveLength(0);
  });
  it('returns independently approved actor facts and snapshots exact source grant/head versions',async()=>{
    const x=db();const r=new PostgresEvidenceRightsResolver(x.pool,{now:()=>NOW});
    const g=await r.resolveFor({actor,now:NOW});
    expect([...g!.permissionRefs]).toEqual(['SYN-P1']);expect([...g!.sourceIds!]).toEqual(['SYN-S1']);
    expect(g?.campus).toBe('SEOUL');expect(g?.majors).toEqual([{code:'ECONOMICS',role:'PRIMARY'}]);
    expect(g?.sourceHeadVersion).toMatch(/^heads-[a-f0-9]{64}$/);
    expect(g?.policyVersion).toMatch(/^rights-[a-f0-9]{64}$/);
    expect(x.calls[0]?.sql).toContain('REPEATABLE READ READ ONLY');
    expect(x.calls.at(-1)?.sql).toBe('COMMIT');expect(x.release).toHaveBeenCalledOnce();
  });
  it('does not convert COLLECT+STORE rights into SEARCH authority',async()=>{
    const x=db({grants:[{...receipt(),purposes:['COLLECT','STORE']}]});
    expect(await new PostgresEvidenceRightsResolver(x.pool,{now:()=>NOW}).resolveFor({actor,now:NOW})).toBeNull();
  });
  it('drops expired or revoked actor facts without falling back to old academic scope',async()=>{
    const x=db({scope:[{...academic(),revoked_at:NOW}]});
    const g=await new PostgresEvidenceRightsResolver(x.pool,{now:()=>NOW}).resolveFor({actor,now:NOW});
    expect(g?.campus).toBeUndefined();expect(g?.majors).toBeUndefined();
    expect([...g!.sourceIds!]).toEqual(['SYN-S1']);
  });
  it('rejects malformed or self-approved scope instead of accepting unrestricted facts',async()=>{
    const x=db({scope:[{...academic(),scope_json:{campus:'SEOUL',forged:'anything'}}]});
    expect(await new PostgresEvidenceRightsResolver(x.pool,{now:()=>NOW}).resolveFor({actor,now:NOW})).toBeNull();
  });
  it('cannot authorize a cross-product source/permission pair through another source grant',async()=>{
    const grants=[receipt(),{...receipt(),receipt_id:'SYN-R2',source_id:'SYN-S2',permission_ref:'SYN-P2'}];
    const heads=[head(),{...head(),source_id:'SYN-S2',revision_id:'SYN-REV2',permission_ref:'SYN-P2'}];
    const x=db({grants,heads,pairs:[{source_id:'SYN-S1',permission_ref:'SYN-P1'},
      {source_id:'SYN-S1',permission_ref:'SYN-P2'},{source_id:'SYN-S2',permission_ref:'SYN-P2'}]});
    const g=await new PostgresEvidenceRightsResolver(x.pool,{now:()=>NOW}).resolveFor({actor,now:NOW});
    expect([...g!.sourceIds!]).toEqual(['SYN-S2']);
  });
  it('loads optional degree path, track and curriculum facts without changing legacy receipts',async()=>{
    for(const degreePath of ['ADVANCED_SINGLE','UNSELECTED']){
      const scope={...academic(),scope_json:{...academic().scope_json,degreePath,track:'SYN-TRACK',curriculumVersion:'SYN-CUR'}};
      const g=await new PostgresEvidenceRightsResolver(db({scope:[scope]}).pool,{now:()=>NOW}).resolveFor({actor,now:NOW});
      expect(g).toMatchObject({degreePath,track:'SYN-TRACK',curriculumVersion:'SYN-CUR'});
    }
  });
  it('refuses unrecognized degree paths in persisted scope rather than silently dropping them',async()=>{
    const scope={...academic(),scope_json:{...academic().scope_json,degreePath:'UNVERIFIED_PATH'}};
    expect(await new PostgresEvidenceRightsResolver(db({scope:[scope]}).pool,{now:()=>NOW}).resolveFor({actor,now:NOW})).toBeNull();
  });
  it('rotates fingerprints when a source correction or independent attestation changes',async()=>{
    const x=db(),y=db({heads:[{...head(),revision_id:'SYN-REV2'}]}),z=db({heads:[{...head(),last_verified_at:NOW}]});
    const results=await Promise.all([x,y,z].map(d=>new PostgresEvidenceRightsResolver(d.pool,{now:()=>NOW}).resolveFor({actor,now:NOW})));
    expect(new Set(results.map(g=>g!.sourceHeadVersion)).size).toBe(3);
  });
  it('never caches a revoked purpose grant across successive resolves',async()=>{
    const grants=[receipt()],x=db({grants});const r=new PostgresEvidenceRightsResolver(x.pool,{now:()=>NOW});
    const first=await r.resolveFor({actor,now:NOW});grants[0]!.revoked_at=NOW as unknown as null;
    expect(await r.resolveFor({actor,now:NOW})).toBeNull();expect([...first!.permissionRefs]).toEqual(['SYN-P1']);
  });
  it('sanitizes SQL failures and releases its connection',async()=>{
    const x=db({fail:true});await expect(new PostgresEvidenceRightsResolver(x.pool,{now:()=>NOW}).resolveFor({actor,now:NOW}))
      .rejects.toThrow('Source rights unavailable');expect(x.release).toHaveBeenCalledOnce();
  });
});
