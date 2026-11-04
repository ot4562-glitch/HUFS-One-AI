import {describe,it,expect,vi} from 'vitest';
import {PostgresDemoProfileQuota,DemoProfileQuotaUnavailable} from '../../apps/api/src/modules/profiles/demo-profile-quota-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const key=Buffer.alloc(32,7);
describe('shared PostgreSQL demo-profile quota',()=>{
  it('is inert until consume, hashes the actor, and uses the fixed SQL entrypoint',async()=>{
    const query=vi.fn(async(_sql:string,_params?:readonly unknown[])=>({rows:[{allowed:true}]}));
    const release=vi.fn();
    const connect=vi.fn(async()=>({query,release}));
    const quota=new PostgresDemoProfileQuota({connect},key);
    expect(connect).not.toHaveBeenCalled();
    expect(await quota.consume('synthetic:owner-a','WRITE')).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledOnce();
    const [sql,params]=query.mock.calls[0]!;
    expect(sql).toBe('SELECT public.consume_demo_profile_quota($1::char(64),$2::text) AS allowed');
    expect(params?.[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(params?.[0]).not.toBe('synthetic:owner-a');
    expect(params?.[1]).toBe('WRITE');
  });

  it('uses the same digest across replicas and distinct digests for distinct actors',async()=>{
    const digests:string[]=[];
    const pool:ReviewerSqlPool={connect:async()=>({
      query:async(_sql,params)=>{digests.push(String(params?.[0]));return {rows:[{allowed:true}]};},
      release:()=>{},
    })};
    const first=new PostgresDemoProfileQuota(pool,key);
    const second=new PostgresDemoProfileQuota(pool,Buffer.alloc(32,7));
    await first.consume('synthetic:owner-a','READ');
    await second.consume('synthetic:owner-a','WRITE');
    await second.consume('synthetic:owner-b','READ');
    expect(digests[0]).toBe(digests[1]);
    expect(digests[0]).not.toBe(digests[2]);
  });

  it('preserves database denial and fails closed on failed/malformed queries',async()=>{
    const quota=new PostgresDemoProfileQuota({connect:async()=>({
      query:async()=>({rows:[{allowed:false}]}),release:()=>{},
    })},key);
    expect(await quota.consume('synthetic:owner-a','READ')).toBe(false);
    const broken=new PostgresDemoProfileQuota({connect:async()=>({
      query:async()=>({rows:[{allowed:'true'}]}),release:()=>{},
    })},key);
    await expect(broken.consume('synthetic:owner-a','READ'))
      .rejects.toBeInstanceOf(DemoProfileQuotaUnavailable);
    const disconnected=new PostgresDemoProfileQuota({
      connect:async()=>{throw new Error('offline');},
    },key);
    await expect(disconnected.consume('synthetic:owner-a','READ'))
      .rejects.toBeInstanceOf(DemoProfileQuotaUnavailable);
  });

  it('rejects weak keys, forged actor identities, and invalid operation names',async()=>{
    expect(()=>new PostgresDemoProfileQuota({connect:async()=>{throw Error();}},Buffer.alloc(8)))
      .toThrow(DemoProfileQuotaUnavailable);
    const pool:ReviewerSqlPool={connect:async()=>{throw Error('should not connect');}};
    const quota=new PostgresDemoProfileQuota(pool,key);
    await expect(quota.consume('a b','READ')).rejects.toBeInstanceOf(DemoProfileQuotaUnavailable);
    await expect(quota.consume('synthetic:owner-a','WRONG' as never))
      .rejects.toBeInstanceOf(DemoProfileQuotaUnavailable);
  });
});
