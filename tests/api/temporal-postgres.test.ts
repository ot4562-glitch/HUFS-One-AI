import {describe,expect,it} from 'vitest';
import {PostgresTemporalEvidenceReader} from
  '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import type {ReviewerSqlConnection,ReviewerSqlPool} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const ASOF='2026-10-31T00:00:00.000Z';
const policy={
  query:'데이터 모집',asOf:ASOF,
  permissionRefs:new Set(['permission-synthetic']),
  campus:'SEOUL',majorCode:'ECONOMICS',cohort:2023,
  topK:12,
};
function stub(rows:Record<string,unknown>[]){
  const calls:Array<{sql:string;args:readonly unknown[]}>=[],releases:number[]=[];
  const connection:ReviewerSqlConnection={
    query:async(sql,args=[])=>{
      // Transaction statements are covered in temporal-snapshot.test.ts;
      // keep existing query-only expectations focused on data SELECTs.
      if(sql.startsWith('BEGIN TRANSACTION ')||sql==='COMMIT'||sql==='ROLLBACK')
        return {rows:[]};
      calls.push({sql,args});
      if(sql.includes('AS confirmed_conflict'))
        return {rows:[{confirmed_conflict:false}]};
      return {rows};
    },
    release:()=>{releases.push(1);},
  };
  return {
    reader:new PostgresTemporalEvidenceReader({
      connect:async()=>connection,
    }),
    calls,releases,
  };
}
describe('TASK-21 PostgreSQL permission-first historical retrieval (SQL stub)',()=>{
  it('selects latest revision before ACTIVE/rights, and uses parameters for all external values',async()=>{
    const x=stub([{
      source_id:'source-01',revision_id:'revision-01',paragraph_id:'p1',
      paragraph_text:'합성 데이터 모집 공고',score:2,
    }]);
    const result=await x.reader.retrieve(policy);
    expect(result.envelope.retrievalState).toBe('READY');
    expect(result.hits).toHaveLength(1);
    expect(result.envelope.evidence[0]).toMatchObject({
      kind:'TEXT',sourceRevisionId:'revision-01',paragraphId:'p1',
    });
    const {sql,args}=x.calls[0]!;
    const latestSql=sql.split(')\n    SELECT')[0]!;
    expect(latestSql).toContain('DISTINCT ON (r.source_id)');
    expect(latestSql).not.toContain("status='ACTIVE'");
    expect(sql).toContain("l.status='ACTIVE'");
    expect(sql).toContain("l.permission_ref=ANY($2::text[])");
    expect(sql).toContain('l.last_verified_at<=$1::timestamptz');
    for(const column of ['scope_campuses','scope_majors','scope_colleges',
      'scope_major_roles','scope_admission_types','scope_enrollment_states',
      'scope_graduation_terms','cohort_min','cohort_max']){
      expect(sql).toContain(column);
    }
    expect(sql).toContain('jsonb_to_recordset($12::jsonb)');
    expect(sql).toContain('$11::boolean IS TRUE');
    expect(args).toEqual([
      ASOF,['permission-synthetic'],null,'SEOUL','ECONOMICS',2023,
      null,null,null,null,false,
      JSON.stringify([{code:'ECONOMICS',role:''}]),
      ['데이터','모집'],12,
    ]);
    expect(x.releases).toHaveLength(1);
  });
  it('binds every verified academic constraint into ALL retrieval/classification SQL paths',async()=>{
    const x=stub([]);
    await x.reader.retrieve({
      ...policy,majorCode:undefined,
      majors:[{code:'ECONOMICS',role:'PRIMARY'},{code:'DATA_SCIENCE',role:'DOUBLE'}],
      college:'COLLEGE_A',enrollmentState:'ENROLLED',
      admissionType:'FOREIGN',graduationTerm:'2026-2',
      graduationTermVerified:true,
    });
    const q=x.calls[0]!;
    const bindings=q.args;
    expect(bindings.slice(6,12)).toEqual([
      'COLLEGE_A','ENROLLED','FOREIGN','2026-2',true,
      JSON.stringify([{code:'ECONOMICS',role:'PRIMARY'},{code:'DATA_SCIENCE',role:'DOUBLE'}]),
    ]);
    expect(q.sql).toContain('l.scope_major_roles');
    expect(q.sql).toContain('l.scope_admission_types');
    expect(q.sql).toContain('l.scope_graduation_terms');
    expect(q.sql).toContain('$11::boolean IS TRUE');
    // No first query hit -> classification uses the identical full actor scope.
    expect(x.calls[1]?.args).toEqual(bindings.slice(0,13));
    expect(x.calls[1]?.sql).toContain('jsonb_to_recordset($12::jsonb)');
    expect(x.calls[1]?.sql).toContain('l.scope_graduation_terms');
  });
  it('does not query the DB without a trusted permission grant',async()=>{
    const x=stub([]);
    const result=await x.reader.retrieve({
      ...policy,permissionRefs:new Set<string>(),
    });
    expect(result.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(x.calls).toHaveLength(0);
  });
  it('does not fetch rows for empty or too long user query',async()=>{
    const x=stub([]);
    expect((await x.reader.retrieve({...policy,query:' '})).hits).toEqual([]);
    expect((await x.reader.retrieve({...policy,query:'x'.repeat(251)})).hits).toEqual([]);
    expect(x.calls).toHaveLength(0);
  });
  it('enforces source scope in SQL rather than trusting a source ID in the browser',async()=>{
    const x=stub([]);
    await x.reader.retrieve({...policy,sourceIds:new Set(['approved-01'])});
    expect(x.calls[0]?.args[2]).toEqual(['approved-01']);
    expect(x.calls[0]?.sql).toContain('l.source_id=ANY($3::text[])');
    expect(x.releases).toHaveLength(1);
  });
  it('returns a locked-down NO_EVIDENCE response on empty DB results',async()=>{
    const x=stub([]);
    const result=await x.reader.retrieve(policy);
    expect(result.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(result.envelope.evidence).toEqual([]);
    expect(result.envelope.sourceRevisionIds).toEqual([]);
  });
  it('enforces topK and rejects malformed scopes before connecting',async()=>{
    const x=stub([]);
    await expect(x.reader.retrieve({...policy,topK:13})).rejects.toThrow(/topK/);
    await expect(x.reader.retrieve({...policy,cohort:2023.5})).rejects.toThrow(/cohort/);
    await expect(x.reader.retrieve({...policy,permissionRefs:new Set(['bad permission'])}))
      .rejects.toThrow();
    expect(x.calls).toHaveLength(0);
  });
  it('fails closed on invalid SQL return type, hash or excessive evidence rows',async()=>{
    for(const rows of [
      [{source_id:'source-01',revision_id:'revision-01',paragraph_id:'p1',
        paragraph_text:'synthetic',score:0}],
      [{source_id:'source-01',revision_id:'revision-01',paragraph_id:'p1',
        paragraph_text:'',score:2}],
      Array.from({length:13},()=>({source_id:'source-01',revision_id:'revision-01',
        paragraph_id:'p1',paragraph_text:'safe synthetic',score:2})),
    ]){
      const x=stub(rows);
      await expect(x.reader.retrieve(policy)).rejects.toThrow(/unavailable/);
      expect(x.releases).toHaveLength(1);
    }
  });
  it('deduplicates revision refs but never returns unverified source fields',async()=>{
    const x=stub([
      {source_id:'source-01',revision_id:'revision-01',paragraph_id:'p1',
        paragraph_text:'합성 데이터 모집',score:2},
      {source_id:'source-01',revision_id:'revision-01',paragraph_id:'p2',
        paragraph_text:'모집 자격 안내',score:1},
    ]);
    const result=await x.reader.retrieve(policy);
    expect(result.envelope.sourceRevisionIds).toEqual(['revision-01']);
    expect(result.envelope.evidence).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('permission-synthetic');
    expect(x.releases).toHaveLength(1);
  });
});
