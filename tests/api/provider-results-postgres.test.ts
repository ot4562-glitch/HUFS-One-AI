import {describe,expect,it,vi} from 'vitest';
import {PostgresProviderResults,ProviderResultError} from '../../apps/api/src/modules/ai/provider-results-postgres.js';
import type {ProviderStoredResult} from '../../apps/api/src/modules/ai/provider-results-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

function value():ProviderStoredResult{return {jobId:'00000000-0000-4000-8000-000000000001',actorId:'SYN-ACTOR',sessionIdHash:'SYN-SESSION',
  inputRef:'SYN-INPUT',operation:'HCX_007',asOf:'2026-11-03T10:00:00.000Z',phaseId:'SYN-PHASE',idempotencyKey:'SYN-KEY',
  requestSha256:'a'.repeat(64),inputEpoch:'input-'+'b'.repeat(64),expiresAt:'2026-11-03T10:20:00.000Z',candidate:{reviewState:'NEEDS_REVIEW',citations:[]}};}
function db(){
  const state={stored:true,result:value() as unknown,fail:false,pruned:2};
  const query=vi.fn(async(sql:string,_params?:readonly unknown[])=>{
    if(state.fail)throw Error('private SQL payload');
    if(sql.includes('ai_provider_result_put'))return {rows:[{stored:state.stored}]};
    if(sql.includes('ai_provider_result_get'))return {rows:[{value:structuredClone(state.result)}]};
    if(sql.includes('ai_provider_results_prune'))return {rows:[{pruned:state.pruned}]};
    return {rows:[]};
  });
  const release=vi.fn(),pool:ReviewerSqlPool={connect:vi.fn(async()=>({query,release}))};
  return {state,query,release,pool,store:new PostgresProviderResults(pool)};
}
describe('durable provider result SQL adapter — synthetic records',()=>{
  it('writes only through the execute-only put protocol with transaction-local actor/session binding',async()=>{
    const d=db(),v=value();await d.store.put(v);
    expect(d.query).toHaveBeenCalledWith("SELECT set_config('app.actor_id',$1,true),set_config('app.session_hash',$2,true)",[v.actorId,v.sessionIdHash]);
    const call=d.query.mock.calls.find(([sql])=>sql.includes('ai_provider_result_put'))!;
    expect(JSON.parse(String(call[1]![0]))).toEqual(v);
    expect(d.query).toHaveBeenCalledWith('COMMIT');expect(d.release).toHaveBeenCalledOnce();
    expect(d.query.mock.calls.every(([sql])=>!/^\s*(INSERT|UPDATE|DELETE)/i.test(sql))).toBe(true);
  });
  it('reads and validates the exact persisted record shape',async()=>{
    const d=db(),v=value();expect(await d.store.get(v.actorId,v.sessionIdHash,v.jobId)).toEqual(v);
    expect(d.query).toHaveBeenCalledWith('SELECT public.ai_provider_result_get($1::uuid) AS value',[v.jobId]);
  });
  it('returns null for no currently authorized result',async()=>{const d=db();d.state.result=null;const v=value();expect(await d.store.get(v.actorId,v.sessionIdHash,v.jobId)).toBeNull();});
  it.each(['actorId','sessionIdHash','jobId'] as const)('rejects SQL result with mismatched %s',async field=>{
    const d=db(),v=value();d.state.result={...v,[field]:field==='jobId'?'00000000-0000-4000-8000-000000000002':'OTHER'};
    await expect(d.store.get(v.actorId,v.sessionIdHash,v.jobId)).rejects.toThrow(ProviderResultError);
  });
  it.each(['jobId','actorId','inputEpoch','requestSha256','asOf','operation','candidate','oversized','extra'] as const)('rejects invalid %s before connecting',async kind=>{
    const d=db(),v:any=value();
    if(kind==='jobId')v.jobId='not-uuid';if(kind==='actorId')v.actorId='invalid actor';if(kind==='inputEpoch')v.inputEpoch='caller-epoch';
    if(kind==='requestSha256')v.requestSha256='fake';if(kind==='asOf')v.asOf='tomorrow';if(kind==='operation')v.operation='OTHER';
    if(kind==='candidate')v.candidate={reviewState:'VERIFIED'};if(kind==='oversized')v.candidate={reviewState:'NEEDS_REVIEW',text:'x'.repeat(2*1024*1024)};
    if(kind==='extra')v.untrusted='extra';
    await expect(d.store.put(v)).rejects.toThrow(ProviderResultError);expect(d.pool.connect).not.toHaveBeenCalled();
  });
  it('rejects failed/conflicting SQL writes without overwriting or retrying',async()=>{const d=db();d.state.stored=false;await expect(d.store.put(value())).rejects.toThrow(ProviderResultError);expect(d.query).toHaveBeenCalledWith('ROLLBACK');});
  it('sanitizes DB failure and releases the connection',async()=>{const d=db();d.state.fail=true;await expect(d.store.put(value())).rejects.toThrow('Provider result unavailable');expect(d.release).toHaveBeenCalledOnce();});
  it('explicitly prunes a bounded batch, without activating a schedule',async()=>{const d=db();expect(await d.store.pruneExpired(50)).toBe(2);expect(d.query).toHaveBeenCalledWith('SELECT public.ai_provider_results_prune($1) AS pruned',[50]);});
  it.each([0,-1,1001,1.5])('rejects unbounded prune %s',async limit=>{const d=db();await expect(d.store.pruneExpired(limit)).rejects.toThrow(ProviderResultError);expect(d.pool.connect).not.toHaveBeenCalled();});
});
