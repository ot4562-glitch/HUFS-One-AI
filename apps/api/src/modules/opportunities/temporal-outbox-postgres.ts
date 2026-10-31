import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';

/**
 * Pure server data adapter: does not create a connection, background worker,
 * NCP resource, external request or cache client until supplied explicitly.
 */
export const REVISION_CACHE_TARGETS=[
  'RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE',
] as const;
export type RevisionCacheTarget=(typeof REVISION_CACHE_TARGETS)[number];
const ValidTarget=z.enum(REVISION_CACHE_TARGETS);
const LeaseRow=z.object({
  event_id:z.string().min(1).max(200),
  target:ValidTarget,
  source_id:z.string().min(1).max(128),
  previous_revision_id:z.string().nullable(),
  new_revision_id:z.string().min(1).max(128),
  permission_policy_version:z.string().min(1).max(200),
  reason:z.enum(['CORRECTED','EXTENDED','CANCELLED','RIGHTS_REVOKED','VERIFICATION_STALE']),
  attempt_count:z.number().int().min(1),
  lease_token:z.string().uuid(),
});
export interface LeasedInvalidation {
  eventId:string;
  target:RevisionCacheTarget;
  sourceId:string;
  previousRevisionId:string|null;
  newRevisionId:string;
  permissionPolicyVersion:string;
  reason:z.infer<typeof LeaseRow>['reason'];
  attempt:number;
  leaseToken:string;
}
/**
 * At-least-once callback. A handler MUST deduplicate (eventId,target) and
 * fail closed if its current source head/policy differs from this revision.
 * No AI source text or user content is ever placed in the outbox.
 */
export type InvalidationHandler=(delivery:Readonly<LeasedInvalidation>)=>Promise<void>;

const CLAIM_SQL=[
  'WITH due AS (',
  'SELECT event_id,target FROM source_invalidation_deliveries',
  'WHERE target=ANY($4::text[]) AND (',
  "(state='PENDING' AND next_attempt_at<=clock_timestamp()) OR",
  "(state='LEASED' AND lease_until<=clock_timestamp()))",
  'ORDER BY next_attempt_at,event_id,target',
  'LIMIT $1::integer FOR UPDATE SKIP LOCKED',
  '), claimed AS (',
  'UPDATE source_invalidation_deliveries AS d',
  "SET state='LEASED',lease_token=$2::uuid,",
  "lease_until=clock_timestamp()+($3::integer * interval '1 second'),",
  'attempt_count=d.attempt_count+1',
  'FROM due WHERE d.event_id=due.event_id AND d.target=due.target',
  'RETURNING d.event_id,d.target,d.attempt_count,d.lease_token',
  ') SELECT c.event_id,c.target,c.attempt_count,c.lease_token,',
  'e.source_id,e.previous_revision_id,e.new_revision_id,',
  'e.permission_policy_version,e.reason',
  'FROM claimed c JOIN source_invalidation_events e ON e.event_id=c.event_id',
].join(' ');

/**
 * Durable, retryable delivery. Concurrent consumers claim with SKIP LOCKED.
 * A lease timeout makes crashed jobs visible again; token-fenced acknowledgement
 * prevents an old worker from declaring a newer consumer's delivery completed.
 */
export class PostgresRevisionInvalidationOutbox {
  constructor(private readonly pool:ReviewerSqlPool){}

  private async execute(sql:string,params:readonly unknown[]){
    const connection=await this.pool.connect();
    try{return await connection.query(sql,params);}
    finally{connection.release();}
  }

  async claim(input:{
    targets:readonly RevisionCacheTarget[];
    limit?:number;
    leaseSeconds?:number;
  }):Promise<LeasedInvalidation[]>{
    const limit=input.limit??10,seconds=input.leaseSeconds??60;
    if(!Number.isInteger(limit)||limit<1||limit>25
      ||!Number.isInteger(seconds)||seconds<10||seconds>300
      ||!input.targets.length
      ||input.targets.some(target=>!ValidTarget.safeParse(target).success))
      throw new Error('Invalid invalidation lease request');
    const unique=[...new Set(input.targets)];
    const token=randomUUID();
    const result=await this.execute(CLAIM_SQL,[limit,token,seconds,unique]);
    if(result.rows.length>limit)throw new Error('Invalid invalidation lease result');
    return result.rows.map(value=>{
      const row=LeaseRow.parse(value);
      if(!unique.includes(row.target)||row.lease_token!==token)
        throw new Error('Invalid invalidation lease ownership');
      return {
        eventId:row.event_id,target:row.target,sourceId:row.source_id,
        previousRevisionId:row.previous_revision_id,
        newRevisionId:row.new_revision_id,
        permissionPolicyVersion:row.permission_policy_version,
        reason:row.reason,attempt:row.attempt_count,leaseToken:row.lease_token,
      };
    });
  }

  async acknowledge(item:LeasedInvalidation):Promise<void>{
    const sql=[
      'UPDATE source_invalidation_deliveries',
      "SET state='DELIVERED',delivered_at=clock_timestamp(),",
      'lease_token=NULL,lease_until=NULL,last_error_code=NULL',
      "WHERE event_id=$1 AND target=$2 AND state='LEASED'",
      'AND lease_token=$3::uuid AND lease_until>clock_timestamp()',
      'RETURNING event_id',
    ].join(' ');
    const result=await this.execute(sql,[item.eventId,item.target,item.leaseToken]);
    if(result.rows.length!==1)
      throw new Error('Invalidation lease expired before acknowledgement');
  }

  async scheduleRetry(item:LeasedInvalidation):Promise<void>{
    const delay=Math.min(3600,2**Math.min(12,item.attempt));
    const sql=[
      'UPDATE source_invalidation_deliveries',
      "SET state='PENDING',next_attempt_at=clock_timestamp()",
      "+($4::integer * interval '1 second'),",
      "lease_token=NULL,lease_until=NULL,last_error_code='HANDLER_FAILURE'",
      "WHERE event_id=$1 AND target=$2 AND state='LEASED'",
      'AND lease_token=$3::uuid RETURNING event_id',
    ].join(' ');
    const result=await this.execute(sql,[
      item.eventId,item.target,item.leaseToken,delay,
    ]);
    if(result.rows.length!==1)throw new Error('Invalidation lease lost before retry');
  }

  async runBatch(
    handlers:Partial<Record<RevisionCacheTarget,InvalidationHandler>>,
    limit=10,
  ):Promise<{claimed:number;delivered:number;retryScheduled:number}>{
    const targets=REVISION_CACHE_TARGETS.filter(t=>typeof handlers[t]==='function');
    if(!targets.length)return {claimed:0,delivered:0,retryScheduled:0};
    const items=await this.claim({targets,limit});
    let delivered=0,retryScheduled=0;
    for(const item of items){
      try{
        await handlers[item.target]!(item);
        await this.acknowledge(item);
        delivered++;
      }catch{
        // Handler or acknowledgement failure: do not claim completion.
        // The handler must be safe to re-run when the outcome was ambiguous.
        await this.scheduleRetry(item);
        retryScheduled++;
      }
    }
    return {claimed:items.length,delivered,retryScheduled};
  }
}
