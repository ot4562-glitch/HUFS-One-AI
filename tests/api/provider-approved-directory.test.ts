import {describe,expect,it,vi} from 'vitest';
import {PostgresApprovedProviderDirectory} from '../../apps/api/src/modules/ai/provider-approved-directory.js';
import {createPostgresProviderRuntime} from '../../apps/api/src/modules/ai/provider-postgres.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const now='2026-11-03T01:30:00.000Z',asOf='2026-11-03T01:00:00.000Z';
const expires='2026-11-04T01:30:00.000Z';
const actor:VerifiedActor={actorId:'SYN-OWNER',role:'BETA',
  sessionIdHash:'SYN-SESSION-HASH',csrfToken:'C'.repeat(32),betaAllowed:true,
  sessionExpiresAt:expires,schoolMailProofExpiresAt:expires};
function pool(rows:Record<string,unknown>[]){
  const calls:Array<{sql:string;params:unknown[]}>=[];let releases=0;
  const p:ReviewerSqlPool={connect:async()=>({
    release:()=>{releases++;},
    query:async(sql,params=[])=>{
      calls.push({sql,params:[...params]});
      return {rows:sql.includes('SELECT p.input_ref')?rows:[]};
    },
  })};
  return {p,calls,releases:()=>releases};
}
const row={input_ref:'SYN-INPUT',operation:'HCX_007',as_of:new Date(asOf)};
const snapshot={packet:{task:'opportunity_terms'},expiresAt:expires};
describe('bounded PG approved-input directory: actor RLS and full current authority',()=>{
  it('lists verified metadata only after full fresh authority recheck in bounded read transaction',async()=>{
    const db=pool([row]),read=vi.fn(async()=>snapshot as never);
    const index=new PostgresApprovedProviderDirectory(db.p,{read},'SYN-PHASE','HCX_007',()=>now);
    const result=await index.list(actor);
    expect(result).toEqual({items:[{inputRef:'SYN-INPUT',asOf,expiresAt:expires,
      operation:'HCX_007',task:'opportunity_terms'}]});
    expect(read).toHaveBeenCalledWith(expect.objectContaining({
      actor,inputRef:'SYN-INPUT',operation:'HCX_007',asOf,phaseId:'SYN-PHASE',
    }));
    const sql=db.calls.map(x=>x.sql).join('\n');
    expect(sql).toContain('READ ONLY');expect(sql).toContain('LIMIT 16');
    expect(sql).toContain("set_config('hufs.self_actor',$1,true)");
    expect(db.calls.find(x=>x.sql.includes('SELECT p.input_ref'))?.params).toEqual(['SYN-OWNER','HCX_007']);
    expect(db.calls.map(x=>x.sql)).not.toContain('SELECT *');
    expect(db.releases()).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/safe_packet|source_refs|actor_id|media_bytes|privacy_review_ref/);
  });
  it('drops withdrawn / unmatched approval without leaking a stale input',async()=>{
    const db=pool([row]);
    const index=new PostgresApprovedProviderDirectory(db.p,{read:async()=>null},'SYN-PHASE','HCX_007',()=>now);
    expect(await index.list(actor)).toEqual({items:[]});
    expect(db.releases()).toBe(1);
  });
  it('denies REVIEWER before any SQL and fails closed on malformed DB rows',async()=>{
    const db=pool([{...row,input_ref:'../etc/passwd'}]);
    const index=new PostgresApprovedProviderDirectory(db.p,{read:async()=>snapshot as never},
      'SYN-PHASE','HCX_007',()=>now);
    await expect(index.list({...actor,role:'REVIEWER',verifiedEmail:'r@example.invalid',
      identityProofExpiresAt:expires} as never)).rejects.toThrow();
    expect(db.calls).toEqual([]);
    await expect(index.list(actor)).rejects.toThrow('Unavailable');
    expect(db.releases()).toBe(1);
  });
  it('factory is fully default-OFF, no input enumeration, DB, keys or network by construction',async()=>{
    const connect=vi.fn(async()=>{throw Error('No database access allowed');});
    const secret=vi.fn(async()=>{throw Error('No credential read allowed');});
    const runtime=createPostgresProviderRuntime({
      pools:{authority:{connect},budget:{connect},results:{connect}},
      phaseId:'SYN-PHASE',operation:'HCX_007',inputPolicyVersion:'P1',
      sessionIsCurrent:async()=>true,secret,
      policy:{version:'P1',approvedBy:'SYN-OPERATOR',approvedAt:asOf,expiresAt:expires,
        inputUnitsPerToken:2,outputUnitsPerToken:3,tokenizerUnits:1,ocrImageUnits:10,
        maxInputTokens:3500,maxOutputTokens:800,framingTokens:0},
    });
    expect(await runtime.approvedInputs.list(actor)).toEqual({items:[]});
    expect(connect).not.toHaveBeenCalled();expect(secret).not.toHaveBeenCalled();
  });
});
