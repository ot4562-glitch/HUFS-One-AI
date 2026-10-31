import {describe,expect,it} from 'vitest';
import {PostgresRevisionInvalidationOutbox} from
  '../../apps/api/src/modules/opportunities/temporal-outbox-postgres.js';
import type {ReviewerSqlConnection} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const fixture={
  event_id:'revision:rev-2',target:'RETRIEVAL',
  source_id:'source-1',previous_revision_id:'rev-1',
  new_revision_id:'rev-2',permission_policy_version:'policy-9',
  reason:'CANCELLED',attempt_count:1,
};
function harness(options:{claimRows?:Array<Record<string,unknown>>;
  rejectAck?:boolean;rejectRetry?:boolean}={}){
  const calls:Array<{sql:string;params:readonly unknown[]}>=[],releases:number[]=[];
  const connection:ReviewerSqlConnection={
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(sql.includes('FOR UPDATE SKIP LOCKED'))
        return {rows:(options.claimRows??[fixture]).map(row=>({
          ...row,lease_token:String(params[1]),
        }))};
      if(sql.includes("state='DELIVERED'"))
        return {rows:options.rejectAck?[]:[{event_id:'revision:rev-2'}]};
      if(sql.includes("state='PENDING',next_attempt_at="))
        return {rows:options.rejectRetry?[]:[{event_id:'revision:rev-2'}]};
      throw new Error('Unexpected SQL in synthetic outbox adapter');
    },
    release:()=>releases.push(1),
  };
  return {outbox:new PostgresRevisionInvalidationOutbox({
    connect:async()=>connection,
  }),calls,releases};
}
describe('TASK-19/21 synthetic durable cache outbox (NO live PostgreSQL)',()=>{
  it('claims subscribed targets with atomic SKIP LOCKED and bounded leases',async()=>{
    const x=harness();
    const items=await x.outbox.claim({targets:['RETRIEVAL'],limit:3,leaseSeconds:30});
    expect(items).toMatchObject([{
      eventId:'revision:rev-2',sourceId:'source-1',target:'RETRIEVAL',
      reason:'CANCELLED',attempt:1,
    }]);
    expect(x.calls[0]?.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(x.calls[0]?.sql).toContain('clock_timestamp()');
    expect(x.calls[0]?.params[0]).toBe(3);
    expect(x.calls[0]?.params[2]).toBe(30);
    expect(x.calls[0]?.params[3]).toEqual(['RETRIEVAL']);
    expect(x.releases).toHaveLength(1);
  });
  it('refuses unrecognized targets and excessive leases before a connection',async()=>{
    const x=harness();
    await expect(x.outbox.claim({targets:[]})).rejects.toThrow();
    await expect(x.outbox.claim({targets:['RETRIEVAL'],limit:26})).rejects.toThrow();
    await expect(x.outbox.claim({targets:['RETRIEVAL'],leaseSeconds:301})).rejects.toThrow();
    await expect(x.outbox.claim({targets:['HIDDEN' as 'RETRIEVAL']})).rejects.toThrow();
    expect(x.calls).toHaveLength(0);
  });
  it('uses lease fencing to acknowledge an idempotent handler success',async()=>{
    const x=harness(),seen:string[]=[];
    const result=await x.outbox.runBatch({
      RETRIEVAL:async item=>{seen.push(item.eventId+':'+item.target);},
    });
    expect(result).toEqual({claimed:1,delivered:1,retryScheduled:0});
    expect(seen).toEqual(['revision:rev-2:RETRIEVAL']);
    const ack=x.calls.find(c=>c.sql.includes("state='DELIVERED'"));
    expect(ack?.sql).toContain('lease_until>clock_timestamp()');
    expect(ack?.params[2]).toBe(x.calls[0]?.params[1]);
    expect(x.releases).toHaveLength(2);
  });
  it('retries a failed cache invalidation rather than losing the event',async()=>{
    const x=harness();
    const result=await x.outbox.runBatch({
      RETRIEVAL:async()=>{throw Error('synthetic outage');},
    });
    expect(result).toEqual({claimed:1,delivered:0,retryScheduled:1});
    const retry=x.calls.find(c=>c.sql.includes("last_error_code='HANDLER_FAILURE'"));
    expect(retry?.params[3]).toBe(2);
    expect(retry?.sql).toContain("state='LEASED'");
    expect(x.releases).toHaveLength(2);
  });
  it('does not hide a lost lease after a concurrent attempt',async()=>{
    const x=harness({rejectAck:true,rejectRetry:true});
    await expect(x.outbox.runBatch({RETRIEVAL:async()=>{}}))
      .rejects.toThrow(/lease lost/);
    // The claim CTE also contains UPDATE; count the standalone ACK/NACK
    // statements rather than matching the claim's inner UPDATE as well.
    expect(x.calls.filter(c=>c.sql.startsWith('UPDATE source_invalidation_deliveries')))
      .toHaveLength(2);
  });
  it('does not claim deliveries without an explicitly configured handler',async()=>{
    const x=harness();
    expect(await x.outbox.runBatch({})).toEqual({
      claimed:0,delivered:0,retryScheduled:0,
    });
    expect(x.calls).toHaveLength(0);
  });
  it('discards a forged delivery outside the claimed target set',async()=>{
    const x=harness({claimRows:[{...fixture,target:'FEED'}]});
    await expect(x.outbox.claim({targets:['RETRIEVAL']})).rejects.toThrow(/ownership/);
    expect(x.releases).toHaveLength(1);
  });
});
