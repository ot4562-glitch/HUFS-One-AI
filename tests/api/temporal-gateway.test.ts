import {describe,expect,it,vi} from 'vitest';
import {createPostgresTemporalGateway} from
  '../../apps/api/src/modules/opportunities/temporal-gateway.js';
import type {CurrentEvidenceGrants} from
  '../../apps/api/src/modules/opportunities/temporal-gateway.js';

const NOW='2026-10-31T00:00:00.000Z';
const actor={
  actorId:'synthetic-actor',role:'BETA' as const,
  sessionIdHash:'H'.repeat(30),csrfToken:'C'.repeat(32),
  sessionExpiresAt:'2026-11-04T00:00:00.000Z',
  schoolMailProofExpiresAt:'2026-11-04T00:00:00.000Z',
  betaAllowed:true,
};
const query={actor,query:'합성공고',asOf:NOW,topK:12,now:NOW};
function answer(offset=0,extraIds=false){
  return {
    envelope:{
      queryVersion:'q1',asOf:NOW,sourceRevisionIds:extraIds?['r1','r-forged']:['r1'],
      permissionPolicyVersion:'server-policy-v1',
      retrievalConfigVersion:'pg-lexical-v1',retrievalState:'READY' as const,
      evidence:[{
        kind:'TEXT' as const,sourceRevisionId:'r1',paragraphId:'p1',
        startCodePoint:offset,endCodePoint:offset+4,quote:'합성공고',
      }],
    },
    hits:[{sourceId:'s1',revisionId:'r1',paragraphId:'p1',quote:'합성공고',score:1}],
  };
}
describe('TASK-21 source head and citation validation on SQL result return',()=>{
  const fullScope=():CurrentEvidenceGrants=>({
    permissionRefs:new Set(['P-1']),policyVersion:'rights-v2',
    campus:'SEOUL',college:'COLLEGE_A',majorCode:'ECONOMICS',cohort:2023,
    enrollmentState:'ENROLLED',admissionType:'FOREIGN',
    graduationTerm:'2026-2',graduationTermVerified:true,
    majors:[{code:'ECONOMICS',role:'PRIMARY'},{code:'DATA',role:'DOUBLE'}],
  });
  it('forwards every trusted academic scope and policy version to the reader',async()=>{
    const scope=fullScope();
    const reader={retrieve:vi.fn(async()=>answer())};
    await createPostgresTemporalGateway(reader,{resolveFor:async()=>scope}).query(query);
    expect(reader.retrieve).toHaveBeenCalledWith(expect.objectContaining({
      campus:'SEOUL',college:'COLLEGE_A',majorCode:'ECONOMICS',cohort:2023,
      enrollmentState:'ENROLLED',admissionType:'FOREIGN',
      graduationTerm:'2026-2',graduationTermVerified:true,
      majors:scope.majors,permissionPolicyVersion:'rights-v2',
    }));
  });
  const scopeChanges:Array<[string,(scope:CurrentEvidenceGrants)=>void]>=[
    ['campus',s=>{s.campus='GLOBAL';}],
    ['college',s=>{s.college='COLLEGE_B';}],
    ['majorCode',s=>{s.majorCode='DATA';}],
    ['cohort',s=>{s.cohort=2024;}],
    ['enrollmentState',s=>{s.enrollmentState='LEAVE';}],
    ['admissionType',s=>{s.admissionType='GENERAL';}],
    ['graduationTerm',s=>{s.graduationTerm='2027-1';}],
    ['graduationTermVerified',s=>{s.graduationTermVerified=false;}],
    ['major code',s=>{s.majors=[{code:'OTHER',role:'PRIMARY'}];}],
    ['major role',s=>{s.majors=[{code:'ECONOMICS',role:'MINOR'}];}],
    ['major role in place',s=>{s.majors![0]!.role='MINOR';}],
    ['major removal',s=>{s.majors=[];}],
  ];
  it.each(scopeChanges)('discards quotes when %s changes during retrieval',async(_name,mutate)=>{
    const scope=fullScope();
    const reader={retrieve:vi.fn(async()=>{mutate(scope);return answer();})};
    const result=await createPostgresTemporalGateway(reader,{resolveFor:async()=>scope}).query(query);
    expect(result.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(result.hits).toEqual([]);
    expect(result.envelope.evidence).toEqual([]);
  });
  it('treats reordering the same major-role pairs as unchanged rights',async()=>{
    const scope=fullScope();
    const reader={retrieve:vi.fn(async()=>{scope.majors=[...scope.majors!].reverse();return answer();})};
    const result=await createPostgresTemporalGateway(reader,{resolveFor:async()=>scope}).query(query);
    expect(result.envelope.retrievalState).toBe('READY');
  });
  it('does not let resolver mutations alter an in-flight reader authorization snapshot',async()=>{
    const scope=fullScope();
    const reader={retrieve:vi.fn(async(request:{permissionRefs:ReadonlySet<string>;majors?:CurrentEvidenceGrants['majors']})=>{
      (scope.permissionRefs as Set<string>).clear();
      scope.majors![0]!.role='MINOR';
      expect([...request.permissionRefs]).toEqual(['P-1']);
      expect(request.majors?.[0]?.role).toBe('PRIMARY');
      return answer();
    })};
    const result=await createPostgresTemporalGateway(reader,{resolveFor:async()=>scope}).query(query);
    expect(result.hits).toEqual([]);
  });
  it('returns READY with unchanged rights, source-head epoch and exact quote',async()=>{
    const reader={retrieve:vi.fn(async()=>answer())};
    const resolver={
      resolveFor:vi.fn(async()=>({
        permissionRefs:new Set(['P-1']),sourceIds:new Set(['s1']),
        policyVersion:'rights-v1',sourceHeadVersion:'head-1',
      })),
    };
    const result=await createPostgresTemporalGateway(reader,resolver).query(query);
    expect(result.envelope.retrievalState).toBe('READY');
    expect(result.envelope.permissionPolicyVersion).toBe('rights-v1');
    expect(result.hits[0]?.quote).toBe('합성공고');
    expect(resolver.resolveFor).toHaveBeenCalledTimes(2);
  });
  it('discards all in-flight quote bytes when source head advances',async()=>{
    let epoch=1;
    const reader={retrieve:vi.fn(async()=>{
      epoch++;
      return answer();
    })};
    const resolver={resolveFor:async()=>({
      permissionRefs:new Set(['P-1']),sourceIds:new Set(['s1']),
      policyVersion:'rights-v1',sourceHeadVersion:`source-head-${epoch}`,
    })};
    const result=await createPostgresTemporalGateway(reader,resolver).query(query);
    expect(result.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(result.envelope.sourceRevisionIds).toEqual([]);
    expect(result.envelope.evidence).toEqual([]);
    expect(result.hits).toEqual([]);
  });
  it('refuses text snippets with forged offsets even if the quote matches',async()=>{
    const reader={retrieve:vi.fn(async()=>answer(3))};
    const resolver={resolveFor:async()=>({
      permissionRefs:new Set(['P-1']),
      policyVersion:'rights-v1',
    })};
    await expect(createPostgresTemporalGateway(reader,resolver).query(query))
      .rejects.toThrow(/mismatch/);
  });
  it('refuses revision references not present in any verified SQL hit',async()=>{
    const reader={retrieve:vi.fn(async()=>answer(0,true))};
    const resolver={resolveFor:async()=>({
      permissionRefs:new Set(['P-1']),
      policyVersion:'rights-v1',
    })};
    await expect(createPostgresTemporalGateway(reader,resolver).query(query))
      .rejects.toThrow(/mismatch/);
  });
  it('does not reveal any source with empty rights before DB access',async()=>{
    const reader={retrieve:vi.fn(async()=>answer())};
    const resolver={resolveFor:async()=>({
      permissionRefs:new Set<string>(),
      policyVersion:'revoked',
    })};
    const result=await createPostgresTemporalGateway(reader,resolver).query(query);
    expect(result.envelope.retrievalState).toBe('NO_EVIDENCE');
    expect(result.hits).toEqual([]);
    expect(reader.retrieve).not.toHaveBeenCalled();
  });
});
