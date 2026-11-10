/** #447: shared PostgreSQL limit for BETA owner V2 catalog reads.
 * A separately reviewed SQL migration, policy row and EXECUTE grant are needed.
 * Digest and purpose are server-only; no student identity goes into quota rows.
 */
import {createHmac} from 'node:crypto';
import type {ReviewerSqlPool} from './auth/reviewer-postgres.js';
import type {TrustedOwnerV2SearchQuota} from './owner-v2-catalog-http.js';

const Actor=/^[A-Za-z0-9_.:@-]{1,128}$/;
const IsoOffset=/(?:Z|[+-]\d{2}:\d{2})$/i;
export class OwnerV2CatalogQuotaUnavailable extends Error{
  constructor(){super('Owner catalog search quota unavailable');this.name='OwnerV2CatalogQuotaUnavailable';}
}
export class PostgresOwnerV2CatalogQuota implements TrustedOwnerV2SearchQuota{
  private readonly key:Buffer;
  constructor(private readonly pool:ReviewerSqlPool,digestKey:Buffer){
    if(typeof pool?.connect!=='function'||!Buffer.isBuffer(digestKey)||digestKey.length<32)
      throw new OwnerV2CatalogQuotaUnavailable();
    this.key=Buffer.from(digestKey);
  }
  async consume(input:{actorId:string;now:string;operation:'V2_CATALOG_SEARCH'}):Promise<boolean>{
    if(typeof input?.actorId!=='string'||!Actor.test(input.actorId)
      ||input.operation!=='V2_CATALOG_SEARCH'
      ||typeof input.now!=='string'||!IsoOffset.test(input.now)
      ||!Number.isFinite(Date.parse(input.now)))
      throw new OwnerV2CatalogQuotaUnavailable();
    const digest=createHmac('sha256',this.key)
      .update('hufs-one:owner-v2-catalog:actor:v1\0')
      .update(input.actorId,'utf8').digest('hex');
    let connection:Awaited<ReturnType<ReviewerSqlPool['connect']>>;
    try{connection=await this.pool.connect();}
    catch{throw new OwnerV2CatalogQuotaUnavailable();}
    try{
      const value=await connection.query(
        'SELECT public.consume_owner_v2_catalog_quota($1::char(64)) AS allowed',[digest]);
      if(value.rows.length!==1||typeof value.rows[0]?.allowed!=='boolean')
        throw new OwnerV2CatalogQuotaUnavailable();
      return value.rows[0].allowed;
    }catch{throw new OwnerV2CatalogQuotaUnavailable();}
    finally{connection.release();}
  }
}
