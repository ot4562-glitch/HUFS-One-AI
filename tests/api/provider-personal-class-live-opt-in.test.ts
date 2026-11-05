import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {buildExperienceSkillPacket} from '../../apps/api/src/modules/ai/experience-skill-packet.js';

const RUN=process.env.HUFS_PG_FULL_LIVE==='1';
const token=randomBytes(6).toString('hex');
const database='hufs_one_personal_contract_'+token,role='hufs_personal_reader_'+token;
let admin:Pool|undefined,db:Pool|undefined,created=false,roleCreated=false;
function isolatedUrl():URL{
  const raw=process.env.HUFS_PG_FULL_URL;
  if(!raw)throw new Error('Disposable full-suite URL required');
  const u=new URL(raw);
  if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)
    ||u.pathname!=='/hufs_one_full_test'||u.search||u.hash||!u.username)
    throw new Error('Refusing a non-local, non-disposable PostgreSQL target');
  return u;
}

describe.skipIf(!RUN)('REAL disposable PostgreSQL: approved personal input class',()=>{
  beforeAll(async()=>{
    const url=isolatedUrl();admin=new Pool({connectionString:url.toString(),ssl:false,max:1,connectionTimeoutMillis:3000});
    await admin.query(`CREATE DATABASE ${database}`);created=true;
    url.pathname='/'+database;
    db=new Pool({connectionString:url.toString(),ssl:false,max:2,connectionTimeoutMillis:3000});
    await db.query(`CREATE TABLE public.api_self_consents(actor_id text PRIMARY KEY,version bigint NOT NULL,
      choices_json jsonb NOT NULL,updated_at timestamptz NOT NULL);
      CREATE TABLE public.source_revisions_vnext(revision_id text PRIMARY KEY,source_id text NOT NULL,
        UNIQUE(source_id,revision_id));
      CREATE TABLE public.api_self_workspace_records(actor_id text NOT NULL,kind text NOT NULL,
        item_id text NOT NULL,version bigint NOT NULL,value_json jsonb NOT NULL,
        updated_at timestamptz NOT NULL,deleted_at timestamptz,
        PRIMARY KEY(actor_id,kind,item_id));`);
    for(const file of ['20261103_ai_provider_inputs.sql','20261105_ai_consented_personal_inputs.sql','20261105_ai_experience_bindings.sql'])
      await db.query(readFileSync(new URL('../../infra/sql/'+file,import.meta.url),'utf8'));
    await db.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);roleCreated=true;
    await db.query(`GRANT USAGE ON SCHEMA public TO ${role};
      GRANT SELECT ON api_ai_provider_inputs,api_ai_provider_input_heads,api_ai_experience_bindings TO ${role};`);
  });
  afterAll(async()=>{
    await db?.end();
    if(admin){
      if(created)await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
      if(roleCreated)await admin.query(`DROP ROLE ${role}`);
      await admin.end();
    }
  });
  it('stores approved personal data honestly, preserves actor RLS and erases after a later individual withdrawal',async()=>{
    const actor='SYN-PERSONAL-OWNER',stamp=new Date(Date.now()-1000).toISOString();
    await db!.query('INSERT INTO api_self_consents VALUES($1,1,$2,$3)',[actor,JSON.stringify({personalStorage:true,externalAi:true}),stamp]);
    const record={itemId:'SYN-EXP',version:1,updatedAt:stamp,value:{
      kind:'EXPERIENCE' as const,dataMode:'OWNER_CONSENTED' as const,state:'SELF_REPORTED' as const,
      title:'Synthetic named owner experience',summary:'Reviewed record'}};
    const packet=buildExperienceSkillPacket({
      packetId:'SYNTHETIC_PERSONAL_PACKET_0001',experience:record});
    await db!.query('INSERT INTO source_revisions_vnext(revision_id,source_id) VALUES($1,$2)',
      ['SYN-REV','SYN-SOURCE']);
    await db!.query(`INSERT INTO api_self_workspace_records
      (actor_id,kind,item_id,version,value_json,updated_at) VALUES($1,'EXPERIENCE',$2,1,$3,$4)`,
      [actor,record.itemId,JSON.stringify(record.value),stamp]);
    await db!.query(`INSERT INTO api_ai_provider_inputs(projection_id,actor_id,input_ref,operation,as_of,epoch,
      policy_version,consent_version,approved_by,approved_at,expires_at,input_class,privacy_review_ref,source_refs,safe_packet)
      VALUES('SYN-PROJECTION',$1,'SYN-INPUT','HCX_007',$2,'E1','P1','1','PROJECT-OWNER',$2,
      clock_timestamp()+interval '1 hour','PERSONAL_CONSENTED_CLEARED','OWNER-CONFIRMED-APPROVED',$3,$4)`,
      [actor,stamp,JSON.stringify([{sourceId:'SYN-SOURCE',revisionId:'SYN-REV',permissionRef:'SYN-PERM',originalSha256:'a'.repeat(64)}]),JSON.stringify(packet)]);
    await db!.query('INSERT INTO api_ai_provider_input_heads VALUES($1,$2,$3,$4)',[actor,'SYN-INPUT','HCX_007','SYN-PROJECTION']);
    await db!.query(`INSERT INTO api_ai_experience_bindings
      (projection_id,actor_id,experience_id,content_version,consent_version,
      input_ref,operation,source_id,source_revision_id,approved_by,approved_at)
      VALUES ('SYN-PROJECTION',$1,$2,1,1,'SYN-INPUT','HCX_007','SYN-SOURCE',
        'SYN-REV','PROJECT-OWNER',$3)`,[actor,record.itemId,stamp]);
    const client=await db!.connect();
    try{
      await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
      await client.query("SELECT set_config('hufs.self_actor',$1,true)",['SYN-OTHER']);
      expect((await client.query('SELECT * FROM api_ai_provider_inputs')).rows).toEqual([]);
      expect((await client.query('SELECT * FROM api_ai_experience_bindings')).rows).toEqual([]);
      await client.query("SELECT set_config('hufs.self_actor',$1,true)",[actor]);
      const row=(await client.query('SELECT input_class,safe_packet FROM api_ai_provider_inputs')).rows[0];
      expect(row.input_class).toBe('PERSONAL_CONSENTED_CLEARED');expect(row.safe_packet).toEqual(packet);
      const bindings=(await client.query('SELECT experience_id,content_version,consent_version FROM api_ai_experience_bindings')).rows;
      expect(bindings).toMatchObject([{experience_id:record.itemId,content_version:'1',consent_version:'1'}]);
      await client.query('ROLLBACK');
    }finally{await client.query('ROLLBACK');client.release();}
    await expect(db!.query("UPDATE api_ai_experience_bindings SET content_version=2 WHERE projection_id='SYN-PROJECTION'"))
      .rejects.toThrow();
    await db!.query("UPDATE api_self_workspace_records SET version=2,updated_at=clock_timestamp() WHERE actor_id=$1",
      [actor]);
    const changed=(await db!.query(`SELECT b.content_version AS bound_version,
      r.version AS actual_version FROM api_ai_experience_bindings b
      JOIN api_self_workspace_records r ON r.actor_id=b.actor_id AND r.item_id=b.experience_id
      WHERE b.actor_id=$1`,[actor])).rows[0];
    expect(changed.bound_version).toBe('1');expect(changed.actual_version).toBe('2');
    await db!.query("UPDATE api_self_consents SET version=2,choices_json=choices_json||'{\"externalAi\":false}'::jsonb,updated_at=clock_timestamp() WHERE actor_id=$1",[actor]);
    const erased=(await db!.query('SELECT safe_packet,media_bytes,erased_at FROM api_ai_provider_inputs WHERE actor_id=$1',[actor])).rows[0];
    expect(erased.safe_packet).toBeNull();expect(erased.media_bytes).toBeNull();expect(erased.erased_at).not.toBeNull();
    await expect(db!.query('UPDATE api_ai_provider_inputs SET safe_packet=$1,erased_at=NULL WHERE actor_id=$2',[JSON.stringify(packet),actor]))
      .rejects.toThrow();
  });
});
