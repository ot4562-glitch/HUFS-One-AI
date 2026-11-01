import {afterEach,describe,expect,it} from 'vitest';
import {DemoProfileOptionSchema,DemoSnapshotSchema} from '@hufs-one/contracts';
import {createApi} from '../../apps/api/src/server.js';
import {PostgresApiProjectionRepository} from '../../apps/api/src/repository-postgres.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';
import profilesRaw from '../../packages/fixtures/synthetic/demo-profiles.json';
import snapshotRaw from '../../packages/fixtures/synthetic/demo-snapshot.json';

const NOW='2026-10-31T00:00:00.000Z';
const ACTOR='synthetic-google-sub-01';
const actor={
  actorId:ACTOR,role:'BETA' as const,
  sessionIdHash:'H'.repeat(24),csrfToken:'C'.repeat(32),
  betaAllowed:true,schoolMailProofExpiresAt:'2026-11-05T00:00:00.000Z',
  sessionExpiresAt:'2026-11-06T00:00:00.000Z',
};
const profiles=profilesRaw.profiles.map(v=>DemoProfileOptionSchema.parse(v));
const snapshot=DemoSnapshotSchema.parse(snapshotRaw);
const apps:Array<ReturnType<typeof createApi>>=[];
afterEach(async()=>{await Promise.all(apps.map(x=>x.close()));apps.length=0;});
function setup(){
  let active=true,grantVersion='v1';
  const calls:Array<{sql:string;params:readonly unknown[]}>=[],releases:number[]=[];
  const connection:ReviewerSqlConnection={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(sql.includes('api_demo_profile_projections'))
        return {rows:profiles.map(profile=>({
          subject_id:profile.demoSubjectId,profile_json:profile,
        }))};
      if(sql.includes('FROM api_sharing_grants')){
        if(!active||params[0]!==ACTOR||params[1]!=='S01')return {rows:[]};
        return {rows:[{
          grant_id:'G1',actor_id:ACTOR,subject_id:'S01',
          allowed_sections:['FEED','NOTICES','ACADEMICS','EXPERIENCE'],
          display_name_allowed:false,recording_allowed:false,
          version:grantVersion,expires_at:'2026-11-05T00:00:00.000Z',
          revoked_at:null,
        }]};
      }
      if(sql.includes('FROM api_demo_snapshot_projections'))
        return {rows:active&&params[0]===ACTOR&&params[1]==='S01'&&params[2]===grantVersion
          ?[{subject_id:'S01',snapshot_json:snapshot,actor_id:ACTOR,version:grantVersion,
            allowed_sections:['FEED','NOTICES','ACADEMICS','EXPERIENCE']}]:[]};
      return {rows:[]};
    },
    release:()=>{releases.push(1);},
  };
  const pool:ReviewerSqlPool={connect:async()=>connection};
  const app=createApi({
    repository:new PostgresApiProjectionRepository(pool,()=>NOW),
    allowedOrigin:'https://example.test',now:()=>NOW,
    verifySession:async(req)=>req.headers.cookie==='valid-session'?actor:null,
    newId:()=> 'context-01',
  });
  apps.push(app);
  return {app,calls,releases,revoke:()=>{active=false;},
    advanceGrant:()=>{grantVersion='v2';}};
}
const getHeaders={cookie:'valid-session'};
const postHeaders={
  ...getHeaders,origin:'https://example.test','x-csrf-token':actor.csrfToken,
};
async function context(app:ReturnType<typeof createApi>){
  return app.inject({
    method:'POST',url:'/api/demo/contexts',
    headers:postHeaders,
    payload:{demoSubjectId:'S01',demoRunId:'SYNTHETIC-RUN'},
  });
}
describe('TASK-27 Fastify → Postgres projection adapter (SQL fake only)',()=>{
  it('redacts non-shared profile labels and refuses unauthenticated access',async()=>{
    const h=setup();
    expect((await h.app.inject({url:'/api/demo/profiles'})).statusCode).toBe(401);
    const res=await h.app.inject({url:'/api/demo/profiles',headers:getHeaders});
    expect(res.statusCode).toBe(200);
    const rows=res.json().profiles;
    expect(rows).toHaveLength(5);
    expect(rows[1].readiness).toBe('PENDING');
    expect(rows[1].displayLabel).toBe('시연 대상 2');
    expect(h.calls.some(x=>x.sql.includes('api_sharing_grants')
      &&x.params[0]===ACTOR)).toBe(true);
  });
  it('binds the context to the verified Google subject, grant and projection version',async()=>{
    const h=setup();
    const created=await context(h.app);
    expect(created.statusCode).toBe(201);
    const id=created.json().contextId;
    const res=await h.app.inject({
      url:`/api/demo/contexts/${id}/snapshot`,headers:getHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().contextId).toBe(id);
    expect(res.json().academics).toEqual(snapshot.academics);
    expect(res.json().forecast).toEqual({state:'NOT_SHARED'});
  });
  it('blocks old context immediately after grant revocation',async()=>{
    const h=setup();
    const started=await context(h.app);
    expect(started.statusCode).toBe(201);
    h.revoke();
    const r=await h.app.inject({
      url:`/api/demo/contexts/${started.json().contextId}/snapshot`,
      headers:getHeaders,
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe('FORBIDDEN');
    expect(r.headers['cache-control']).toBe('no-store');
  });
  it('rejects a changed SharingGrant version without exposing stale projections',async()=>{
    const h=setup();
    const started=await context(h.app);
    expect(started.statusCode).toBe(201);
    h.advanceGrant();
    const r=await h.app.inject({
      url:`/api/demo/contexts/${started.json().contextId}/snapshot`,
      headers:getHeaders,
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe('VERSION_CONFLICT');
  });
  it('releases all borrowed PG connections after each request',async()=>{
    const h=setup();
    const response=await context(h.app);
    expect(response.statusCode).toBe(201);
    expect(h.releases).toHaveLength(h.calls.length);
  });
});
