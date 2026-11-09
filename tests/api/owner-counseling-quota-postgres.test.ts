import {describe,it,expect,vi} from 'vitest';
import {PostgresOwnerCounselingQuota,OwnerCounselingQuotaUnavailable} from
  '../../apps/api/src/modules/owner-counseling-quota-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const key=Buffer.alloc(32,13),now='2026-11-09T10:00:00Z';
const request=(actorId:string,operation='V2_OWNER_COUNSELING')=>({
  actorId,operation:operation as 'V2_OWNER_COUNSELING',now,
});
describe('#433 durable owner counseling quota PostgreSQL adapter',()=>{
  it('never connects during construction and passes only the keyed actor digest to SQL',async()=>{
    const query=vi.fn(async(_sql:string,_params?:readonly unknown[])=>({rows:[{allowed:true}]})),release=vi.fn();
    const connect=vi.fn(async()=>({query,release}));
    const quota=new PostgresOwnerCounselingQuota({connect},key);
    expect(connect).not.toHaveBeenCalled();
    expect(await quota.consume(request('SYN-OWNER-A'))).toBe(true);
    expect(connect).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    const [sql,params]=query.mock.calls[0]!;
    expect(sql).toBe('SELECT public.consume_owner_counseling_quota($1::char(64)) AS allowed');
    expect(params?.[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(params?.[0]).not.toContain('SYN-OWNER-A');
  });
  it('derives identical per-actor digests across replicas and different ones for other actors',async()=>{
    const digests:string[]=[];
    const pool:ReviewerSqlPool={connect:async()=>({
      query:async(_sql,params)=>{digests.push(String(params?.[0]));return {rows:[{allowed:true}]};},
      release:()=>{},
    })};
    await new PostgresOwnerCounselingQuota(pool,key).consume(request('SYN-OWNER-A'));
    await new PostgresOwnerCounselingQuota(pool,Buffer.alloc(32,13)).consume(request('SYN-OWNER-A'));
    await new PostgresOwnerCounselingQuota(pool,key).consume(request('SYN-OWNER-B'));
    expect(digests[0]).toBe(digests[1]);
    expect(digests[0]).not.toBe(digests[2]);
  });
  it('returns false from SQL denial and fails closed on unavailable/malformed SQL results',async()=>{
    const denied=new PostgresOwnerCounselingQuota({connect:async()=>({
      query:async()=>({rows:[{allowed:false}]}),release:()=>{},
    })},key);
    expect(await denied.consume(request('SYN-OWNER-A'))).toBe(false);
    const malformed=new PostgresOwnerCounselingQuota({connect:async()=>({
      query:async()=>({rows:[{allowed:'true'}]}),release:()=>{},
    })},key);
    await expect(malformed.consume(request('SYN-OWNER-A')))
      .rejects.toBeInstanceOf(OwnerCounselingQuotaUnavailable);
    const offline=new PostgresOwnerCounselingQuota({connect:async()=>{throw Error('offline');}},key);
    await expect(offline.consume(request('SYN-OWNER-A')))
      .rejects.toBeInstanceOf(OwnerCounselingQuotaUnavailable);
  });
  it('rejects weak keys, bad actor IDs, invalid operation, and invalid server times',async()=>{
    expect(()=>new PostgresOwnerCounselingQuota({connect:async()=>{throw Error();}},Buffer.alloc(8)))
      .toThrow(OwnerCounselingQuotaUnavailable);
    const pool:ReviewerSqlPool={connect:async()=>{throw Error('should not connect');}};
    const quota=new PostgresOwnerCounselingQuota(pool,key);
    for(const invalid of [request('bad actor'),request('SYN-OWNER-A','OTHER'),
      {...request('SYN-OWNER-A'),now:'wrong'}]){
      await expect(quota.consume(invalid)).rejects.toBeInstanceOf(OwnerCounselingQuotaUnavailable);
    }
  });
});
