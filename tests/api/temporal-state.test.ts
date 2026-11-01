import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {PostgresTemporalEvidenceReader} from
  '../../apps/api/src/modules/opportunities/temporal-postgres.js';
import {MemorySourceRevisionLedger,hashRevisionParagraphs} from
  '../../apps/api/src/modules/opportunities/revision-ledger.js';
import type {ReviewerSqlConnection} from
  '../../apps/api/src/modules/auth/reviewer-postgres.js';

const T=(d:number)=>`2026-10-${d}T00:00:00.000Z`;
const words=[{id:'p1',text:'학생 데이터 분석 모집 지원 안내'}];
const original=Buffer.from('synthetic original rights data');
function revision(id:string,day:number,opts:{
  status?:'ACTIVE'|'NEEDS_REVIEW'|'RETRACTED'|'BLOCKED_RIGHTS'|'STALE';
  changeKind?:'NEW'|'CORRECTED'|'CANCELLED'|'UNKNOWN';
  supersedes?:string;
}={}){
  const status=opts.status??'ACTIVE';
  return {
    revision:{
      revisionId:id,sourceId:'source-1',
      ...(opts.supersedes?{supersedes:opts.supersedes}:{}),
      originalSha256:createHash('sha256').update(original).digest('hex'),
      contentSha256:hashRevisionParagraphs(words),
      mediaKind:'TEXT',sourceClass:'SYNTHETIC',provenance:'SYNTHETIC',
      permissionRef:'perm-1',status,changeKind:opts.changeKind??'NEW',
      fetchedAt:T(day),lastCheckedAt:T(day),
      ...(status==='ACTIVE'?{lastVerifiedAt:T(day)}:{}),topicCodes:[],
    },
    paragraphs:words,originalBytes:original,permissionReviewed:true,
  };
}
const policy={
  asOf:T(31),query:'데이터 모집',topK:12,
  permissionRefs:new Set(['perm-1']),
  campus:'SEOUL',majorCode:'ECONOMICS',cohort:2023,
};
function pg(flags:unknown,fail=false){
  const queries:Array<{sql:string;params:readonly unknown[]}>=[],releases:number[]=[];
  const c:ReviewerSqlConnection={
    query:async(sql,params=[])=>{
      // Transaction statements are covered in temporal-snapshot.test.ts;
      // keep existing query-only expectations focused on data SELECTs.
      if(sql.startsWith('BEGIN TRANSACTION ')||sql==='COMMIT'||sql==='ROLLBACK')
        return {rows:[]};
      queries.push({sql,params});
      if(fail&&sql.includes('FROM scoped'))throw new Error('synthetic DB failure');
      if(sql.includes('FROM scoped'))return {rows:[flags as Record<string,unknown>]};
      return {rows:[]};
    },
    release:()=>releases.push(1),
  };
  return {reader:new PostgresTemporalEvidenceReader({connect:async()=>c}),queries,releases};
}
describe('TASK-21 source-state semantics without private text leakage',()=>{
  it('returns BLOCKED_RIGHTS for a matching, granted but source-revoked revision',()=>{
    const ledger=new MemorySourceRevisionLedger();
    ledger.add(revision('r1',20));
    ledger.add(revision('r2',25,{
      supersedes:'r1',status:'BLOCKED_RIGHTS',changeKind:'CORRECTED',
    }));
    const value=ledger.retrieve(policy);
    expect(value.envelope.retrievalState).toBe('BLOCKED_RIGHTS');
    expect(value.hits).toEqual([]);
    expect(value.envelope.evidence).toEqual([]);
  });
  it('returns UNKNOWN for an unreviewed unknown successor instead of stale ACTIVE text',()=>{
    const ledger=new MemorySourceRevisionLedger();
    ledger.add(revision('r1',20));
    ledger.add(revision('r2',25,{
      supersedes:'r1',status:'NEEDS_REVIEW',changeKind:'UNKNOWN',
    }));
    const value=ledger.retrieve(policy);
    expect(value.envelope.retrievalState).toBe('UNKNOWN');
    expect(value.envelope.sourceRevisionIds).toEqual([]);
  });
  it('refuses ACTIVE presentation for an explicitly UNKNOWN change kind',()=>{
    const ledger=new MemorySourceRevisionLedger();
    ledger.add(revision('r1',20,{status:'ACTIVE',changeKind:'NEW'}));
    ledger.add(revision('r2',25,{
      supersedes:'r1',status:'ACTIVE',changeKind:'UNKNOWN',
    }));
    expect(ledger.retrieve(policy).envelope.retrievalState).toBe('UNKNOWN');
  });
  it('reports stale withdrawn evidence but no status oracle for unrelated keywords',()=>{
    const ledger=new MemorySourceRevisionLedger();
    ledger.add(revision('r1',20));
    ledger.add(revision('r2',25,{
      supersedes:'r1',status:'RETRACTED',changeKind:'CANCELLED',
    }));
    expect(ledger.retrieve(policy).envelope.retrievalState).toBe('STALE');
    expect(ledger.retrieve({...policy,query:'우주선 납세'}).envelope.retrievalState)
      .toBe('NO_EVIDENCE');
    expect(ledger.retrieve({...policy,permissionRefs:new Set()}).envelope.retrievalState)
      .toBe('NO_EVIDENCE');
  });
  it('uses a separate scoped negative-state PG read only after READY returns no hits',async()=>{
    const x=pg({blocked_rights:true,unknown:false,stale:true});
    const result=await x.reader.retrieve(policy);
    expect(result.envelope.retrievalState).toBe('BLOCKED_RIGHTS');
    expect(result.envelope.evidence).toEqual([]);
    expect(result.hits).toEqual([]);
    expect(x.queries).toHaveLength(2);
    const {sql,params}=x.queries[1]!;
    expect(sql).toContain('DISTINCT ON (r.source_id)');
    expect(sql).toContain('FROM source_effective_revisions_vnext h');
    expect(sql).toContain('l.permission_ref=ANY($2::text[])');
    expect(sql).toContain('scope_campuses');
    expect(sql).toContain('source_class');
    expect(sql).toContain('FROM scoped');
    expect(params[1]).toEqual(['perm-1']);
    expect(params[2]).toBeNull();
    expect(x.releases).toHaveLength(1);
  });
  it('distinguishes NO_EVIDENCE, STALE, UNKNOWN and BLOCKED_RIGHTS without quotes',async()=>{
    for(const [flags,state] of [
      [{blocked_rights:false,unknown:false,stale:false},'NO_EVIDENCE'],
      [{blocked_rights:false,unknown:false,stale:true},'STALE'],
      [{blocked_rights:false,unknown:true,stale:true},'UNKNOWN'],
      [{blocked_rights:true,unknown:true,stale:true},'BLOCKED_RIGHTS'],
    ] as const){
      const x=pg(flags);
      const result=await x.reader.retrieve(policy);
      expect(result.envelope.retrievalState).toBe(state);
      expect(result.envelope.evidence).toEqual([]);
      expect(result.envelope.sourceRevisionIds).toEqual([]);
    }
  });
  it('fails closed on a malformed state row or an SQL error',async()=>{
    for(const flags of [
      {blocked_rights:'yes',unknown:false,stale:false},
      {blocked_rights:false,unknown:null,stale:false},
    ]){
      const x=pg(flags);
      await expect(x.reader.retrieve(policy)).rejects.toThrow(/unavailable/);
      expect(x.releases).toHaveLength(1);
    }
    const x=pg({blocked_rights:false,unknown:false,stale:false},true);
    await expect(x.reader.retrieve(policy)).rejects.toThrow(/unavailable/);
    expect(x.releases).toHaveLength(1);
  });
  it('does not query PostgreSQL for revoked actor grants',async()=>{
    const x=pg({blocked_rights:true,unknown:false,stale:false});
    const result=await x.reader.retrieve({
      ...policy,permissionRefs:new Set<string>(),
    });
    expect(result.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(x.queries).toHaveLength(0);
  });
});
