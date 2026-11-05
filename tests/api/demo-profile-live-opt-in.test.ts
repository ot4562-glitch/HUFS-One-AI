/** Actual local PG18 proof, SYNTHETIC only. Exact isolated empty database + fresh
 * role are mandatory. No resource is dropped, reset, overwritten or cleaned. */
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {blankDemoProfileValue,blankDemoProfileWorkspace,type DemoProfileValue} from '@hufs-one/contracts';
import {PostgresDemoProfileStore} from '../../apps/api/src/modules/profiles/demo-profile-postgres.js';
import {DemoProfileService,DemoProfileConflict} from '../../apps/api/src/modules/profiles/demo-profile.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';

const RUN=process.env.HUFS_PG_DEMO_PROFILE_LIVE==='1';
const role='hufs_test_demo_profile',password=randomBytes(24).toString('hex'),pools:Pool[]=[];
let admin:Pool,limited:Pool;
const pool=(url:URL)=>{const p=new Pool({connectionString:url.toString(),ssl:false,max:4,
  connectionTimeoutMillis:3000,statement_timeout:5000});pools.push(p);return p;};
const adapter=(p:Pool):ReviewerSqlPool=>({connect:async()=>{const c=await p.connect();return {
  query:async(sql,params=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release()};}});
const A:DemoProfileValue={primaryMajor:'가상 정보학',earnedCreditUnits:0,interestTopics:['AI_ML'],doubleMajor:{kind:'NONE'}};
const B:DemoProfileValue={primaryMajor:'가상 문화학',earnedCreditUnits:1,interestTopics:['CULTURE_TOURISM'],doubleMajor:{kind:'DOUBLE',major:'가상 환경학'}};

describe.skipIf(!RUN)('REAL PG18 independent synthetic demo-profile persistence',()=>{
  beforeAll(async()=>{
    const raw=process.env.HUFS_PG_DEMO_PROFILE_URL;
    if(!raw)throw Error('Explicit isolated demo-profile PostgreSQL URL required');
    const url=new URL(raw);
    if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='15439'
      ||url.pathname!=='/hufs_one_demo_profile_test'||url.username!=='hufs_local_admin'||url.search||url.hash)
      throw Error('Refusing non-owned/non-loopback/non-demo-profile database');
    const bootstrap=new URL(url);bootstrap.pathname='/postgres';const control=pool(bootstrap);
    const info=await control.query("SELECT current_user AS who,current_setting('server_version_num')::int AS version,host(inet_server_addr()) AS host,inet_server_port() AS port");
    if(info.rows[0]?.who!=='hufs_local_admin'||info.rows[0]?.version<180000
      ||info.rows[0]?.host!=='127.0.0.1'||info.rows[0]?.port!==15439)throw Error('Owned loopback PG18 not established');
    if((await control.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows.length)
      throw Error('Preserve existing demo-profile test role; no overwrite authorized');
    if(!(await control.query("SELECT 1 FROM pg_database WHERE datname='hufs_one_demo_profile_test'")).rows.length)
      await control.query('CREATE DATABASE hufs_one_demo_profile_test');
    admin=pool(url);
    const objects=await admin.query("SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace)+(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace) AS n");
    if(Number(objects.rows[0]?.n)!==0)throw Error('Preserve nonempty demo-profile test database; no reset authorized');
    await admin.query(readFileSync(new URL('../../infra/sql/20261103_demo_profile.sql',import.meta.url),'utf8'));
    await admin.query(readFileSync(new URL('../../infra/sql/20261105_demo_profile_workspace.sql',import.meta.url),'utf8'));
    await admin.query(`CREATE ROLE hufs_test_demo_profile LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO hufs_test_demo_profile;
      GRANT SELECT,INSERT,UPDATE ON api_demo_profiles TO hufs_test_demo_profile;`);
    const target=new URL(url);target.username=role;target.password=password;limited=pool(target);
  },30000);
  afterAll(async()=>{await Promise.all(pools.map(p=>p.end()));},10000);
  it('persists zero/half-credit, actor-isolates A/B/reset and recomputes through a fresh adapter',async()=>{
    const make=()=>new DemoProfileService(new PostgresDemoProfileStore(adapter(limited)));
    const initial=await make().read('SYN-DEMO-OWNER-A');
    expect(initial.profile.value).toEqual(blankDemoProfileValue());
    const a=await make().save('SYN-DEMO-OWNER-A',{expectedVersion:0,value:A});
    expect(a.profile.value.earnedCreditUnits).toBe(0);
    expect(await make().save('SYN-DEMO-OWNER-A',{expectedVersion:0,value:A})).toEqual(a);
    const b=await make().save('SYN-DEMO-OWNER-A',{expectedVersion:1,value:B});
    expect(b.profile.value.earnedCreditUnits).toBe(1);
    expect(a.snapshot.feed).not.toEqual(b.snapshot.feed);expect(a.snapshot.notices).not.toEqual(b.snapshot.notices);
    expect(a.snapshot.clubs).not.toEqual(b.snapshot.clubs);
    expect((await make().read('SYN-DEMO-OWNER-B')).profile.value).toEqual(blankDemoProfileValue());
    const reset=await make().reset('SYN-DEMO-OWNER-A',{expectedVersion:2});
    expect(reset.profile.version).toBe(3);expect(reset.profile.value).toEqual(blankDemoProfileValue());
    expect(await make().reset('SYN-DEMO-OWNER-A',{expectedVersion:2})).toEqual(reset);
    expect({...reset.snapshot,version:0}).toEqual(initial.snapshot);
    await expect(make().save('SYN-DEMO-OWNER-A',{expectedVersion:1,value:B})).rejects.toBeInstanceOf(DemoProfileConflict);
    expect(reset.snapshot.academics.state).toBe('UNKNOWN');expect(reset.snapshot.forecast.state).toBe('UNKNOWN');
  });
  it('serializes competing initial and later writes so one distinct operation receives 409',async()=>{
    const a=new PostgresDemoProfileStore(adapter(limited)),b=new PostgresDemoProfileStore(adapter(limited));
    for(const expectedVersion of [0,1]){
      const result=await Promise.allSettled([a.save('SYN-DEMO-RACE',{expectedVersion,value:A}),
        b.save('SYN-DEMO-RACE',{expectedVersion,value:B})]);
      expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
      expect(result.filter(r=>r.status==='rejected'&&r.reason instanceof DemoProfileConflict)).toHaveLength(1);
    }
  });
  it('persists full workspace through a fresh service, races reset against workspace and refuses stale resurrection',async()=>{
    const make=()=>new DemoProfileService(new PostgresDemoProfileStore(adapter(limited)));
    const id='SYN-DEMO-WORKSPACE',workspace={...blankDemoProfileWorkspace(),bookmarks:['SYN-OPP-002'],
      experiences:[{id:'SYN-EXP-001',title:'합성 활동',summary:'가상',topicCodes:['DATA_ANALYTICS' as const]}],
      planCourseIds:['SYN-COURSE-001'],notifications:true,search:'가상',experienceOverlay:'ON' as const};
    await make().save(id,{expectedVersion:0,value:A});
    const result=await make().saveWorkspace(id,{expectedVersion:1,workspace});
    expect(result.profile.workspace).toEqual(workspace);expect((await make().read(id)).snapshot).toEqual(result.snapshot);
    const a=make(),b=make(),race=await Promise.allSettled([
      a.reset(id,{expectedVersion:2}),b.saveWorkspace(id,{expectedVersion:2,workspace:{...workspace,search:'변경'}})]);
    // A post-write recomputation can also lose to a later winner; exactly one database write commits.
    expect((await make().read(id)).profile.version).toBe(3);
    expect(race.some(r=>r.status==='rejected'&&r.reason instanceof DemoProfileConflict)).toBe(true);
    const clean=await make().reset(id,{expectedVersion:3});
    expect(clean.profile.workspace).toEqual(blankDemoProfileWorkspace());
    expect(clean.snapshot.workspace).toEqual(blankDemoProfileWorkspace());
    await expect(make().saveWorkspace(id,{expectedVersion:2,workspace})).rejects.toBeInstanceOf(DemoProfileConflict);
    expect((await make().read('SYN-DEMO-WORKSPACE-OTHER')).profile.version).toBe(0);
    await expect(admin.query('UPDATE api_demo_profiles SET version=version WHERE actor_id=$1',[id]))
      .rejects.toMatchObject({code:'23514'});
  });
  it('enforces FORCE RLS for the least-privilege role and denies cross-actor reads/writes/deletion',async()=>{
    const flags=await admin.query("SELECT c.relrowsecurity,c.relforcerowsecurity,r.rolsuper,r.rolbypassrls FROM pg_class c,pg_roles r WHERE c.oid='api_demo_profiles'::regclass AND r.rolname=$1",[role]);
    expect(flags.rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true,rolsuper:false,rolbypassrls:false});
    expect((await limited.query('SELECT actor_id FROM api_demo_profiles')).rows).toEqual([]);
    const c=await limited.connect();
    try{
      await c.query('BEGIN');await c.query("SELECT set_config('hufs.demo_profile_actor','SYN-DEMO-OWNER-B',true)");
      expect((await c.query("SELECT actor_id FROM api_demo_profiles WHERE actor_id='SYN-DEMO-OWNER-A'")).rows).toEqual([]);
      expect((await c.query("UPDATE api_demo_profiles SET value_json=value_json WHERE actor_id='SYN-DEMO-OWNER-A' RETURNING actor_id")).rows).toEqual([]);
      await expect(c.query(`INSERT INTO api_demo_profiles(actor_id,version,value_json,last_operation,last_expected_version)
        VALUES('SYN-DEMO-FORGED',1,$1,$2,0)`,[A,'a'.repeat(64)])).rejects.toMatchObject({code:'42501'});
    }finally{await c.query('ROLLBACK');c.release();}
    await expect(limited.query('DELETE FROM api_demo_profiles')).rejects.toMatchObject({code:'42501'});
    expect((await admin.query("SELECT to_regclass('api_self_profiles') AS personal")).rows[0]?.personal).toBeNull();
  });
  it('proves browser → authenticated Fastify → actual PG18 → HTTP restart → actor revocation',async()=>{
    const origin='https://synthetic.invalid',clock='2026-11-03T00:00:00.000Z';
    const team={role:'BETA' as const,actorId:'SYN-DEMO-REAL-E2E-A',
      sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
      schoolMailProofExpiresAt:'2026-12-01T00:00:00.000Z',
      sessionExpiresAt:'2026-12-01T00:00:00.000Z'};
    let identity:VerifiedActor|null=team;
    const launch=()=>createIntegratedApi({allowedOrigin:origin,
      repository:new MemoryApiRepository({profiles:[]}),
      auth:{verifySession:async()=>identity,revokeSession:async()=>{identity=null;}},
      now:()=>clock,
      demoProfile:new DemoProfileService(new PostgresDemoProfileStore(adapter(limited))),
    });
    let app=launch();
    // Browser API uses the real integrated Fastify handler. Only host fetch is
    // adapted to Fastify inject; storage is PostgreSQL18, not a memory fake.
    const browser=()=>new HufsApiClient(async(url,init)=>{
      const headers:Record<string,string>={};
      new Headers(init.headers).forEach((v,k)=>{headers[k]=v;});
      const response=await app.inject({url,method:init.method??'GET',
        headers:{...headers,origin,cookie:'SYN-HTTP-SESSION'},
        ...(init.body===undefined?{}:{payload:JSON.parse(String(init.body))})});
      return new Response(response.body,{status:response.statusCode,
        headers:{'content-type':'application/json'}});
    });
    try{
      const a=browser(),guard=new OwnerSessionController(a);
      await guard.initialize();expect(guard.getState().status).toBe('READY');
      const first=await guard.runLatest('empty-demo',signal=>a.owner.readDemoProfile(signal));
      expect(first?.profile).toMatchObject({version:0,value:blankDemoProfileValue()});
      const written=await guard.runMutation(signal=>a.owner.saveDemoProfile({
        expectedVersion:0,value:A},signal));
      expect(written?.profile.version).toBe(1);
      expect(written?.profile.value.earnedCreditUnits).toBe(0);
      expect(written?.snapshot.version).toBe(1);
      expect(written?.snapshot.namespace).toBe('EMPTY_DEMO');
      // Session flips while the A controller remains open. A's session scope
      // must refuse before trying to read actor B's new empty row.
      identity={...team,actorId:'SYN-DEMO-REAL-E2E-B'};
      expect(await guard.runLatest('empty-demo',signal=>a.owner.readDemoProfile(signal))).toBeNull();
      expect(guard.getState().status).toBe('SIGNED_OUT');
      expect((await browser().owner.readDemoProfile()).profile.version).toBe(0);
      // HTTP server restarted; PG connection/actor data survives the process.
      await app.close();app=launch();
      identity=team;
      const restarted=browser(),saved=await restarted.owner.readDemoProfile();
      expect(saved.profile).toEqual(written?.profile);
      expect(saved.snapshot).toEqual(written?.snapshot);
      const reset=await restarted.owner.resetDemoProfile({expectedVersion:1});
      expect(reset.profile.version).toBe(2);
      expect(reset.profile.value).toEqual(blankDemoProfileValue());
      expect((await browser().owner.readDemoProfile()).profile.version).toBe(2);
      // Revocation and REVIEWER never fall back to owner storage.
      identity=null;
      await expect(browser().owner.readDemoProfile()).rejects.toMatchObject({code:'UNAUTHENTICATED'});
      identity={role:'REVIEWER',actorId:'SYN-E2E-REVIEWER',
        sessionIdHash:'R'.repeat(32),csrfToken:'C'.repeat(32),
        sessionExpiresAt:team.sessionExpiresAt,verifiedEmail:'reviewer@example.invalid',
        identityProofExpiresAt:team.sessionExpiresAt};
      await expect(browser().owner.readDemoProfile()).rejects.toMatchObject({code:'FORBIDDEN'});
    }finally{await app.close();}
  });

});
