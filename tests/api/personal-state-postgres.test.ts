import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {
  PostgresPersonalStateStore,PersonalStateConflict,PersonalStateDenied,
} from '../../apps/api/src/db/personal-state-postgres.js';
import {createPostgresDataPool} from '../../apps/api/src/db/pg-pool.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

type Row=Record<string,unknown>;
const baseScope={actorId:'synthetic-actor-A',subjectId:'S01' as const,grantVersion:'v1'};
const experience={
  kind:'EXPERIENCE' as const,dataMode:'SYNTHETIC' as const,
  title:'합성 교외활동',summary:'개인정보 없는 합성 경험',
};
const prefs={
  kind:'PREFERENCES' as const,dataMode:'SYNTHETIC' as const,
  interests:[],desiredJobs:[],notificationsEnabled:false,search:'',
};
function fake(){
  let rows=new Map<string,Row>(),events:Row[]=[];
  let snapshot:Map<string,Row>|null=null,eventSnapshot:Row[]=[];
  let grantActive=true,grantVersion='v1',failAudit=false,otherActor=false;
  let syntheticAllowed=true,ownerAllowed=false;
  const calls:Array<{sql:string;params:readonly unknown[]}>=[],releases:number[]=[];
  const identity=(v:readonly unknown[])=>v.slice(0,4).join('|');
  const clone=(r:Row):Row=>structuredClone(r);
  const c:ReviewerSqlConnection={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      const statement=sql.trim();
      if(statement==='BEGIN'){
        snapshot=new Map([...rows].map(([k,v])=>[k,clone(v)]));
        eventSnapshot=structuredClone(events);return {rows:[]};
      }
      if(statement==='ROLLBACK'){
        if(snapshot)rows=snapshot;
        events=eventSnapshot;snapshot=null;return {rows:[]};
      }
      if(statement==='COMMIT'){snapshot=null;return {rows:[]};}
      if(sql.includes('api_lock_authorized_personal_grant')){
        const allowed=grantActive&&!otherActor&&params[0]===baseScope.actorId
          &&params[1]===baseScope.subjectId&&params[2]===grantVersion;
        return {rows:[{allowed}]};
      }
      if(sql.includes('INSERT INTO api_personal_records')){
        const k=identity(params),old=rows.get(k);
        if(old)return {rows:[]};
        const record={
          actor_id:params[0],subject_id:params[1],kind:params[2],
          item_id:params[3],value_json:JSON.parse(String(params[4])),
          data_mode:params[5],version:1,updated_at:params[6],deleted_at:null,
        };
        rows.set(k,record);return {rows:[clone(record)]};
      }
      if(sql.includes('INSERT INTO api_personal_events')){
        if(failAudit)throw new Error('synthetic audit failure');
        const ev={actor_id:params[1],subject_id:params[2],kind:params[3],
          item_id:params[4],action:params[5],version:params[6]};
        events.push(ev);return {rows:[]};
      }
      if(sql.includes('UPDATE api_personal_records')){
        const k=identity(params),row=rows.get(k);
        const expected=sql.includes("value_json='{}'")?params[5]:params[7];
        if(!row||row.deleted_at||row.version!==expected)return {rows:[]};
        const next:Row={...row,version:Number(row.version)+1};
        if(sql.includes("value_json='{}'")){
          next.value_json={};next.deleted_at=params[4];next.updated_at=params[4];
        }else{
          next.value_json=JSON.parse(String(params[4]));
          next.data_mode=params[5];next.updated_at=params[6];
        }
        rows.set(k,next);
        return {rows:[clone(next)]};
      }
      if(sql.includes('FROM api_personal_records')){
        if(sql.includes('item_id=$4')){
          const record=rows.get(identity(params));
          if(!record||record.deleted_at)return {rows:[]};
          if(sql.includes('version=$5')&&record.version!==params[4])return {rows:[]};
          return {rows:[clone(record)]};
        }
        const matches=[...rows.values()].filter(r=>
          r.actor_id===params[0]&&r.subject_id===params[1]
          &&r.kind===params[2]&&!r.deleted_at
          &&String(r.item_id)>String(params[3]))
          .sort((a,b)=>String(a.item_id).localeCompare(String(b.item_id)))
          .slice(0,Number(params[4]));
        return {rows:matches.map(clone)};
      }
      return {rows:[]};
    },release:()=>releases.push(1),
  };
  const pool:ReviewerSqlPool={connect:async()=>c};
  return {
    store:new PostgresPersonalStateStore(
      pool,
      {mayProcess:async()=>ownerAllowed},
      {isApproved:async()=>syntheticAllowed},
    ),pool,calls,releases,
    getRows:()=>rows,getEvents:()=>events,
    setGrant:(active:boolean,version='v1')=>{grantActive=active;grantVersion=version;},
    otherActor:(active:boolean)=>{otherActor=active;},
    failAudit:(active:boolean)=>{failAudit=active;},
    synthetic:(allowed:boolean)=>{syntheticAllowed=allowed;},
    owner:(allowed:boolean)=>{ownerAllowed=allowed;},
  };
}
describe('TASK-27 personal PostgreSQL CRUD (SQL stub, not a real DB)',()=>{
  it('writes, reads, updates and permanently clears a synthetic experience payload',async()=>{
    const h=fake();
    const created=await h.store.create({scope:baseScope,itemId:'exp-01',value:experience});
    expect(created.version).toBe(1);
    expect((await h.store.read({
      scope:baseScope,kind:'EXPERIENCE',itemId:'exp-01',
    }))?.value).toEqual(experience);
    const updated=await h.store.update({
      scope:baseScope,itemId:'exp-01',expectedVersion:1,
      value:{...experience,summary:'검수된 합성 업데이트'},
    });
    expect(updated.version).toBe(2);
    expect((await h.store.delete({
      scope:baseScope,kind:'EXPERIENCE',itemId:'exp-01',expectedVersion:2,
    })).version).toBe(3);
    expect(await h.store.read({
      scope:baseScope,kind:'EXPERIENCE',itemId:'exp-01',
    })).toBeNull();
    expect([...h.getRows().values()][0]?.value_json).toEqual({});
    expect(h.getEvents().map(x=>x.action)).toEqual(['CREATED','UPDATED','DELETED']);
    expect(JSON.stringify(h.getEvents())).not.toContain('합성 교외활동');
    expect(h.calls.filter(x=>x.sql.trim()==='COMMIT')).toHaveLength(5);
    expect(h.releases).toHaveLength(5);
  });
  it('denies all reads/lists/writes after revoke, without retained in-process cache',async()=>{
    const h=fake();
    await h.store.create({scope:baseScope,itemId:'exp-01',value:experience});
    h.setGrant(false,'v2');
    for(const call of [
      ()=>h.store.read({scope:baseScope,kind:'EXPERIENCE',itemId:'exp-01'}),
      ()=>h.store.list({scope:baseScope,kind:'EXPERIENCE'}),
      ()=>h.store.update({scope:baseScope,itemId:'exp-01',expectedVersion:1,value:experience}),
      ()=>h.store.delete({scope:baseScope,kind:'EXPERIENCE',itemId:'exp-01',expectedVersion:1}),
    ])await expect(call()).rejects.toBeInstanceOf(PersonalStateDenied);
    expect(h.getEvents()).toHaveLength(1);
  });
  it('keeps actor and selected subject separate in every SQL query',async()=>{
    const h=fake();
    await h.store.create({scope:baseScope,itemId:'exp-01',value:experience});
    h.otherActor(true);
    await expect(h.store.read({
      scope:baseScope,kind:'EXPERIENCE',itemId:'exp-01',
    })).rejects.toBeInstanceOf(PersonalStateDenied);
    await expect(h.store.read({
      scope:{...baseScope,actorId:'another-actor'},kind:'EXPERIENCE',itemId:'exp-01',
    })).rejects.toBeInstanceOf(PersonalStateDenied);
    await expect(h.store.read({
      scope:{...baseScope,subjectId:'S02'},kind:'EXPERIENCE',itemId:'exp-01',
    })).rejects.toBeInstanceOf(PersonalStateDenied);
    const checks=h.calls.filter(x=>x.sql.includes('api_lock_authorized_personal_grant'));
    expect(checks).toHaveLength(4);
    expect(checks.every(x=>x.sql.includes('$1::text,$2::char(3)'))).toBe(true);
  });
  it('optimistic CAS rejects sequential stale writes and stale grant versions',async()=>{
    const h=fake();
    await h.store.create({scope:baseScope,itemId:'exp-01',value:experience});
    await h.store.update({
      scope:baseScope,itemId:'exp-01',expectedVersion:1,value:experience,
    });
    await expect(h.store.update({
      scope:baseScope,itemId:'exp-01',expectedVersion:1,value:experience,
    })).rejects.toBeInstanceOf(PersonalStateConflict);
    expect(h.getEvents()).toHaveLength(2);
    h.setGrant(true,'v2');
    await expect(h.store.list({scope:baseScope,kind:'EXPERIENCE'}))
      .rejects.toBeInstanceOf(PersonalStateDenied);
  });
  it('audit insertion failure rolls back the payload change in the SQL transaction',async()=>{
    const h=fake();
    h.failAudit(true);
    await expect(h.store.create({
      scope:baseScope,itemId:'exp-01',value:experience,
    })).rejects.toThrow('synthetic audit failure');
    expect(h.getRows().size).toBe(0);
    expect(h.getEvents()).toHaveLength(0);
    expect(h.calls.some(x=>x.sql.trim()==='ROLLBACK')).toBe(true);
    expect(h.releases).toHaveLength(1);
  });
  it('supports actor-scoped preferences, bookmarks, read state and plan records',async()=>{
    const h=fake();
    const records=[
      {id:'prefs',value:prefs},
      {id:'saved-01',value:{kind:'BOOKMARK',dataMode:'SYNTHETIC',itemId:'SYN-OP-01',saved:true}},
      {id:'read-01',value:{kind:'READ_RECEIPT',dataMode:'SYNTHETIC',itemId:'SYN-NOT-01',read:true}},
      {id:'plan-01',value:{kind:'COURSE_PLAN',dataMode:'SYNTHETIC',courseId:'SYN-C-01',planned:true}},
      {id:'draft-01',value:{kind:'APPLICATION_DRAFT',dataMode:'SYNTHETIC',opportunityId:'SYN-OP-01',text:'합성'}},
    ];
    for(const r of records)await h.store.create({
      scope:baseScope,itemId:r.id,value:r.value,
    });
    expect((await h.store.list({scope:baseScope,kind:'BOOKMARK'})).map(x=>x.itemId))
      .toEqual(['saved-01']);
    expect((await h.store.list({scope:baseScope,kind:'PREFERENCES'})).map(x=>x.itemId))
      .toEqual(['prefs']);
    expect((await h.store.list({scope:baseScope,kind:'COURSE_PLAN'})).map(x=>x.itemId))
      .toEqual(['plan-01']);
  });
  it('bounds paginated reading, rejects raw unknown fields and unconsented owner records',async()=>{
    const h=fake();
    await expect(h.store.create({
      scope:baseScope,itemId:'exp-01',value:{...experience,rawForms:{realName:'secret'}},
    })).rejects.toThrow();
    await expect(h.store.create({
      scope:baseScope,itemId:'exp-01',value:{...experience,dataMode:'OWNER_CONSENTED'},
    })).rejects.toBeInstanceOf(PersonalStateDenied);
    await expect(h.store.list({scope:baseScope,kind:'EXPERIENCE',limit:0})).rejects.toThrow();
    await expect(h.store.list({scope:baseScope,kind:'EXPERIENCE',limit:101})).rejects.toThrow();
    expect(h.calls.some(x=>x.sql.trim()==='ROLLBACK')).toBe(true);
  });
  it('fails closed if synthetic data is unverified despite the browser label',async()=>{
    const h=fake();
    h.synthetic(false);
    await expect(h.store.create({
      scope:baseScope,itemId:'exp-unverified',value:experience,
    })).rejects.toBeInstanceOf(PersonalStateDenied);
    expect(h.getRows().size).toBe(0);
    expect(h.getEvents()).toHaveLength(0);
  });
  it('cannot downgrade old owner-consented data to synthetic after consent withdrawal',async()=>{
    const h=fake();
    h.owner(true);
    await h.store.create({
      scope:baseScope,itemId:'exp-owner',
      value:{...experience,dataMode:'OWNER_CONSENTED'},
    });
    h.owner(false);
    await expect(h.store.read({
      scope:baseScope,kind:'EXPERIENCE',itemId:'exp-owner',
    })).rejects.toBeInstanceOf(PersonalStateDenied);
    await expect(h.store.update({
      scope:baseScope,itemId:'exp-owner',expectedVersion:1,value:experience,
    })).rejects.toBeInstanceOf(PersonalStateDenied);
    const [stored]=[...h.getRows().values()];
    expect(stored?.data_mode).toBe('OWNER_CONSENTED');
    expect(stored?.version).toBe(1);
    // Erasure is still permitted without renewal of processing consent.
    expect((await h.store.delete({
      scope:baseScope,kind:'EXPERIENCE',itemId:'exp-owner',expectedVersion:1,
    })).version).toBe(2);
    expect([...h.getRows().values()][0]?.value_json).toEqual({});
  });
});
describe('TASK-27 PG configuration and migration gate (offline static only)',()=>{
  const dir=new URL('../../infra/sql/',import.meta.url);
  const base=readFileSync(new URL('20261031_api_projections.sql',dir),'utf8');
  const personal=readFileSync(new URL('20261031_z_api_personal_state.sql',dir),'utf8');
  const roles=readFileSync(new URL('20261031_zz_api_roles.sql',dir),'utf8');
  it('refuses production without CA, remote test DBs and URL sslmode overrides',()=>{
    const config={connectionString:'postgres://tester:secret@localhost/hufs_one_test',
      environment:'local-test' as const,expectedRole:'tester'};
    expect(()=>createPostgresDataPool({...config,environment:'production'})).toThrow();
    expect(()=>createPostgresDataPool({
      ...config,connectionString:'postgres://tester:secret@db.example/hufs_one_test',
    })).toThrow();
    expect(()=>createPostgresDataPool({
      ...config,connectionString:config.connectionString+'?sslmode=disable',
    })).toThrow();
    expect(()=>createPostgresDataPool({...config,maxConnections:21})).toThrow();
    expect(()=>createPostgresDataPool({
      ...config,connectionString:'postgres://tester:secret@localhost/hufs_one_production',
    })).toThrow();
  });
  it('does not create local network connections just by constructing a pool',async()=>{
    const local=createPostgresDataPool({
      connectionString:'postgres://tester:synthetic@localhost/hufs_one_test',
      environment:'local-test',expectedRole:'tester',maxConnections:1,
    });
    await local.close();
  });
  it('requires a valid plpgsql audit trigger, owner-only grants and no raw student table',()=>{
    expect(base).toContain('LANGUAGE plpgsql AS $$');
    expect(base).not.toContain('LANGUAGE plpgsql AS $\n');
    expect(personal).toContain('PRIMARY KEY(actor_id,subject_id,kind,item_id)');
    expect(personal).toContain('BEFORE UPDATE OR DELETE ON api_personal_events');
    expect(personal).not.toMatch(/CREATE TABLE.*raw_forms/);
    expect(roles).toContain('hufs_api_projection_reader NOLOGIN');
    expect(roles).toContain('hufs_api_personal_writer NOLOGIN');
    expect(roles).toContain('hufs_api_grant_admin NOLOGIN');
    expect(personal).toContain('SECURITY DEFINER');
    expect(personal).toContain('FOR SHARE;');
    expect(roles).toContain('GRANT EXECUTE ON FUNCTION');
    expect(roles).toContain('ENABLE ROW LEVEL SECURITY');
    expect(roles).toContain('FORCE ROW LEVEL SECURITY');
    expect(roles).toContain("current_setting('hufs.actor_id',true)");
    expect(roles).toContain("current_setting('hufs.subject_id',true)");
    expect(roles).not.toMatch(/GRANT ALL PRIVILEGES/);
    expect(roles).not.toMatch(/GRANT DELETE ON/);
  });
});
