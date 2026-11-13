import {createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {hashRevisionParagraphs} from '../../apps/api/src/modules/opportunities/revision-ledger.js';
import {syntheticSourceRuntimeVersion} from './fixtures/source-runtime-version.js';
const bytes=Buffer.from('SYNTHETIC runtime receipt'),paragraphs=[{id:'p1',text:bytes.toString()}];
const revision={sourceId:'SYN-RUNTIME',revisionId:'SYN-REV',permissionRef:'SYN-PERM',
  originalSha256:createHash('sha256').update(bytes).digest('hex'),contentSha256:hashRevisionParagraphs(paragraphs),
  mediaKind:'TEXT',sourceClass:'SYNTHETIC',provenance:'SYNTHETIC',status:'NEEDS_REVIEW',changeKind:'NEW',
  fetchedAt:'2026-11-13T00:00:00Z',lastCheckedAt:'2026-11-13T00:00:00Z',topicCodes:[]};
function harness(fail=false,onConnect=()=>{}){
  const calls:{sql:string;params:readonly unknown[]}[]=[],connect=vi.fn(async()=>{onConnect();return {
    query:async(sql:string,params:readonly unknown[]=[])=>{
      calls.push({sql,params});
      if(sql.includes('source_ingest_runtime_receipts')&&fail)throw new Error('receipt unavailable');
      if(sql.includes('SELECT revision_id,fetched_at'))return {rows:[{revision_id:null,fetched_at:null}]};
      if(sql.includes('UPDATE source_ingest_heads'))return {rows:[{source_id:revision.sourceId}]};
      return {rows:[]};
    },release:()=>{},
  };});return {writer:new PostgresSourceRevisionWriter({connect}),calls,connect};
}
describe('#445/#449 transactional runtime receipts',()=>{
  it('stores the exact frozen manifest with a new original before commit',async()=>{
    const manifest=syntheticSourceRuntimeVersion().expected,x=harness(false,()=>{manifest.datasetRevision='SYN-MUTATED';});
    const expected={...manifest};
    await x.writer.append({revision,paragraphs,originalBytes:bytes,permissionReviewed:true,runtimeManifest:manifest});
    const receipt=x.calls.find(c=>c.sql.includes('INSERT INTO source_ingest_runtime_receipts'));
    expect(receipt).toBeDefined();expect(receipt!.params).toEqual([revision.sourceId,revision.revisionId,revision.fetchedAt,'REVISION',200,JSON.stringify(expected)]);
    expect(x.calls.at(-1)!.sql).toBe('COMMIT');
  });
  it.each([200,304] as const)('records the %s unchanged observation and runtime atomically',async responseStatus=>{
    const x=harness(),manifest=syntheticSourceRuntimeVersion().expected;
    await x.writer.observeUnchanged({sourceId:revision.sourceId,revisionId:revision.revisionId,
      checkedAt:revision.fetchedAt,responseStatus,runtimeManifest:manifest});
    expect(x.calls.find(c=>c.sql.includes('source_ingest_runtime_receipts'))!.params)
      .toEqual([revision.sourceId,revision.revisionId,revision.fetchedAt,'OBSERVATION',responseStatus,JSON.stringify(manifest)]);
    expect(x.calls.at(-1)!.sql).toBe('COMMIT');
  });
  it.each(['append','observe'] as const)('rolls back %s when its runtime receipt cannot persist',async mode=>{
    const x=harness(true),runtimeManifest=syntheticSourceRuntimeVersion().expected;
    await expect(mode==='append'?x.writer.append({revision,paragraphs,originalBytes:bytes,permissionReviewed:true,runtimeManifest})
      :x.writer.observeUnchanged({sourceId:revision.sourceId,revisionId:revision.revisionId,checkedAt:revision.fetchedAt,responseStatus:304,runtimeManifest}))
      .rejects.toThrow('receipt unavailable');
    expect(x.calls.at(-1)!.sql).toBe('ROLLBACK');expect(x.calls.some(c=>c.sql==='COMMIT')).toBe(false);
  });
  it('rejects invalid manifests before SQL, and leaves legacy data unlabelled',async()=>{
    const x=harness();await expect(x.writer.append({revision,paragraphs,originalBytes:bytes,permissionReviewed:true,runtimeManifest:{gitSha:'invalid'}})).rejects.toThrow();
    expect(x.connect).not.toHaveBeenCalled();
    await x.writer.append({revision,paragraphs,originalBytes:bytes,permissionReviewed:true});
    expect(x.calls.some(c=>c.sql.includes('source_ingest_runtime_receipts'))).toBe(false);
  });
});
