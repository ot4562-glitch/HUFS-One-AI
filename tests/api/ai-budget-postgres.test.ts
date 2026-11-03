import {describe,expect,it,vi} from 'vitest';
import {PostgresAiBudgetLedger,AiBudgetDenied} from '../../apps/api/src/modules/ai/budget-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
const actor='SYN-ACTOR',phase='SYN-PHASE',hash='a'.repeat(64),receipt='b'.repeat(64);
const id='00000000-0000-4000-8000-000000000001';
const input={phaseId:phase,task:'HCX_007' as const,idempotencyKey:'KEY-1',requestSha256:hash,worstCaseUnits:100};
const row={job_id:id,state:'RESERVED',worst_case_units:'100',charged_units:null,changed:true};
function fixture(result:Record<string,unknown>[]=[row],fail=false){
  const calls:{sql:string;params:readonly unknown[]}[]=[];
  const release=vi.fn();
  const pool:ReviewerSqlPool={connect:async()=>({release,query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes('public.ai_budget_')){if(fail)throw Error('secret database detail');return {rows:result};}
    return {rows:[]};
  }})};
  return {ledger:new PostgresAiBudgetLedger(pool),calls,release};
}
describe('durable AI billing adapter (no provider I/O)',()=>{
  it('binds actor with transaction-local setting and returns integer units',async()=>{
    const {ledger,calls,release}=fixture();
    expect(await ledger.reserve(actor,input)).toEqual({jobId:id,state:'RESERVED',worstCaseUnits:100,chargedUnits:null,changed:true});
    expect(calls[0]?.sql).toBe('BEGIN');
    expect(calls[1]?.params).toEqual([actor]);
    expect(calls[2]?.params).toEqual([phase,'HCX_007','KEY-1',hash,100]);
    expect(calls.at(-1)?.sql).toBe('COMMIT');expect(release).toHaveBeenCalledOnce();
  });
  it.each(['actor','phase','hash','units','key'] as const)('rejects invalid %s before connecting',async kind=>{
    const {ledger,calls}=fixture();
    await expect(ledger.reserve(kind==='actor'?'':actor,{...input,
      ...(kind==='phase'?{phaseId:''}:{}),...(kind==='hash'?{requestSha256:'raw payload'}:{}),
      ...(kind==='units'?{worstCaseUnits:0}:{}),...(kind==='key'?{idempotencyKey:''}:{})})).rejects.toBeInstanceOf(AiBudgetDenied);
    expect(calls).toHaveLength(0);
  });
  it('does not pretend replay gives another dispatch permit',async()=>{
    const {ledger}=fixture([{...row,changed:false}]);
    expect((await ledger.reserve(actor,input)).changed).toBe(false);
  });
  it('rolls back denied or invalid DB results and releases connection',async()=>{
    for(const rows of [[],[{...row,worst_case_units:'9007199254740992'}],[{...row,state:'INVALID'}]]){
      const {ledger,calls,release}=fixture(rows);
      await expect(ledger.reserve(actor,input)).rejects.toBeInstanceOf(AiBudgetDenied);
      expect(calls.at(-1)?.sql).toBe('ROLLBACK');expect(release).toHaveBeenCalledOnce();
    }
  });
  it('never returns raw database errors',async()=>{
    const {ledger,calls,release}=fixture([],true);
    await expect(ledger.reserve(actor,input)).rejects.toThrow('AI budget operation denied');
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');expect(release).toHaveBeenCalledOnce();
  });
  it('binds dispatch and unknown/release/verified settlement to actor + request hash',async()=>{
    for(const action of ['DISPATCHED','UNKNOWN_BILLING','RELEASED','SETTLED'] as const){
      const {ledger,calls}=fixture([{...row,state:action,charged_units:action==='SETTLED'?'70':null}]);
      const identity={phaseId:phase,jobId:id,requestSha256:hash};
      if(action==='SETTLED')await ledger.transition(actor,{...identity,action,actualUnits:70,receiptSha256:receipt});
      else await ledger.transition(actor,{...identity,action});
      expect(calls[2]?.params).toEqual([phase,id,hash,action,action==='SETTLED'?70:null,action==='SETTLED'?receipt:null]);
    }
  });
  it('requires a verified usage receipt only for settlement',async()=>{
    const {ledger,calls}=fixture();
    await expect(ledger.transition(actor,{phaseId:phase,jobId:id,requestSha256:hash,action:'SETTLED'} as never)).rejects.toBeInstanceOf(AiBudgetDenied);
    await expect(ledger.transition(actor,{phaseId:phase,jobId:id,requestSha256:hash,action:'RELEASED',actualUnits:0,receiptSha256:receipt} as never)).rejects.toBeInstanceOf(AiBudgetDenied);
    expect(calls).toHaveLength(0);
  });
  it('records a verified actual charge above the quote ceiling exactly',async()=>{
    const actual=1_000_000_000_001;
    const {ledger}=fixture([{...row,state:'SETTLED',charged_units:String(actual)}]);
    const r=await ledger.transition(actor,{phaseId:phase,jobId:id,requestSha256:hash,
      action:'SETTLED',actualUnits:actual,receiptSha256:receipt});
    expect(r.chargedUnits).toBe(actual);
  });
});
