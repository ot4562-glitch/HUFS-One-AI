/** Synthetic-only, actual disposable PostgreSQL proof. No NCP or real sources. */
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {expect} from 'vitest';
import {PostgresSourceRefreshBudget} from '../../apps/api/src/modules/opportunities/source-refresh-budget.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');

export async function proveSourceRefreshBudgetPg(admin:Pool,restricted:Pool):Promise<void>{
  const reserve=(source:string,origin:string,requests=3,bytes=3*262144)=>admin.query(
    'SELECT public.reserve_source_refresh_budget($1,$2,$3,$4,$5,$6,$7) AS allowed',
    ['SOURCE:'+hash(source),'ORIGIN:'+hash(origin),requests,bytes,requests,bytes,262144]);
  const parallel=await Promise.all(Array.from({length:20},()=>reserve('SYN-BUDGET-A','SYN-ORIGIN-A')));
  expect(parallel.filter(r=>r.rows[0]?.allowed===true)).toHaveLength(3);
  const row=(await admin.query(`SELECT attempts,reserved_bytes FROM public.source_refresh_daily_budget
    WHERE scope_key=$1`,['ORIGIN:'+hash('SYN-ORIGIN-A')])).rows[0];
  expect(row.attempts).toBe(3);expect(Number(row.reserved_bytes)).toBe(3*262144);
  const shared=await Promise.all(Array.from({length:20},(_,i)=>reserve('SYN-BUDGET-'+(i%2),'SYN-ORIGIN-B')));
  expect(shared.filter(r=>r.rows[0]?.allowed===true)).toHaveLength(3);
  const bytes=await Promise.all(Array.from({length:5},()=>reserve('SYN-BUDGET-C','SYN-ORIGIN-C',10,2*262144)));
  expect(bytes.filter(r=>r.rows[0]?.allowed===true)).toHaveLength(2);

  await expect(restricted.query('SELECT * FROM public.source_refresh_daily_budget')).rejects.toMatchObject({code:'42501'});
  const signature='public.reserve_source_refresh_budget(text,text,integer,bigint,integer,bigint,integer)';
  await expect(restricted.query('SELECT public.reserve_source_refresh_budget($1,$2,1,262144,1,262144,262144)',
    ['SOURCE:'+hash('SYN-DENIED'),'ORIGIN:'+hash('SYN-DENIED')])).rejects.toMatchObject({code:'42501'});
  await admin.query('GRANT EXECUTE ON FUNCTION '+signature+' TO hufs_test_temporal');
  try{
    const budget=new PostgresSourceRefreshBudget({connect:async()=>{
      const c=await restricted.connect();return {query:async(sql,params=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release()};
    }},[{sourceId:'SYN-ADAPTER-BUDGET',origin:'https://synthetic.example.edu',
      sourceDailyRequests:1,sourceDailyBytes:262144,originDailyRequests:1,originDailyBytes:262144}]);
    const input={sourceId:'SYN-ADAPTER-BUDGET',permissionRef:'SYN-PERM',
      canonicalUrl:'https://synthetic.example.edu/notice',now:new Date().toISOString()};
    expect(await budget.reserve(input)).toBe(true);expect(await budget.reserve(input)).toBe(false);
    await expect(restricted.query('SELECT * FROM public.source_refresh_daily_budget')).rejects.toMatchObject({code:'42501'});
  }finally{await admin.query('REVOKE EXECUTE ON FUNCTION '+signature+' FROM hufs_test_temporal');}
}
