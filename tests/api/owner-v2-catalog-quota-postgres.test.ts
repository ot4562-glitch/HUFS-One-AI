import {describe,it,expect,vi} from 'vitest';
import {PostgresOwnerV2CatalogQuota,OwnerV2CatalogQuotaUnavailable} from
  '../../apps/api/src/modules/owner-v2-catalog-quota-postgres.js';
import type {ReviewerSqlPool} from '../../apps/api/src/modules/auth/reviewer-postgres.js';

const key=Buffer.alloc(32,29),now='2026-11-11T00:00:00Z';
const request=(actorId:string,operation='V2_CATALOG_SEARCH')=>({
  actorId,operation:operation as 'V2_CATALOG_SEARCH',now,
});
describe('#447 durable owner catalog quota (synthetic SQL)',()=>{
  it('is side effect-free until called and sends keyed digest only',async()=>{
    const query=vi.fn(async(_sql:string,_values?:readonly unknown[])=>({rows:[{allowed:true}]}));
    const release=vi.fn(),connect=vi.fn(async()=>({query,release}));
    const port=new PostgresOwnerV2CatalogQuota({connect},key);
    expect(connect).not.toHaveBeenCalled();
    expect(await port.consume(request('SYN-OWNER-A'))).toBe(true);
    expect(connect).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    const [sql,params]=query.mock.calls[0]!;
    expect(sql).toBe('SELECT public.consume_owner_v2_catalog_quota($1::char(64)) AS allowed');
    expect(params?.[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(params?.[0]).not.toContain('SYN-OWNER-A');
  });
  it('has deterministic purpose-separated digests across replicas',async()=>{
    const seen:string[]=[];
    const pool:ReviewerSqlPool={connect:async()=>({
      query:async(_sql,params)=>{seen.push(String(params?.[0]));return {rows:[{allowed:true}]};},
      release:()=>{},
    })};
    await new PostgresOwnerV2CatalogQuota(pool,key).consume(request('SYN-OWNER-A'));
    await new PostgresOwnerV2CatalogQuota(pool,Buffer.alloc(32,29)).consume(request('SYN-OWNER-A'));
    await new PostgresOwnerV2CatalogQuota(pool,key).consume(request('SYN-OWNER-B'));
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]).not.toBe(seen[2]);
  });
  it('distinguishes true rate-limit denial from SQL configuration failure',async()=>{
    const pool=(rows:Record<string,unknown>[]):ReviewerSqlPool=>({connect:async()=>({
      query:async()=>({rows}),release:()=>{},
    })});
    expect(await new PostgresOwnerV2CatalogQuota(pool([{allowed:false}]),key)
      .consume(request('SYN-OWNER-A'))).toBe(false);
    for(const rows of [[{allowed:'true'}],[],[{allowed:true},{allowed:true}]]){
      await expect(new PostgresOwnerV2CatalogQuota(pool(rows),key).consume(request('SYN-OWNER-A')))
        .rejects.toBeInstanceOf(OwnerV2CatalogQuotaUnavailable);
    }
    const unconfigured:ReviewerSqlPool={connect:async()=>({
      query:async()=>{throw Error('owner catalog quota policy not configured');},
      release:()=>{},
    })};
    await expect(new PostgresOwnerV2CatalogQuota(unconfigured,key).consume(request('SYN-OWNER-A')))
      .rejects.toBeInstanceOf(OwnerV2CatalogQuotaUnavailable);
    const offline:ReviewerSqlPool={connect:async()=>{throw Error('connection unavailable');}};
    await expect(new PostgresOwnerV2CatalogQuota(offline,key).consume(request('SYN-OWNER-A')))
      .rejects.toBeInstanceOf(OwnerV2CatalogQuotaUnavailable);
  });
  it('rejects untrusted actor, request purpose, timestamp or weak key before SQL',async()=>{
    const pool:ReviewerSqlPool={connect:async()=>{throw Error('must not connect');}};
    expect(()=>new PostgresOwnerV2CatalogQuota(pool,Buffer.alloc(8)))
      .toThrow(OwnerV2CatalogQuotaUnavailable);
    const port=new PostgresOwnerV2CatalogQuota(pool,key);
    for(const input of [request('bad actor'),request('SYN-OWNER','OTHER'),
      {...request('SYN-OWNER'),now:'invalid'},
      {...request('SYN-OWNER'),now:'2026-11-11'},
    ]){
      await expect(port.consume(input)).rejects.toBeInstanceOf(OwnerV2CatalogQuotaUnavailable);
    }
  });
});
