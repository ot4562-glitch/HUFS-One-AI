import {describe,expect,it,vi} from 'vitest';
import {PostgresApprovedOwnerReader} from
  '../../apps/api/src/modules/opportunities/owner-catalog-postgres.js';
import type {ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const at='2026-11-11T02:00:00.000Z';
const actorId='SYN-OWNER-MVCC';
const goodSnapshot='00000004-0000001B-1';

function fixture(snapshotId=goodSnapshot){
  const exporter:string[]=[],importer:string[]=[];
  const released:string[]=[];
  const connection=(kind:'exporter'|'importer')=>({
    query:vi.fn(async(sql:string)=>{
      const calls=kind==='exporter'?exporter:importer;
      calls.push(sql);
      if(sql.includes('pg_export_snapshot'))
        return {rows:[{snapshot_id:snapshotId}]};
      if(sql.includes('FROM api_self_consents'))
        return {rows:[{version:'SYN-CONSENT-1',
          choices_json:{personalStorage:true},updated_at:at}]};
      return {rows:[]};
    }),
    release:()=>{released.push(kind);},
  });
  let n=0;
  const pool:ReviewerSqlPool={connect:async()=>{
    const c=connection(n++===0?'exporter':'importer');
    return c;
  }};
  const authority={resolve:async()=>({
    permissionRefs:new Set(['SYN-PERM']),sourceIds:new Set(['SYN-SOURCE']),
    policyVersion:'SYN-POLICY',sourceHeadVersion:'SYN-HEAD',
  })};
  const reader=new PostgresApprovedOwnerReader(pool,authority,()=>at);
  return {reader,exporter,importer,released};
}

describe('#447 PostgreSQL snapshot import protocol and cleanup (offline)',()=>{
  it('imports exporter snapshot before any RLS/consent query',async()=>{
    const f=fixture();
    const result=await f.reader.withV2KeysetSnapshot({actorId,asOf:at},at,
      async readPage=>{
        const first=await readPage({pageSize:20});
        expect(first?.rows).toEqual([]);
        expect(first?.hasMore).toBe(false);
        return 'COMPLETE';
      });
    expect(result).toBe('COMPLETE');
    expect(f.exporter[0]).toContain('BEGIN TRANSACTION');
    expect(f.exporter.some(s=>s.includes('SELECT pg_export_snapshot()'))).toBe(true);
    expect(f.exporter.some(s=>s.includes("idle_in_transaction_session_timeout='30s'"))).toBe(true);
    expect(f.importer[0]).toContain('BEGIN TRANSACTION');
    expect(f.importer[1]).toBe("SET TRANSACTION SNAPSHOT '"+goodSnapshot+"'");
    expect(f.importer[2]).toContain('statement_timeout');
    expect(f.importer.some(s=>s.includes('FROM api_self_consents'))).toBe(true);
    expect(f.exporter.at(-1)).toBe('ROLLBACK');
    expect(f.importer.at(-1)).toBe('COMMIT');
    expect(f.released).toEqual(['importer','exporter']);
  });
  it('always releases the snapshot exporter on failure and never retries without it',async()=>{
    const f=fixture();
    await expect(f.reader.withV2KeysetSnapshot({actorId,asOf:at},at,
      async()=>{throw new Error('synthetic aborted scan');}))
      .rejects.toThrow('synthetic aborted scan');
    expect(f.exporter.at(-1)).toBe('ROLLBACK');
    expect(f.released).toEqual(['exporter']);
    expect(f.importer).toEqual([]);
  });
  it('rejects untrusted snapshot export IDs before any page import',async()=>{
    const f=fixture("00000004-0000001B-1';DELETE FROM api_self_consents;--");
    await expect(f.reader.withV2KeysetSnapshot({actorId,asOf:at},at,
      async()=>{throw new Error('should not execute');}))
      .rejects.not.toThrow('should not execute');
    expect(f.released).toEqual(['exporter']);
    expect(f.exporter.at(-1)).toBe('ROLLBACK');
    expect(f.importer).toHaveLength(0);
  });
});
