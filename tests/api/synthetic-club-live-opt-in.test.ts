/** Actual isolated PG18 proof. SYNTHETIC only; preserve all pre-existing
 * databases/roles. No reset, drop, deployment, real invitation or student data. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {SyntheticClubContent} from '@hufs-one/contracts';
import {PostgresSyntheticClubStore} from '../../apps/api/src/modules/opportunities/synthetic-club-postgres.js';
import {SyntheticClubConflict,SyntheticClubDenied} from '../../apps/api/src/modules/opportunities/synthetic-club-publication.js';
import {FileSyntheticClubPosterStore} from '../../apps/api/src/modules/opportunities/synthetic-club-posters.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';
import {createIntegratedApi} from '../../apps/api/src/integration.js';
import {MemoryApiRepository} from '../../apps/api/src/repository.js';
import {HufsApiClient} from '../../apps/web/src/integrations/api-client.js';
import {OwnerSessionController} from '../../apps/web/src/app/owner-session-controller.js';
import type {VerifiedActor} from '../../apps/api/src/types.js';

const RUN=process.env.HUFS_PG_SYNTHETIC_CLUB_LIVE==='1';
const role='hufs_test_synthetic_club',password=randomBytes(24).toString('hex'),pools:Pool[]=[];
const source='SYNTHETIC_CLUB_DEMO_V1',asOf='2026-11-20T00:00:00.000Z';
let admin:Pool,limited:Pool;
const pool=(url:URL)=>{const p=new Pool({connectionString:url.toString(),ssl:false,max:4,
  connectionTimeoutMillis:3000,statement_timeout:5000});pools.push(p);return p;};
const adapter=(p:Pool):ReviewerSqlPool=>({connect:async()=>{const c=await p.connect();return {
  query:async(sql,params=[])=>({rows:(await c.query(sql,[...params])).rows}),release:()=>c.release()};}});
const make=()=>new PostgresSyntheticClubStore(adapter(limited),{sourceRef:source});
const profileA={interestTopics:['AI_ML','DATA_ANALYTICS'],approvedExperienceTopics:[],desiredActivities:['PROJECT','STUDY'],campus:'SEOUL',facts:{}};
const profileB={interestTopics:['CULTURE_TOURISM'],approvedExperienceTopics:[],desiredActivities:['CREATION'],campus:'GLOBAL',facts:{}};
const content:SyntheticClubContent={clubName:'가상동아리 AI 탐험대',summary:'합성 로봇 프로젝트 시연',category:'IT_AI',campus:'SEOUL',
  topicCodes:['AI_ML','DATA_ANALYTICS'],activities:['PROJECT','STUDY'],conditions:[],
  recruitClosesAt:'2026-11-22T00:00:00.000Z',posterAssetId:'SYN-POSTER-CLUB-090',dataMode:'SYNTHETIC'};
const scope={adminActorId:'SYN-CLUB-ADMIN',now:asOf,assertCurrentAdmin:async()=>true};

describe.skipIf(!RUN)('REAL PG18 synthetic clubs publication, RLS and private generated poster',()=>{
  beforeAll(async()=>{
    const raw=process.env.HUFS_PG_SYNTHETIC_CLUB_URL;
    if(!raw)throw Error('Explicit isolated synthetic-club PostgreSQL URL required');
    const url=new URL(raw);
    if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='15439'
      ||url.pathname!=='/hufs_one_synthetic_club_test'||url.username!=='hufs_local_admin'||url.search||url.hash)
      throw Error('Refusing non-owned/non-loopback/non-synthetic-club database');
    const controlUrl=new URL(url);controlUrl.pathname='/postgres';const control=pool(controlUrl);
    const info=await control.query("SELECT current_user AS who,current_setting('server_version_num')::int AS version,host(inet_server_addr()) AS host,inet_server_port() AS port");
    if(info.rows[0]?.who!=='hufs_local_admin'||info.rows[0]?.version<180000
      ||info.rows[0]?.host!=='127.0.0.1'||info.rows[0]?.port!==15439)throw Error('Owned loopback PG18 not established');
    if((await control.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rows.length)
      throw Error('Preserve existing synthetic-club test role; no overwrite authorized');
    if(!(await control.query("SELECT 1 FROM pg_database WHERE datname='hufs_one_synthetic_club_test'")).rows.length)
      await control.query('CREATE DATABASE hufs_one_synthetic_club_test');
    admin=pool(url);
    const objects=await admin.query("SELECT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace)+(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace) AS n");
    if(Number(objects.rows[0]?.n)!==0)throw Error('Preserve nonempty synthetic-club database; no reset authorized');
    await admin.query(readFileSync(new URL('../../infra/sql/20261105_synthetic_club_publication.sql',import.meta.url),'utf8'));
    await admin.query(`CREATE ROLE hufs_test_synthetic_club LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO hufs_test_synthetic_club;
      GRANT SELECT ON synthetic_club_grants,synthetic_club_catalog,synthetic_club_posts,synthetic_club_audit TO hufs_test_synthetic_club;
      GRANT UPDATE(lock_version) ON synthetic_club_grants TO hufs_test_synthetic_club;
      GRANT UPDATE(revision) ON synthetic_club_catalog TO hufs_test_synthetic_club;
      GRANT INSERT,UPDATE ON synthetic_club_posts TO hufs_test_synthetic_club;
      GRANT INSERT ON synthetic_club_audit TO hufs_test_synthetic_club;
      GRANT SELECT,INSERT,DELETE ON synthetic_club_read_receipts TO hufs_test_synthetic_club;
      GRANT EXECUTE ON FUNCTION synthetic_club_active(text) TO hufs_test_synthetic_club;`);
    await admin.query('INSERT INTO synthetic_club_catalog(source_ref,as_of) VALUES($1,$2)',[source,asOf]);
    for(const [actor,actorRole,profile] of [['SYN-CLUB-ADMIN','ADMIN',null],['SYN-CLUB-A','BETA',profileA],['SYN-CLUB-B','BETA',profileB]]){
      await admin.query(`INSERT INTO synthetic_club_grants(actor_id,source_ref,role,profile_json,starts_at,ends_at)
        VALUES($1,$2,$3,$4::jsonb,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`,
        [actor,source,actorRole,profile===null?null:JSON.stringify(profile)]);
    }
    const target=new URL(url);target.username=role;target.password=password;limited=pool(target);
  },30000);
  afterAll(async()=>{await Promise.all(pools.map(p=>p.end()));},10000);

  it('connects browser API to durable approval, restart, personalized board and protected exact PNG',async()=>{
    const origin='https://synthetic.invalid',base={sessionIdHash:'H'.repeat(32),csrfToken:'C'.repeat(32),betaAllowed:true,
      schoolMailProofExpiresAt:'2099-01-01T00:00:00Z',sessionExpiresAt:'2099-01-01T00:00:00Z'};
    let identity:VerifiedActor|null={...base,actorId:scope.adminActorId,role:'ADMIN'};
    const assetRoot=new URL('../../packages/fixtures/synthetic/clubs/generated/',import.meta.url);
    const posters=new FileSyntheticClubPosterStore(fileURLToPath(assetRoot),JSON.parse(readFileSync(new URL('manifest.json',assetRoot),'utf8')));
    const launch=()=>{const store=make();return createIntegratedApi({allowedOrigin:origin,
      repository:new MemoryApiRepository({profiles:[]}),now:()=>new Date().toISOString(),
      auth:{verifySession:async()=>identity,revokeSession:async()=>{identity=null;}},adminAuthority:{isApproved:async()=>true},
      syntheticClubs:{source:store.source,publication:store.publication,moderation:store.moderation,posters}});};
    let app=launch();
    const api=new HufsApiClient(async(url,init)=>{
      const headers:Record<string,string>={};new Headers(init.headers).forEach((v,k)=>{headers[k]=v;});
      const response=await app.inject({url,method:init.method??'GET',headers:{...headers,origin,cookie:'SYN-CLUB-HTTP'},
        ...(init.body===undefined?{}:{payload:JSON.parse(String(init.body))})});
      return new Response(response.body,{status:response.statusCode,headers:{'content-type':'application/json'}});
    });
    try{
      expect((await api.owner.createSyntheticClub({id:'SYN-CLUB-090',content})).record.post.state).toBe('REVIEW_PENDING');
      await api.owner.createSyntheticClub({id:'SYN-CLUB-091',content:{...content,clubName:'가상동아리 문화 제작소',
        category:'CULTURE_ART',campus:'GLOBAL',topicCodes:['CULTURE_TOURISM'],activities:['CREATION'],posterAssetId:'SYN-POSTER-CLUB-091'}});
      identity={...base,actorId:'SYN-CLUB-A',role:'BETA'};
      expect((await app.inject({url:'/api/synthetic/clubs/SYN-CLUB-090/poster'})).statusCode).toBe(403);
      identity={...base,actorId:scope.adminActorId,role:'ADMIN'};
      await api.owner.decideSyntheticClub('SYN-CLUB-090',{expectedVersion:1,decision:'APPROVE'});
      await api.owner.decideSyntheticClub('SYN-CLUB-091',{expectedVersion:1,decision:'APPROVE'});
      await app.close();app=launch();identity={...base,actorId:'SYN-CLUB-A',role:'BETA'};
      const guard=new OwnerSessionController(api);await guard.initialize();
      const board=await guard.runLatest('clubs',signal=>api.owner.listSyntheticClubs(signal));
      expect(board?.recommendedIds).toEqual(['SYN-CLUB-090']);
      const detail=await api.owner.getSyntheticClub('SYN-CLUB-090');
      expect(detail.poster?.sha256).toBe('93446df5cc9a2859585e4801df7a74b7f602d71ae8084a4a51f5b563855af842');
      const image=await app.inject({url:detail.poster!.href});
      expect(image.statusCode).toBe(200);expect(image.rawPayload.equals(readFileSync(new URL('ai-club-poster-v1.png',assetRoot)))).toBe(true);
      expect(image.headers['cache-control']).toBe('no-store');
      identity={...base,actorId:'SYN-CLUB-B',role:'BETA'};
      expect((await api.owner.listSyntheticClubs()).recommendedIds).toEqual(['SYN-CLUB-091']);
      expect(await guard.runLatest('clubs',signal=>api.owner.listSyntheticClubs(signal))).toBeNull();
      identity={...base,actorId:scope.adminActorId,role:'ADMIN'};
      await api.owner.editSyntheticClub('SYN-CLUB-090',{expectedVersion:2,content:{...content,summary:'재검토할 합성 내용'}});
      identity={...base,actorId:'SYN-CLUB-A',role:'BETA'};
      expect((await api.owner.listSyntheticClubs()).items.some(x=>x.post.id==='SYN-CLUB-090')).toBe(false);
      expect((await app.inject({url:'/api/synthetic/clubs/SYN-CLUB-090/poster'})).statusCode).toBe(403);
      identity={...base,actorId:scope.adminActorId,role:'ADMIN'};
      await api.owner.decideSyntheticClub('SYN-CLUB-090',{expectedVersion:3,decision:'APPROVE'});
      await api.owner.decideSyntheticClub('SYN-CLUB-090',{expectedVersion:4,decision:'REVOKE'});
      identity={...base,actorId:'SYN-CLUB-A',role:'BETA'};
      expect((await api.owner.listSyntheticClubs()).recommendedIds).toEqual([]);
      identity=null;expect((await app.inject({url:'/api/synthetic/clubs'})).statusCode).toBe(401);
    }finally{await app.close();}
  },30000);

  it('enforces FORCE RLS and narrow column privileges for BETA, foreign source, grant and audit writes',async()=>{
    const flags=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolsuper,r.rolbypassrls
      FROM pg_class c,pg_roles r WHERE c.relname=ANY($1) AND r.rolname=$2`,
      [['synthetic_club_grants','synthetic_club_catalog','synthetic_club_posts','synthetic_club_audit','synthetic_club_read_receipts'],role]);
    expect(flags.rows).toHaveLength(5);
    expect(flags.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity&&!r.rolsuper&&!r.rolbypassrls)).toBe(true);
    expect((await limited.query('SELECT actor_id FROM synthetic_club_grants')).rows).toEqual([]);
    const c=await limited.connect();
    try{
      await c.query('BEGIN');await c.query("SELECT set_config('hufs.club_actor','SYN-CLUB-A',true),set_config('hufs.club_role','BETA',true),set_config('hufs.club_source',$1,true)",[source]);
      expect((await c.query("SELECT actor_id FROM synthetic_club_grants WHERE actor_id='SYN-CLUB-B'")).rows).toEqual([]);
      expect((await c.query("SELECT club_id FROM synthetic_club_posts WHERE club_id='SYN-CLUB-090'")).rows).toEqual([]);
      expect((await c.query("UPDATE synthetic_club_posts SET record_json=record_json WHERE club_id='SYN-CLUB-091' RETURNING club_id")).rows).toEqual([]);
      await expect(c.query("UPDATE synthetic_club_grants SET role='ADMIN' WHERE actor_id='SYN-CLUB-A'")).rejects.toMatchObject({code:'42501'});
    }finally{await c.query('ROLLBACK');c.release();}
    await expect(limited.query('DELETE FROM synthetic_club_posts')).rejects.toMatchObject({code:'42501'});
    await expect(limited.query("UPDATE synthetic_club_catalog SET as_of=clock_timestamp()")).rejects.toMatchObject({code:'42501'});
    await expect(limited.query('UPDATE synthetic_club_audit SET actor_id=actor_id')).rejects.toMatchObject({code:'42501'});
    await expect(new PostgresSyntheticClubStore(adapter(limited),{sourceRef:'SYNTHETIC_OTHER_V1'}).publication.list(scope)).rejects.toBeInstanceOf(SyntheticClubDenied);
  });

  it('serializes competing edits, keeps immutable metadata audit and rolls back lost independent authority',async()=>{
    await make().publication.create({...scope,postId:'SYN-CLUB-092',content});
    const results=await Promise.allSettled(['first','second'].map(summary=>make().publication.edit({...scope,
      postId:'SYN-CLUB-092',expectedVersion:1,content:{...content,summary}})));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected'&&r.reason instanceof SyntheticClubConflict)).toHaveLength(1);
    let checks=0;
    await expect(make().publication.edit({...scope,postId:'SYN-CLUB-092',expectedVersion:2,content:{...content,summary:'must roll back'},
      assertCurrentAdmin:async()=>++checks===1})).rejects.toBeInstanceOf(SyntheticClubDenied);
    const list=await make().publication.list(scope) as {records:Array<{post:{id:string;summary:string};version:number}>};
    expect(list.records.find(r=>r.post.id==='SYN-CLUB-092')?.version).toBe(2);
    expect(list.records.find(r=>r.post.id==='SYN-CLUB-092')?.post.summary).not.toBe('must roll back');
    const audit=await admin.query("SELECT version,action,actor_id,actor_role FROM synthetic_club_audit WHERE club_id='SYN-CLUB-092' ORDER BY version");
    expect(audit.rows.map(r=>[Number(r.version),r.action,r.actor_id,r.actor_role])).toEqual([[1,'CREATE',scope.adminActorId,'ADMIN'],[2,'EDIT',scope.adminActorId,'ADMIN']]);
    expect((await admin.query("SELECT column_name FROM information_schema.columns WHERE table_name='synthetic_club_audit'")).rows.map(r=>r.column_name)).not.toContain('record_json');
  });

  it('invalidates receipts after same-actor profile/grant changes including change-and-restore, expiry and replay',async()=>{
    const read=()=>make().source.read({actorId:'SYN-CLUB-A',now:asOf});
    const validate=(r:NonNullable<Awaited<ReturnType<typeof read>>>)=>make().source.revalidate({actorId:'SYN-CLUB-A',receipt:r.receipt,revision:r.revision,now:asOf});
    const before=await read();expect(before).not.toBeNull();
    await admin.query("UPDATE synthetic_club_grants SET profile_json=$1::jsonb WHERE actor_id='SYN-CLUB-A' AND source_ref=$2",[JSON.stringify(profileB),source]);
    await admin.query("UPDATE synthetic_club_grants SET profile_json=$1::jsonb WHERE actor_id='SYN-CLUB-A' AND source_ref=$2",[JSON.stringify(profileA),source]);
    expect(await validate(before!)).toBe(false);
    const valid=await read();expect(await validate(valid!)).toBe(true);expect(await validate(valid!)).toBe(false);
    const expired=await read();await admin.query("UPDATE synthetic_club_read_receipts SET expires_at=clock_timestamp()-interval '1 second' WHERE actor_id='SYN-CLUB-A'");
    expect(await validate(expired!)).toBe(false);
    const changed=await read();await admin.query("UPDATE synthetic_club_catalog SET as_of=as_of+interval '1 second' WHERE source_ref=$1",[source]);
    expect(await validate(changed!)).toBe(false);
  });

  it('refuses expired persistent grants and direct SQL attempts to retain approval while changing content',async()=>{
    await admin.query("UPDATE synthetic_club_grants SET starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' WHERE actor_id='SYN-CLUB-B'");
    await expect(make().source.read({actorId:'SYN-CLUB-B',now:asOf})).rejects.toBeInstanceOf(SyntheticClubDenied);
    const c=await limited.connect();
    try{
      await c.query('BEGIN');await c.query("SELECT set_config('hufs.club_actor',$1,true),set_config('hufs.club_role','ADMIN',true),set_config('hufs.club_source',$2,true)",[scope.adminActorId,source]);
      const previous=(await c.query("SELECT record_json FROM synthetic_club_posts WHERE club_id='SYN-CLUB-091'")).rows[0]?.record_json;
      const head=(await c.query('SELECT as_of FROM synthetic_club_catalog WHERE source_ref=$1',[source])).rows[0];
      const forged={...previous,version:previous.version+1,asOf:new Date(head!.as_of).toISOString(),recordedAt:new Date().toISOString(),
        post:{...previous.post,summary:'unreviewed replacement'}};
      await expect(c.query("UPDATE synthetic_club_posts SET version=$1,record_json=$2::jsonb WHERE source_ref=$3 AND club_id='SYN-CLUB-091'",
        [forged.version,JSON.stringify(forged),source])).rejects.toMatchObject({code:'23514'});
    }finally{await c.query('ROLLBACK');c.release();}
  });
});
