/** #433: optional operator-owned PostgreSQL implementation of the durable counseling quota.
 * A reviewed migration + dedicated EXECUTE grant are required before connecting it to the API.
 * The actor digest is keyed, purpose-separated, and independent of a browser-provided value.
 */
import {createHmac} from 'node:crypto';
import type {ReviewerSqlPool} from './auth/reviewer-postgres.js';
import type {TrustedOwnerCounselingQuota} from './owner-counseling-http.js';

export class OwnerCounselingQuotaUnavailable extends Error {
  constructor(){super('Owner counseling quota unavailable');this.name='OwnerCounselingQuotaUnavailable';}
}
const Actor=/^[A-Za-z0-9_.:@-]{1,128}$/;
export class PostgresOwnerCounselingQuota implements TrustedOwnerCounselingQuota {
  private readonly key:Buffer;
  constructor(private readonly pool:ReviewerSqlPool,digestKey:Buffer){
    if(typeof pool?.connect!=='function'||!Buffer.isBuffer(digestKey)||digestKey.length<32)
      throw new OwnerCounselingQuotaUnavailable();
    this.key=Buffer.from(digestKey);
  }
  async consume(input:{actorId:string;operation:'V2_OWNER_COUNSELING';now:string}):Promise<boolean>{
    if(typeof input?.actorId!=='string'||!Actor.test(input.actorId)
      ||input.operation!=='V2_OWNER_COUNSELING'||!Number.isFinite(Date.parse(input.now))
      ||!/(?:Z|[+-]\\d\\d:\\d\\d)$/i.test(input.now))throw new OwnerCounselingQuotaUnavailable();
    const digest=createHmac('sha256',this.key)
      .update('hufs-one:owner-counseling:actor:v1\\0').update(input.actorId,'utf8').digest('hex');
    let c:Awaited<ReturnType<ReviewerSqlPool['connect']>>;
    try{c=await this.pool.connect();}
    catch{throw new OwnerCounselingQuotaUnavailable();}
    try{
      const result=await c.query(
        'SELECT public.consume_owner_counseling_quota($1::char(64)) AS allowed',[digest]);
      if(result.rows.length!==1||typeof result.rows[0]?.allowed!=='boolean')
        throw new OwnerCounselingQuotaUnavailable();
      return result.rows[0].allowed;
    }catch{throw new OwnerCounselingQuotaUnavailable();}
    finally{c.release();}
  }
}
