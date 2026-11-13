import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';

const Ref=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@-]+$/);
const MAX_RESPONSE=256*1024;
const Policy=z.strictObject({sourceId:Ref,origin:z.string().url(),
  sourceDailyRequests:z.number().int().min(1).max(10000),
  sourceDailyBytes:z.number().int().min(MAX_RESPONSE).max(10*1024**3),
  originDailyRequests:z.number().int().min(1).max(10000),
  originDailyBytes:z.number().int().min(MAX_RESPONSE).max(10*1024**3),
});
export type SourceRefreshBudgetPolicy=z.infer<typeof Policy>;
export interface TrustedSourceRefreshBudget {
  /** SQL adapters expose pool identity so production composition can reject
   * reuse of the queue connection held for the lifetime of a running lease. */
  readonly connectionPool?:ReviewerSqlPool;
  reserve(input:{sourceId:string;permissionRef:string;canonicalUrl:string;now:string}):Promise<boolean>;
}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function fail():never{throw new Error('Source refresh budget unavailable');}

/** Private operator limits, not request fields. Counts attempts and reserves the
 * full 256 KiB maximum before HTTP, including 304/failure. No refunds after an
 * uncertain outcome, no retry, no implication of source rights or NCP credit.
 * The SQL function's clock defines UTC days, independently of caller time. */
export class PostgresSourceRefreshBudget implements TrustedSourceRefreshBudget {
  private readonly policies=new Map<string,SourceRefreshBudgetPolicy>();
  get connectionPool():ReviewerSqlPool{return this.pool;}
  constructor(private readonly pool:ReviewerSqlPool,raw:readonly SourceRefreshBudgetPolicy[]){
    try{
      const policies=Policy.array().min(1).max(50).parse(raw);
      const origins=new Map<string,string>();
      for(const policy of policies){
        const origin=new URL(policy.origin);
        if(origin.protocol!=='https:'||origin.origin!==policy.origin||origin.username||origin.password
          ||origin.port||this.policies.has(policy.sourceId))fail();
        const limits=JSON.stringify([policy.originDailyRequests,policy.originDailyBytes]);
        if(origins.has(policy.origin)&&origins.get(policy.origin)!==limits)fail();
        origins.set(policy.origin,limits);this.policies.set(policy.sourceId,policy);
      }
      if(typeof pool?.connect!=='function')fail();
    }catch{fail();}
  }
  async reserve(input:Parameters<TrustedSourceRefreshBudget['reserve']>[0]):Promise<boolean>{
    let c:Awaited<ReturnType<ReviewerSqlPool['connect']>>|undefined,open=false;
    try{
      Ref.parse(input.sourceId);Ref.parse(input.permissionRef);z.iso.datetime({offset:true}).parse(input.now);
      const policy=this.policies.get(input.sourceId),url=new URL(input.canonicalUrl);
      if(!policy||url.origin!==policy.origin||url.href!==input.canonicalUrl||url.hash||url.username||url.password)fail();
      c=await this.pool.connect();await c.query('BEGIN');open=true;
      await c.query("SET LOCAL lock_timeout='3s'");await c.query("SET LOCAL statement_timeout='5s'");
      const result=await c.query('SELECT public.reserve_source_refresh_budget($1,$2,$3,$4,$5,$6,$7) AS allowed',[
        'SOURCE:'+digest(policy.sourceId),'ORIGIN:'+digest(policy.origin),
        policy.sourceDailyRequests,policy.sourceDailyBytes,policy.originDailyRequests,policy.originDailyBytes,MAX_RESPONSE,
      ]);
      const allowed=result.rows[0]?.allowed;
      if(result.rows.length!==1||typeof allowed!=='boolean')return fail();
      await c.query('COMMIT');open=false;return allowed;
    }catch{
      if(c&&open)try{await c.query('ROLLBACK');}catch{/* no retry or private SQL output */}
      return fail();
    }finally{c?.release();}
  }
}
