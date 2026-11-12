import {describe,it,expect,vi} from 'vitest';
import {PostgresSourceRefreshBudget} from '../../apps/api/src/modules/opportunities/source-refresh-budget.js';
const policy={sourceId:'SYN-SOURCE',origin:'https://synthetic.example.edu',
  sourceDailyRequests:2,sourceDailyBytes:524288,originDailyRequests:5,originDailyBytes:1310720};
const input={sourceId:'SYN-SOURCE',permissionRef:'SYN-PERM',canonicalUrl:policy.origin+'/notice',now:'2026-11-12T00:00:00Z'};
function fixture(allowed:unknown=true){
  const query=vi.fn(async(sql:string,_params?:readonly unknown[])=>({rows:sql.includes('reserve_source_refresh_budget')?[{allowed}]:[]}));
  const release=vi.fn(),pool={connect:vi.fn(async()=>({query,release}))};
  return {budget:new PostgresSourceRefreshBudget(pool,[policy]),pool,query,release};
}
describe('#445 durable request/byte admission budget',()=>{
  it('reserves the maximum source response bytes atomically against both daily scopes',async()=>{
    const x=fixture();expect(await x.budget.reserve(input)).toBe(true);
    const call=x.query.mock.calls.find(([sql])=>sql.includes('reserve_source_refresh_budget'))!;
    expect(call[1]).toEqual([expect.stringMatching(/^SOURCE:[a-f0-9]{64}$/),
      expect.stringMatching(/^ORIGIN:[a-f0-9]{64}$/),2,524288,5,1310720,262144]);
    expect(JSON.stringify(call[1])).not.toContain(policy.origin);
    expect(x.query.mock.calls.at(-1)![0]).toBe('COMMIT');expect(x.release).toHaveBeenCalledOnce();
  });
  it('returns exhausted budget without any HTTP or synthetic fallback',async()=>{
    expect(await fixture(false).budget.reserve(input)).toBe(false);
  });
  it('denies an unregistered source or changed origin before DB access',async()=>{
    const x=fixture();
    for(const change of [{sourceId:'SYN-FOREIGN'},{canonicalUrl:'https://other.invalid/notice'},
      {canonicalUrl:policy.origin+'/notice#fragment'},{now:'invalid'}])
      await expect(x.budget.reserve({...input,...change})).rejects.toThrow('Source refresh budget unavailable');
    expect(x.pool.connect).not.toHaveBeenCalled();
  });
  it('rolls back malformed responses and redacts SQL/commit errors',async()=>{
    for(const value of [null,'true',1]){
      const x=fixture(value);await expect(x.budget.reserve(input)).rejects.toThrow('Source refresh budget unavailable');
      expect(x.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');expect(x.release).toHaveBeenCalledOnce();
    }
    const x=fixture();x.query.mockRejectedValue(new Error('PRIVATE-DB-CREDENTIAL'));
    await expect(x.budget.reserve(input)).rejects.toThrow('Source refresh budget unavailable');
    expect(x.release).toHaveBeenCalledOnce();
  });
  it('rejects conflicting origin limits or duplicate sources at construction',()=>{
    const pool=fixture().pool;
    for(const rows of [[policy,policy],[policy,{...policy,sourceId:'SYN-OTHER',originDailyRequests:6}],
      [{...policy,sourceDailyRequests:0}]])
      expect(()=>new PostgresSourceRefreshBudget(pool,rows)).toThrow('Source refresh budget unavailable');
  });
});
