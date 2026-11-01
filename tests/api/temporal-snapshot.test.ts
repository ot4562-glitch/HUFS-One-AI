import {describe,expect,it} from 'vitest';
import {PostgresTemporalEvidenceReader} from
  '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import type {ReviewerSqlConnection} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const asOf='2026-10-31T00:00:00.000Z';
const policy={
  query:'데이터 모집',asOf,topK:12,
  permissionRefs:new Set(['perm-synthetic']),campus:'SEOUL',
};
const resultRow={
  source_id:'source-1',revision_id:'rev-1',
  paragraph_id:'p1',paragraph_text:'합성 데이터 모집',score:2,
};
function fake(options:{
  empty?:boolean;
  conflict?:boolean;
  fail?:'BEGIN'|'SELECT'|'COMMIT';
}={}){
  const calls:string[]=[];
  const released:number[]=[];
  let inTransaction=false,consistentSnapshot=false;
  const connection:ReviewerSqlConnection={
    query:async(sql)=>{
      calls.push(sql);
      if(sql.startsWith('BEGIN')){
        if(options.fail==='BEGIN')throw Error('synthetic begin failure');
        inTransaction=true;
        consistentSnapshot=sql.includes('REPEATABLE READ')&&sql.includes('READ ONLY');
        return {rows:[]};
      }
      if(sql==='COMMIT'){
        if(options.fail==='COMMIT')throw Error('synthetic commit failure');
        inTransaction=false;
        return {rows:[]};
      }
      if(sql==='ROLLBACK'){inTransaction=false;return {rows:[]};}
      if(options.fail==='SELECT')throw Error('synthetic read failure');
      if(sql.includes('AS confirmed_conflict'))return {rows:[{
        // Mimics another transaction committing a new conflict between reads.
        // Only a REPEATABLE READ snapshot preserves the initial no-conflict view.
        confirmed_conflict:options.conflict??!consistentSnapshot,
      }]};
      if(sql.includes('FROM scoped'))return {rows:[{
        blocked_rights:false,stale:false,unknown:false,
      }]};
      return {rows:options.empty?[]:[resultRow]};
    },
    release:()=>{released.push(1);},
  };
  return {reader:new PostgresTemporalEvidenceReader({connect:async()=>connection}),
    calls,released,isOpen:()=>inTransaction};
}
describe('TASK-21 consistent, short, read-only PostgreSQL retrieval snapshot',()=>{
  it('keeps evidence and conflict decisions on the same REPEATABLE READ snapshot',async()=>{
    const x=fake();
    const r=await x.reader.retrieve(policy);
    expect(r.envelope.retrievalState).toBe('READY');
    expect(r.hits).toHaveLength(1);
    expect(x.calls[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(x.calls.at(-1)).toBe('COMMIT');
    expect(x.calls.filter(s=>s.includes('WITH latest'))).toHaveLength(2);
    expect(x.released).toHaveLength(1);
    expect(x.isOpen()).toBe(false);
  });
  it('does not skip COMMIT on an empty response or reviewed CONFLICT',async()=>{
    for(const options of [{empty:true},{conflict:true}]){
      const x=fake(options);
      const result=await x.reader.retrieve(policy);
      expect(result.hits).toHaveLength(0);
      if(options.conflict)expect(result.envelope.retrievalState).toBe('CONFLICT');
      expect(x.calls[0]).toContain('READ ONLY');
      expect(x.calls.at(-1)).toBe('COMMIT');
      expect(x.released).toHaveLength(1);
    }
  });
  it('rolls back a failed SELECT and releases the dedicated connection',async()=>{
    const x=fake({fail:'SELECT'});
    await expect(x.reader.retrieve(policy)).rejects.toThrow('Temporal retrieval unavailable');
    expect(x.calls[0]).toContain('REPEATABLE READ');
    expect(x.calls.at(-1)).toBe('ROLLBACK');
    expect(x.released).toHaveLength(1);
    expect(x.isOpen()).toBe(false);
  });
  it('rolls back a failed COMMIT, never returning uncommitted evidence',async()=>{
    const x=fake({fail:'COMMIT'});
    await expect(x.reader.retrieve(policy)).rejects.toThrow('Temporal retrieval unavailable');
    expect(x.calls.at(-2)).toBe('COMMIT');
    expect(x.calls.at(-1)).toBe('ROLLBACK');
    expect(x.released).toHaveLength(1);
  });
  it('does not attempt SQL reads after a BEGIN failure',async()=>{
    const x=fake({fail:'BEGIN'});
    await expect(x.reader.retrieve(policy)).rejects.toThrow('Temporal retrieval unavailable');
    expect(x.calls).toHaveLength(1);
    expect(x.released).toHaveLength(1);
  });
  it('never acquires a connection for an actor with no permission',async()=>{
    const x=fake();
    const response=await x.reader.retrieve({...policy,permissionRefs:new Set()});
    expect(response.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(x.calls).toHaveLength(0);
    expect(x.released).toHaveLength(0);
  });
});
