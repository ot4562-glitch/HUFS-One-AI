import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {blankDemoProfileValue,type DemoProfileValue} from '@hufs-one/contracts';
import {PostgresDemoProfileStore} from '../../apps/api/src/modules/profiles/demo-profile-postgres.js';
import {DemoProfileConflict} from '../../apps/api/src/modules/profiles/demo-profile.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
const NOW='2026-11-03T00:00:00.000Z';
const value:DemoProfileValue={primaryMajor:'가상 정보학',earnedCreditUnits:0,interestTopics:['AI_ML'],doubleMajor:{kind:'NONE'}};
function database(){
  const rows=new Map<string,Record<string,unknown>>(),calls:Array<{sql:string;params:readonly unknown[]}>=[];
  let releases=0,fail=false;
  const pool:ReviewerSqlPool={connect:async()=>({release:()=>{releases++;},query:async(sql,params=[])=>{
    calls.push({sql,params});const id=params[0] as string;
    if(fail&&sql.includes('FROM api_demo_profiles'))throw Error('storage failure');
    if(sql.includes('INSERT INTO api_demo_profiles')||sql.includes('UPDATE api_demo_profiles')){
      const old=rows.get(id),row={version:Number(old?.version??0)+1,value_json:JSON.parse(params[1] as string),
        last_operation:params[2],last_expected_version:params[3],updated_at:new Date(NOW)};
      rows.set(id,row);return {rows:[row]};
    }
    if(sql.includes('FROM api_demo_profiles'))return {rows:rows.has(id)?[rows.get(id)!]:[]};
    return {rows:[]};
  }})};return {pool,rows,calls,releases:()=>releases,fail:()=>{fail=true;}};
}
describe('independent demo-profile SQL protocol',()=>{
  it('binds exact RLS actor per transaction; persists across adapters with zero and half-credit units',async()=>{
    const db=database(),a=new PostgresDemoProfileStore(db.pool),b=new PostgresDemoProfileStore(db.pool);
    expect(await a.read('synthetic:a')).toEqual({version:0,value:blankDemoProfileValue(),updatedAt:null});
    expect((await a.save('synthetic:a',{expectedVersion:0,value})).value.earnedCreditUnits).toBe(0);
    expect((await b.read('synthetic:a')).version).toBe(1);
    expect((await b.read('synthetic:b')).value).toEqual(blankDemoProfileValue());
    expect(db.calls.some(c=>c.sql.includes("set_config('hufs.demo_profile_actor',$1,true)")&&c.params[0]==='synthetic:a')).toBe(true);
    expect(db.calls.some(c=>c.sql.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(db.calls.every(c=>!c.sql.includes('api_self_')&&!c.sql.includes('api_demo_overlays'))).toBe(true);
    expect(db.releases()).toBe(4);
  });
  it('makes exact save/reset retries idempotent while rejecting stale/different writes',async()=>{
    const db=database(),a=new PostgresDemoProfileStore(db.pool),request={expectedVersion:0,value};
    const first=await a.save('synthetic:a',request);
    expect(await a.save('synthetic:a',request)).toEqual(first);
    await expect(a.save('synthetic:a',{...request,value:{...value,earnedCreditUnits:1}})).rejects.toBeInstanceOf(DemoProfileConflict);
    const reset=await a.reset('synthetic:a',{expectedVersion:1});
    expect(reset.version).toBe(2);expect(reset.value).toEqual(blankDemoProfileValue());
    expect(await a.reset('synthetic:a',{expectedVersion:1})).toEqual(reset);
    await expect(a.save('synthetic:a',request)).rejects.toBeInstanceOf(DemoProfileConflict);
    await expect(a.reset('synthetic:a',{expectedVersion:0})).rejects.toBeInstanceOf(DemoProfileConflict);
  });
  it('validates actor/input before DB access and rolls back/release on storage failure',async()=>{
    const db=database(),store=new PostgresDemoProfileStore(db.pool);
    await expect(store.read('bad\nactor')).rejects.toThrow();
    await expect(store.save('synthetic:a',{expectedVersion:0,value:{...value,earnedCreditUnits:0.5}})).rejects.toThrow();
    expect(db.calls).toEqual([]);
    db.fail();await expect(store.read('synthetic:a')).rejects.toThrow();
    expect(db.calls.at(-1)?.sql).toBe('ROLLBACK');expect(db.releases()).toBe(1);
  });
  it('migration forces exact-actor RLS without granting access to any personal profile table',()=>{
    const sql=readFileSync(new URL('../../infra/sql/20261103_demo_profile.sql',import.meta.url),'utf8');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql.match(/current_setting\('hufs.demo_profile_actor',true\)/g)).toHaveLength(2);
    expect(sql).toContain('REVOKE ALL ON TABLE api_demo_profiles FROM PUBLIC');
    expect(sql).not.toContain('api_self_');expect(sql).toContain("'EMPTY_DEMO'");
  });
});
