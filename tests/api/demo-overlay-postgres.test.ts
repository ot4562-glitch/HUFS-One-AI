import {describe,expect,it} from 'vitest';
import {PostgresDemoOverlayStore} from '../../apps/api/src/modules/demo-overlay-postgres.js';
import {DemoOverlayConflict} from '../../apps/api/src/modules/demo-overlay.js';
import type {DemoOverlayKey} from '../../apps/api/src/modules/demo-overlay.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
const NOW='2026-11-01T00:00:00.000Z';
const key:DemoOverlayKey={actorId:'google:synthetic',sessionIdHash:'SESSION1',demoRunId:'RUN1',
  demoSubjectId:'S01',datasetVersion:'DATA1',projectionVersion:'PROJ1',sharingGrantVersion:'GRANT1'};

function database(){
  const records=new Map<string,Record<string,unknown>>(),calls:Array<{sql:string;params:readonly unknown[]}>=[];
  let releases=0;
  const pool:ReviewerSqlPool={connect:async()=>({release:()=>{releases++;},query:async(sql,params=[])=>{
    calls.push({sql,params});
    const id=JSON.stringify(params.slice(0,7));
    if(sql.includes('INSERT INTO api_demo_overlays')){
      if(records.has(id))return {rows:[]};
      const row={version:1,value_json:JSON.parse(params[7] as string),updated_at:params[8]};
      records.set(id,row);return {rows:[row]};
    }
    if(sql.includes('UPDATE api_demo_overlays')){
      const old=records.get(id);
      if(!old||old.version!==params[7])return {rows:[]};
      const row={version:Number(old.version)+1,value_json:JSON.parse(params[8] as string),updated_at:params[9]};
      records.set(id,row);return {rows:[row]};
    }
    if(sql.includes('FROM api_demo_overlays'))return {rows:records.has(id)?[records.get(id)!]:[]};
    return {rows:[]};
  }})};
  return {pool,calls,releases:()=>releases};
}

describe('PostgreSQL BETA overlay state: bounded CAS in isolated session/run namespaces',()=>{
  it('returns empty state for an absent row and sets actor-local RLS in its transaction',async()=>{
    const db=database(),store=new PostgresDemoOverlayStore(db.pool);
    expect(await store.read(key)).toEqual({version:0,value:{},updatedAt:null});
    expect(db.calls.some(c=>c.sql.includes("set_config('hufs.demo_actor',$1,true)")
      &&c.params[0]===key.actorId)).toBe(true);
    expect(db.calls.map(c=>c.sql.trim())).toContain('COMMIT');
    expect(db.releases()).toBe(1);
  });
  it('allows one competing initial write and one competing update; reset retains version',async()=>{
    const db=database(),a=new PostgresDemoOverlayStore(db.pool),b=new PostgresDemoOverlayStore(db.pool);
    const first=await Promise.allSettled([a.put(key,{expectedVersion:0,value:{interestTopics:['AI_ML']}},NOW),
      b.put(key,{expectedVersion:0,value:{interestTopics:['DATA_ANALYTICS']}},NOW)]);
    expect(first.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(first.filter(x=>x.status==='rejected').every(x=>x.status==='rejected'
      &&x.reason instanceof DemoOverlayConflict)).toBe(true);
    const next=await Promise.allSettled([a.put(key,{expectedVersion:1,value:{}},NOW),
      b.put(key,{expectedVersion:1,value:{hiddenOpportunityIds:['OP1']}},NOW)]);
    expect(next.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect((await a.read(key)).version).toBe(2);
    expect((await a.read({...key,demoRunId:'RUN2'})).version).toBe(0);
    expect((await a.read({...key,sessionIdHash:'SESSION2'})).version).toBe(0);
  });
  it('rejects unbounded state or invalid identities before connecting',async()=>{
    const db=database(),store=new PostgresDemoOverlayStore(db.pool);
    await expect(store.put(key,{expectedVersion:0,value:{hiddenOpportunityIds:Array(201).fill('OP1')}},NOW))
      .rejects.toThrow();
    await expect(store.read({...key,actorId:'unsafe\nactor'})).rejects.toThrow();
    expect(db.calls).toHaveLength(0);
  });
  it('rolls back an invalid database state and releases the connection',async()=>{
    let rolledBack=false,released=false;
    const store=new PostgresDemoOverlayStore({connect:async()=>({release:()=>{released=true;},
      query:async sql=>{
        if(sql==='ROLLBACK')rolledBack=true;
        return {rows:sql.includes('FROM api_demo_overlays')
          ?[{version:1,value_json:{facts:{forged:true}},updated_at:NOW}]:[]};
      }})});
    await expect(store.read(key)).rejects.toThrow();
    expect(rolledBack).toBe(true);expect(released).toBe(true);
  });
});
