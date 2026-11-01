import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {PostgresSourceRevisionWriter} from '../../apps/api/src/modules/opportunities/temporal-writer-postgres.js';
import {hashRevisionParagraphs} from '../../apps/api/src/modules/opportunities/revision-ledger.js';

const original=Buffer.from('<p>synthetic immutable original</p>');
const paragraphs=[{id:'p1',text:'synthetic immutable original'}];
const input={revision:{revisionId:'revision-1',sourceId:'source-1',
  originalSha256:createHash('sha256').update(original).digest('hex'),
  contentSha256:hashRevisionParagraphs(paragraphs),mediaKind:'HTML',
  sourceClass:'SYNTHETIC',permissionRef:'permission-1',provenance:'SYNTHETIC',
  status:'NEEDS_REVIEW',changeKind:'NEW',topicCodes:[],
  fetchedAt:'2026-11-01T00:00:00.000Z',lastCheckedAt:'2026-11-01T00:00:00.000Z',
},paragraphs,originalBytes:original,permissionReviewed:true};
function harness(failOriginal=false,onConnect=()=>{}){
  const queries:Array<{sql:string;params:readonly unknown[]}>=[];
  const writer=new PostgresSourceRevisionWriter({connect:async()=>{onConnect();return {
    query:async(sql,params=[])=>{
      queries.push({sql,params});
      if(sql.includes('SELECT revision_id,fetched_at'))return {rows:[{revision_id:null,fetched_at:null}]};
      if(sql.includes('INSERT INTO source_originals_vnext')&&failOriginal)throw new Error('original unavailable');
      if(sql.includes('UPDATE source_ingest_heads'))return {rows:[{source_id:'source-1'}]};
      return {rows:[]};
    },release:()=>{},
  };}});
  return {writer,queries};
}
describe('durable original preservation',()=>{
  it('persists exact original bytes with the immutable revision before publishing its head',async()=>{
    const x=harness();await x.writer.append(input);
    const originalWrite=x.queries.find(q=>q.sql.includes('INSERT INTO source_originals_vnext'));
    expect(originalWrite).toBeDefined();
    expect(originalWrite!.params).toEqual(['revision-1',input.revision.originalSha256,original,input.revision.fetchedAt]);
    expect(x.queries.indexOf(originalWrite!)).toBeLessThan(x.queries.findIndex(q=>q.sql.includes('UPDATE source_ingest_heads')));
    expect(x.queries.at(-1)!.sql).toBe('COMMIT');
  });
  it('rolls back revision and head publication if the original cannot be retained',async()=>{
    const x=harness(true);
    await expect(x.writer.append(input)).rejects.toThrow('original unavailable');
    expect(x.queries.at(-1)!.sql).toBe('ROLLBACK');
    expect(x.queries.some(q=>q.sql.includes('UPDATE source_ingest_heads'))).toBe(false);
  });
  it('retains the validated byte snapshot if a caller mutates its buffer during asynchronous SQL',async()=>{
    const mutable=Buffer.from(original),x=harness(false,()=>mutable.fill(0));
    await x.writer.append({...input,originalBytes:mutable});
    const persisted=x.queries.find(q=>q.sql.includes('INSERT INTO source_originals_vnext'))!;
    expect(persisted.params[2]).toEqual(original);
  });
});
