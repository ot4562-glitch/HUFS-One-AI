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
  it('normalizes compatibility characters on both query and corpus in retrieval, conflict and empty-state paths',async()=>{
    const original='ＡＩ 합성 모집';
    const ready=stub([{source_id:'s',revision_id:'r',paragraph_id:'p',paragraph_text:original,score:1}]);
    const result=await ready.reader.retrieve({...policy,query:'ＡＩ'});
    expect(result.hits[0]!.quote).toBe(original);
    expect(ready.calls[0]!.args[12]).toEqual(['ai']);
    const missing=stub([]);await missing.reader.retrieve({...policy,query:'AI'});
    const searches=[...ready.calls,...missing.calls].filter(q=>q.sql.includes('position(token.term'));
    expect(searches.length).toBeGreaterThanOrEqual(3);
    for(const {sql} of searches){
      expect(sql).toContain('position(token.term IN lower(normalize(p.paragraph_text,NFKC)))');
      expect(sql).not.toContain('position(token.term IN lower(p.paragraph_text))');
    }
  });
  it('preserves configured trusted policy versions on READY and empty reads',async()=>{
    const x=stub([{source_id:'s',revision_id:'r',paragraph_id:'p',paragraph_text:'데이터',score:1}]);
    expect((await x.reader.retrieve({...policy,permissionPolicyVersion:'rights-v2'}))
      .envelope.permissionPolicyVersion).toBe('rights-v2');
    expect((await x.reader.retrieve({...policy,permissionRefs:new Set(),permissionPolicyVersion:'rights-v3'}))
      .envelope.permissionPolicyVersion).toBe('rights-v3');
    const empty=stub([]);
    expect((await empty.reader.retrieve({...policy,permissionPolicyVersion:'rights-v4'}))
      .envelope.permissionPolicyVersion).toBe('rights-v4');
  });
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
    expect(sql).toContain('FROM source_effective_revisions_vnext r');
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
    const {majorCode:_legacyMajorCode,...withoutLegacyMajorCode}=policy;
    await x.reader.retrieve({
      ...withoutLegacyMajorCode,
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

describe('PostgreSQL IMAGE citation projections',()=>{
  const image=()=>({kind:'IMAGE' as const,sourceRevisionId:'r-image',assetId:'asset-image',
    originalSha256:'a'.repeat(64),pageIndex:0,bboxNorm:[0,0,.5,.25] as [number,number,number,number],
    ocrLineIds:['field-1'],quote:'합성 공고',extractionEngine:'CLOVA_OCR_GENERAL' as const,transformVersion:'raster-identity-v1'});
  const row=()=>({source_id:'s-image',revision_id:'r-image',paragraph_id:'ocr-line-1',
    paragraph_text:'합성 공고',score:1,media_kind:'IMAGE',original_sha256:'a'.repeat(64),image_span:image()});
  it('returns the stored IMAGE span without inventing text offsets',async()=>{
    const x=stub([row()]),result=await x.reader.retrieve(policy);
    expect(result.envelope.evidence).toEqual([image()]);expect(result.hits[0]?.imageSpan).toEqual(image());
    expect(result.envelope.evidence[0]).not.toHaveProperty('startCodePoint');
    expect(x.calls[0]?.sql).toContain('r.media_kind,r.original_sha256');
    expect(x.calls[0]?.sql).toContain('p.image_span');
  });
  const invalid:Array<[string,(value:any)=>void]>=[
    ['absent span',r=>{delete r.image_span;}],['TEXT downgrade',r=>{r.media_kind='TEXT';}],
    ['PDF',r=>{r.media_kind='PDF';}],['original hash',r=>{r.original_sha256='b'.repeat(64);}],
    ['revision',r=>{r.image_span.sourceRevisionId='other';}],['quote',r=>{r.image_span.quote='다른 공고';}],
    ['bbox',r=>{r.image_span.bboxNorm=[0,0,2,.5];}],
  ];
  it.each(invalid)('fails closed on mismatched %s from storage',async(_name,mutate)=>{
    const value=row();mutate(value);const x=stub([value]);
    await expect(x.reader.retrieve(policy)).rejects.toThrow(/unavailable/);expect(x.releases).toHaveLength(1);
  });
});
