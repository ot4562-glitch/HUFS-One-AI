import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {opportunity} from '../../packages/core/src/feature-additions/v2.fixtures.js';
import {PostgresOwnerV2CatalogSource} from '../../apps/api/src/modules/owner-v2-catalog-source-postgres.js';
import type {PostgresApprovedOwnerReader,ApprovedOwnerProjection}
  from '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {ReviewerSqlConnection} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const NOW='2026-11-11T00:00:00Z';
const sha='b'.repeat(64);
const original=opportunity('SYN-OP',{sourceUrl:'https://example.org/notices/1'});
const projection=(item=original):ApprovedOwnerProjection=>({
  projection_id:'SYN-P-1',actor_id:'SYN-OWNER',kind:'V2_CATALOG',
  entity_id:item.id,version:'SYN-V-1',payload_json:item,
  payload_sha256:'a'.repeat(64),
  sources_json:[{sourceId:item.source.sourceId,revisionId:item.source.revisionId,
    permissionRef:'SYN-GRANT'}],
  reviewed_by:'SYN-REVIEWER',
  reviewed_at:NOW,as_of:NOW,
  starts_at:NOW,expires_at:'2026-11-12T00:00:00Z',
});
function fixture(options:{item?:typeof original;canonicalUrl?:string;revokeOnRecheck?:boolean;
  fingerprint?:string;entityId?:string;duplicateReceipt?:boolean;
  conflictingReceipt?:boolean;fingerprintOnRecheck?:string}={}){
  let calls=0;
  const rows=[{...projection(options.item??original),
    ...(options.entityId?{entity_id:options.entityId}:{})}];
  const query=vi.fn(async(sql:string,_params?:readonly unknown[])=>{
    if(options.duplicateReceipt||options.conflictingReceipt){
      // The real SQL must collapse only equal canonical URLs.
      expect(sql).toContain('GROUP BY r.source_id,r.permission_ref');
      expect(sql).toContain('HAVING COUNT(DISTINCT r.canonical_url)=1');
    }
    return {rows:options.conflictingReceipt?[]:[{
      source_id:original.source.sourceId,permission_ref:'SYN-GRANT',
      canonical_url:options.canonicalUrl??'https://example.org/notices/1',
    }]};
  });
  const sql={query,release:()=>{}} as unknown as ReviewerSqlConnection;
  const read=vi.fn(async(
    _input:{actorId:string;asOf:string;kind:'V2_CATALOG'},_now:string,
    extra:(connection:ReviewerSqlConnection,rows:readonly ApprovedOwnerProjection[])=>Promise<unknown>,
  )=>{
    calls++;
    if(options.revokeOnRecheck&&calls>1)return null;
    const proof=await extra(sql,rows);
    return {rows,consentVersion:'SYN-CONSENT',
      fingerprint:options.fingerprintOnRecheck&&calls>1
        ?options.fingerprintOnRecheck:options.fingerprint??sha,
      validUntil:'2026-11-11T00:01:00Z',extra:proof};
  });
  const reader={read} as unknown as PostgresApprovedOwnerReader;
  return {port:new PostgresOwnerV2CatalogSource(reader,()=>NOW),read,query};
}
describe('#447 pre-NCP approved owner V2 PostgreSQL adapter (synthetic only)',()=>{
  it('reads the already reviewed owner/source projection and revalidates it',async()=>{
    const f=fixture();
    const value=await f.port.read({actorId:'SYN-OWNER',asOf:NOW});
    expect(value?.items).toHaveLength(1);
    expect(value?.items[0]?.sourceUrl).toBe('https://example.org/notices/1');
    expect(value?.consentVersion).toBe('SYN-CONSENT');
    expect(value?.receipt.sourceVersion).toBe(sha);
    expect(value?.scopeKey).toBe(sha);
    expect(value?.receipt.expiresAt).toBe('2026-11-11T00:00:30.000Z');
    expect(await f.port.revalidate({actorId:'SYN-OWNER',receipt:value!.receipt,now:NOW})).toBe(true);
    expect(f.read).toHaveBeenCalledTimes(2);
    const call=f.read.mock.calls[0]!;
    expect(call[0]).toEqual({actorId:'SYN-OWNER',kind:'V2_CATALOG',asOf:NOW});
    const sql=String(f.query.mock.calls[0]?.[0]);
    expect(sql).toContain('source_rights_receipts');
    expect(sql).toContain('source_rights_revocations');
    expect(sql).toContain("'SEARCH'=ANY(r.purposes)");
  });

  it('accepts overlapping reviewed receipts only when the canonical URL agrees',async()=>{
    const f=fixture({duplicateReceipt:true});
    const result=await f.port.read({actorId:'SYN-OWNER',asOf:NOW});
    expect(result?.items).toHaveLength(1);
    expect(await f.port.revalidate({actorId:'SYN-OWNER',receipt:result!.receipt,now:NOW}))
      .toBe(true);
  });
  it('rejects conflicting canonical URLs for the same currently reviewed pair',async()=>{
    const f=fixture({conflictingReceipt:true});
    await expect(f.port.read({actorId:'SYN-OWNER',asOf:NOW}))
      .rejects.toThrow('Approved V2 catalog unavailable');
  });
  it('fails revalidation when authorized projection fingerprint changes',async()=>{
    const f=fixture({fingerprintOnRecheck:'c'.repeat(64)});
    const result=await f.port.read({actorId:'SYN-OWNER',asOf:NOW});
    expect(result).not.toBeNull();
    expect(await f.port.revalidate({actorId:'SYN-OWNER',receipt:result!.receipt,now:NOW}))
      .toBe(false);
  });
  it('does not reject a 129th independent actor from one shared ticket cap',async()=>{
    const sql={query:vi.fn(async()=>({rows:[{
      source_id:original.source.sourceId,permission_ref:'SYN-GRANT',
      canonical_url:'https://example.org/notices/1',
    }]})),release:()=>{}} as unknown as ReviewerSqlConnection;
    const read=vi.fn(async(input:{actorId:string;asOf:string;kind:'V2_CATALOG'},
      _now:string,extra:(connection:ReviewerSqlConnection,
        rows:readonly ApprovedOwnerProjection[])=>Promise<unknown>)=>{
      const rows=[{...projection(),actor_id:input.actorId}];
      const proof=await extra(sql,rows);
      return {rows,consentVersion:'SYN-CONSENT',
        fingerprint:createHash('sha256').update(input.actorId).digest('hex'),
        validUntil:'2026-11-11T00:01:00Z',extra:proof};
    });
    const port=new PostgresOwnerV2CatalogSource(
      {read} as unknown as PostgresApprovedOwnerReader,()=>NOW);
    let first:Awaited<ReturnType<typeof port.read>>|null=null;
    for(let i=0;i<130;i++){
      const actorId='SYN-OWNER-'+i;
      const result=await port.read({actorId,asOf:NOW});
      expect(result?.items).toHaveLength(1);
      if(i===0)first=result;
    }
    expect(first).not.toBeNull();
    expect(await port.revalidate({actorId:'SYN-OWNER-0',receipt:first!.receipt,now:NOW}))
      .toBe(true);
  });

  it('rejects a different canonical URL despite matching domain and permission',async()=>{
    const f=fixture({canonicalUrl:'https://example.org/notices/other'});
    await expect(f.port.read({actorId:'SYN-OWNER',asOf:NOW}))
      .rejects.toThrow(/Approved V2 catalog unavailable/);
  });

  it('rejects unreviewed, unpermitted and fabricated source proofs',async()=>{
    for(const bad of [
      opportunity('SYN-OP',{sourceUrl:'https://example.org/notices/1',permitted:false}),
      opportunity('SYN-OP',{source:{...original.source,status:'NEEDS_REVIEW'}}),
      opportunity('SYN-OP',{source:{...original.source,rights:'BLOCKED'}}),
      opportunity('SYN-OP',{source:{...original.source,sourceId:'SYN-OTHER'}}),
    ]){
      const f=fixture({item:bad});
      await expect(f.port.read({actorId:'SYN-OWNER',asOf:NOW})).rejects.toThrow();
    }
  });

  it('rejects projection entity ID tampering',async()=>{
    const f=fixture({entityId:'SYN-WRONG'});
    await expect(f.port.read({actorId:'SYN-OWNER',asOf:NOW})).rejects.toThrow();
  });

  it('fails closed on subsequent revocation, expired receipt or other actor',async()=>{
    const f=fixture({revokeOnRecheck:true});
    const value=await f.port.read({actorId:'SYN-OWNER',asOf:NOW});
    expect(value).not.toBeNull();
    expect(await f.port.revalidate({actorId:'SYN-OTHER',receipt:value!.receipt,now:NOW})).toBe(false);
    expect(await f.port.revalidate({actorId:'SYN-OWNER',receipt:value!.receipt,
      now:'2026-11-11T00:00:31Z'})).toBe(false);
    expect(await f.port.revalidate({actorId:'SYN-OWNER',receipt:value!.receipt,now:NOW})).toBe(false);
    expect(f.read).toHaveBeenCalledTimes(2);
  });

  it('requires an independent 64-character approved reader fingerprint',async()=>{
    const f=fixture({fingerprint:'bad'});
    await expect(f.port.read({actorId:'SYN-OWNER',asOf:NOW})).rejects.toThrow();
  });
});
