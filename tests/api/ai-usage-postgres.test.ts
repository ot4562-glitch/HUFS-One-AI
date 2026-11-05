import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {PostgresAdminUsageReader} from '../../apps/api/src/modules/admin/usage.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
const now='2026-11-05T00:00:00.000Z',actorId='SYN-ADMIN';
const validRow={
  phase_id:'SYN-PHASE',enabled:false,
  starts_at:'2026-11-01T00:00:00.000Z',ends_at:'2026-12-01T00:00:00.000Z',
  max_units:'1000000',actor_max_units:'100000',max_attempts:10,
  actor_max_attempts:2,reserved_units:'100',charged_units:'9007199254740993',
  attempts:1,jobs_reserved:'1',jobs_dispatched:'0',jobs_unknown_billing:'0',
  jobs_released:'0',jobs_settled:'1',
};
function fixture(rows:Record<string,unknown>[]=[validRow],throws=false){
  const calls:Array<{sql:string;params:readonly unknown[]}>=[],release=vi.fn();
  const connect=vi.fn(async()=>({release,query:async(sql:string,params:readonly unknown[]=[])=>{
    calls.push({sql,params});
    if(sql.includes('ai_budget_admin_usage')){if(throws)throw Error('sensitive database details');return {rows};}
    return {rows:[]};
  }}));
  const pool:ReviewerSqlPool={connect};
  return {reader:new PostgresAdminUsageReader(pool),calls,release,connect};
}
describe('admin AI budget usage SQL adapter (#27)',()=>{
  it('reads stored micro-KRW totals as lossless strings in read-only actor-bound transaction',async()=>{
    const h=fixture();
    const result=await h.reader.read({actorId,now});
    expect(result.unit).toBe('MICRO_KRW');
    expect(result.phases[0]?.chargedUnits).toBe('9007199254740993');
    expect(result.metricCoverage).toEqual({tokens:'NOT_COLLECTED',errors:'NOT_COLLECTED'});
    expect(h.calls.map(c=>c.sql)).toEqual([
      'BEGIN READ ONLY',"SELECT set_config('app.actor_id',$1,true)",
      'SELECT * FROM public.ai_budget_admin_usage()','COMMIT',
    ]);
    expect(h.calls[1]?.params).toEqual([actorId]);expect(h.release).toHaveBeenCalledOnce();
  });
  it('distinguishes no configured phase from a proven zero spend',async()=>{
    const h=fixture([]);
    const result=await h.reader.read({actorId,now});
    expect(result.status).toBe('NOT_CONFIGURED');
    expect(result.phases).toEqual([]);
  });
  it('rejects invalid actor/time without opening any SQL connection',async()=>{
    const h=fixture();
    await expect(h.reader.read({actorId:'invalid actor',now})).rejects.toThrow('Admin usage unavailable');
    await expect(h.reader.read({actorId,now:'tomorrow'})).rejects.toThrow('Admin usage unavailable');
    expect(h.connect).not.toHaveBeenCalled();
  });
  it('rolls back on provider errors, malicious rows, duplicates and too many phases',async()=>{
    for(const [rows,throws] of [
      [[],true],[[{...validRow,charged_units:'-1'}],false],
      [[{...validRow,charged_units:9007199254740993}],false],
      [[validRow,validRow],false],[Array(101).fill(validRow),false],
    ] as const){
      const h=fixture([...rows],throws);
      await expect(h.reader.read({actorId,now})).rejects.toThrow('Admin usage unavailable');
      expect(h.calls.at(-1)?.sql).toBe('ROLLBACK');
      expect(h.release).toHaveBeenCalledOnce();
    }
  });
  it('retains the SQL data/role boundary for independent approval only',()=>{
    const sql=readFileSync(new URL('../../infra/sql/20261105_ai_budget_usage.sql',import.meta.url),'utf8');
    expect(sql).toContain('SECURITY DEFINER SET search_path=pg_catalog');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.ai_budget_admin_usage() FROM PUBLIC');
    expect(sql).not.toMatch(/^\s*GRANT\s+EXECUTE\b/im);
    expect(sql).toContain("current_setting('app.actor_id',true)");
  });
});
