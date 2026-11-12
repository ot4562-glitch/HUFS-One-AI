import {describe,expect,it,vi} from 'vitest';
import {PostgresApprovedOwnerReader} from
  '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const at='2026-11-11T02:00:00.000Z';
const actorId='SYN-OWNER-MVCC';

/** Fake PostgreSQL protocol with a strictly bounded pool. No DB/network access. */
function fixture(maxClients=5){
  let active=0,peak=0,connects=0,releases=0,policyVersion='SYN-POLICY';
  const commands:string[][]=[];
  const authority={
    resolve:vi.fn(async()=>({
      permissionRefs:new Set(['SYN-PERM']),sourceIds:new Set(['SYN-SOURCE']),
      policyVersion,sourceHeadVersion:'SYN-HEAD',
    })),
  };
  const pool:ReviewerSqlPool={connect:async()=>{
    if(active>=maxClients)throw new Error('SYNTHETIC_POOL_EXHAUSTED');
    active++;peak=Math.max(peak,active);connects++;
    const sqls:string[]=[];commands.push(sqls);
    return {query:vi.fn(async(sql:string)=>{
      sqls.push(sql);
      if(sql.includes('FROM api_self_consents'))return {rows:[{
        version:'SYN-CONSENT-1',choices_json:{personalStorage:true},updated_at:at,
      }]};
      return {rows:[]};
    }),release:()=>{active--;releases++;}};
  }};
  const reader=new PostgresApprovedOwnerReader(pool,authority,()=>at);
  return {reader,authority,commands,
    setPolicy:(next:string)=>{policyVersion=next;},
    metrics:()=>({active,peak,connects,releases}),
  };
}

describe('#472 one-connection pinned MVCC protocol (synthetic SQL)',()=>{
  it('reads sequential keyset pages through exactly one transaction and client',async()=>{
    const f=fixture();
    const out=await f.reader.withV2KeysetSnapshot({actorId,asOf:at},at,
      async readPage=>{
        const a=await readPage({pageSize:1});
        const b=await readPage({pageSize:1,afterEntityId:'SYN-FIRST'});
        expect(a?.rows).toEqual([]);
        expect(b?.hasMore).toBe(false);
        return 'COMPLETE';
      });
    expect(out).toBe('COMPLETE');
    expect(f.metrics()).toEqual({active:0,peak:1,connects:1,releases:1});
    const sql=f.commands[0]!;
    expect(sql[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(sql.filter(s=>s.includes('FROM api_self_consents'))).toHaveLength(2);
    expect(sql.filter(s=>s.includes('SELECT set_config('))).toHaveLength(2);
    expect(sql.some(s=>s.includes("idle_in_transaction_session_timeout='30s'"))).toBe(true);
    expect(sql.some(s=>s.includes('pg_export_snapshot')||s.includes('SET TRANSACTION SNAPSHOT'))).toBe(false);
    expect(sql.filter(s=>s==='COMMIT')).toHaveLength(0);
    expect(sql.at(-1)).toBe('ROLLBACK');
    expect(f.authority.resolve).toHaveBeenCalledTimes(2);
  });

  it('five simultaneous scans complete on a five-client pool without needing a sixth',async()=>{
    const f=fixture(5);
    const completed=await Promise.all(Array.from({length:5},(_,i)=>
      f.reader.withV2KeysetSnapshot({actorId,asOf:at},at,async readPage=>{
        expect((await readPage({pageSize:10}))?.hasMore).toBe(false);
        await Promise.resolve(); // overlap pinned scans before cleanup
        return i;
      })));
    expect(completed).toEqual([0,1,2,3,4]);
    expect(f.metrics()).toEqual({active:0,peak:5,connects:5,releases:5});
    expect(f.commands.every(sql=>sql.at(-1)==='ROLLBACK')).toBe(true);
  });

  it('fails closed on authority revision change after releasing SQL client',async()=>{
    const f=fixture();
    await expect(f.reader.withV2KeysetSnapshot({actorId,asOf:at},at,
      async readPage=>{
        expect(await readPage({pageSize:10})).not.toBeNull();
        f.setPolicy('SYN-REVOKED-AUTHORITY');
        return 'FORBIDDEN';
      })).resolves.toBeNull();
    expect(f.metrics()).toMatchObject({active:0,connects:1,releases:1});
    expect(f.commands[0]!.at(-1)).toBe('ROLLBACK');
  });

  it('rolls back and releases the sole client if any page or callback fails',async()=>{
    const f=fixture();
    await expect(f.reader.withV2KeysetSnapshot({actorId,asOf:at},at,
      async readPage=>{
        await readPage({pageSize:10});
        throw new Error('SYNTHETIC_CANCELLED_SCAN');
      })).rejects.toThrow('SYNTHETIC_CANCELLED_SCAN');
    expect(f.metrics()).toMatchObject({active:0,connects:1,releases:1});
    expect(f.commands[0]!.at(-1)).toBe('ROLLBACK');
  });

  it('does not acquire a client if policy authority cannot be established',async()=>{
    const f=fixture();
    f.authority.resolve.mockResolvedValueOnce(null as never);
    await expect(f.reader.withV2KeysetSnapshot({actorId,asOf:at},at,
      async()=> 'SHOULD_NOT_RUN')).resolves.toBeNull();
    expect(f.metrics().connects).toBe(0);
  });
});
