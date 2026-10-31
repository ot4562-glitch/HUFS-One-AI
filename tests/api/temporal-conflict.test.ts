import {describe,expect,it} from 'vitest';
import {PostgresTemporalEvidenceReader} from
  '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import type {ReviewerSqlConnection} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const ASOF='2026-10-31T00:00:00.000Z';
const policy={
  query:'데이터 모집',asOf:ASOF,topK:1,
  permissionRefs:new Set(['P-GRANTED']),
  campus:'SEOUL',majorCode:'ECONOMICS',cohort:2023,
};
const row={
  source_id:'source-1',revision_id:'r1',paragraph_id:'p1',
  paragraph_text:'합성 데이터 모집',score:2,
};
function stub(result:unknown,opts:{noHits?:boolean;failure?:boolean}={}){
  const queries:Array<{sql:string;params:readonly unknown[]}>=[],released:number[]=[];
  const connection:ReviewerSqlConnection={
    query:async(sql,params=[])=>{
      queries.push({sql,params});
      if(sql.includes('AS confirmed_conflict')){
        if(opts.failure)throw new Error('synthetic conflict table unavailable');
        return {rows:[{confirmed_conflict:result}]};
      }
      if(sql.includes('FROM scoped'))return {rows:[{
        blocked_rights:false,stale:false,unknown:false,
      }]};
      return {rows:opts.noHits?[]:[row]};
    },
    release:()=>released.push(1),
  };
  return {reader:new PostgresTemporalEvidenceReader({
    connect:async()=>connection,
  }),queries,released};
}
describe('TASK-21 human-reviewed asOf CONFLICT with no unauthorized quote',()=>{
  it('returns CONFLICT with zero quotes even when topK only selects one matching paragraph',async()=>{
    const x=stub(true);
    const result=await x.reader.retrieve(policy);
    expect(result.envelope.retrievalState).toBe('CONFLICT');
    expect(result.envelope.evidence).toEqual([]);
    expect(result.envelope.sourceRevisionIds).toEqual([]);
    expect(result.hits).toEqual([]);
    expect(x.queries).toHaveLength(2);
    const query=x.queries[1]!.sql;
    expect(query).toContain('source_conflict_decisions_vnext');
    expect(query).toContain('FROM candidates');
    expect(query).toContain("d.disposition='CONFLICT'");
    expect(query).toContain('d.reviewed_at<=$1::timestamptz');
    expect(query).toContain('l.status=\'ACTIVE\'');
    expect(query).toContain('l.permission_ref=ANY($2::text[])');
    expect(query).toContain('l.scope_campuses');
    expect(query).toContain('l.cohort_min');
    expect(query).not.toContain('LIMIT $8::integer');
    expect(x.queries[1]!.params).toEqual([
      ASOF,['P-GRANTED'],null,'SEOUL','ECONOMICS',2023,['데이터','모집'],
    ]);
    expect(x.released).toHaveLength(1);
  });
  it('does not invent a conflict without an independent reviewed decision',async()=>{
    const x=stub(false);
    const value=await x.reader.retrieve(policy);
    expect(value.envelope.retrievalState).toBe('READY');
    expect(value.hits[0]).toMatchObject({revisionId:'r1'});
    expect(value.envelope.evidence[0]).toMatchObject({kind:'TEXT',quote:row.paragraph_text});
  });
  it('requires both latest actor-authorized query matches in the conflict SQL',async()=>{
    const x=stub(false);
    await x.reader.retrieve({
      ...policy,sourceIds:new Set(['source-1']),
      campus:'GLOBAL',cohort:2020,
    });
    const s=x.queries[1]!.sql;
    expect(s).toContain('l.source_id=ANY($3::text[])');
    expect(s).toContain('l.last_verified_at<=$1::timestamptz');
    expect(s).toContain("l.provenance!='RESEARCH_ONLY'");
    expect(s).toContain('d.left_revision_id IN (SELECT revision_id FROM candidates)');
    expect(s).toContain('d.right_revision_id IN (SELECT revision_id FROM candidates)');
    expect(x.queries[1]!.params[2]).toEqual(['source-1']);
  });
  it('uses latest human decision at asOf so RESOLVED can supersede CONFLICT',async()=>{
    const x=stub(false);
    await x.reader.retrieve(policy);
    const sql=x.queries[1]!.sql;
    expect(sql).toContain('DISTINCT ON (d.left_revision_id,d.right_revision_id)');
    expect(sql).toContain('d.reviewed_at DESC,d.decision_id DESC');
    expect(sql).toContain("d.disposition='CONFLICT'");
  });
  it('never probes conflicts when actor rights are empty or there are no matching hits',async()=>{
    const x=stub(true);
    const noRights=await x.reader.retrieve({...policy,permissionRefs:new Set()});
    expect(noRights.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(x.queries).toHaveLength(0);
    const empty=stub(true,{noHits:true});
    expect((await empty.reader.retrieve(policy)).envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(empty.queries.every(q=>!q.sql.includes('AS confirmed_conflict'))).toBe(true);
  });
  it('fails closed on invalid human-review results or failed review SQL',async()=>{
    for(const bad of [null,'yes',1]){
      const x=stub(bad);
      await expect(x.reader.retrieve(policy)).rejects.toThrow(/unavailable/);
      expect(x.released).toHaveLength(1);
    }
    const failed=stub(false,{failure:true});
    await expect(failed.reader.retrieve(policy)).rejects.toThrow(/unavailable/);
    expect(failed.released).toHaveLength(1);
  });
});
