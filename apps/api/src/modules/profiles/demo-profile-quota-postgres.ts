import {createHmac} from 'node:crypto';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import type {DemoProfileQuotaPort} from './demo-profile-http.js';

export class DemoProfileQuotaUnavailable extends Error {
  constructor(){super('Demo profile quota unavailable');this.name='DemoProfileQuotaUnavailable';}
}

const Actor=/^[A-Za-z0-9_.:@-]{3,128}$/;
const Mode=new Set(['READ','WRITE']);
/**
 * Cross-replica, atomic actor quota. The PostgreSQL server chooses the current
 * minute; this client never submits a browser clock or a usable student ID.
 *
 * The operator must review/apply the paired SQL migration and grant EXECUTE to
 * a minimally authorized API role. No migration or connection occurs here.
 */
export class PostgresDemoProfileQuota implements DemoProfileQuotaPort {
  private readonly key:Buffer;

  constructor(private readonly pool:ReviewerSqlPool,digestKey:Buffer){
    if(typeof pool?.connect!=='function'
      ||!Buffer.isBuffer(digestKey)||digestKey.length<32)
      throw new DemoProfileQuotaUnavailable();
    this.key=Buffer.from(digestKey);
  }

  async consume(actorId:string,mode:'READ'|'WRITE'):Promise<boolean>{
    if(typeof actorId!=='string'||!Actor.test(actorId)||!Mode.has(mode))
      throw new DemoProfileQuotaUnavailable();
    const identity=createHmac('sha256',this.key)
      .update('hufs-one:demo-profile:actor:v1\0').update(actorId,'utf8').digest('hex');
    let connection:Awaited<ReturnType<ReviewerSqlPool['connect']>>;
    try{connection=await this.pool.connect();}
    catch{throw new DemoProfileQuotaUnavailable();}
    try{
      const result=await connection.query(
        'SELECT public.consume_demo_profile_quota($1::char(64),$2::text) AS allowed',
        [identity,mode]);
      if(result.rows.length!==1||typeof result.rows[0]?.allowed!=='boolean')
        throw new DemoProfileQuotaUnavailable();
      return result.rows[0].allowed;
    }catch{throw new DemoProfileQuotaUnavailable();}
    finally{connection.release();}
  }
}
