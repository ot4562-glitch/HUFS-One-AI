import {describe,expect,it} from 'vitest';
import {verifiedCareerAiComparison,verifiedCareerReceipt} from './aiEvidence.js';

const now='2026-11-07T12:00:00Z';
const jobId='550e8400-e29b-41d4-a716-446655440000';
const proof={
  opportunityId:'opp-1',sourceRevisionId:'rev-1',permissionRef:'perm-1',
  rankConfigVersion:'rules-1',feedVersion:'a'.repeat(64),consentVersion:1,
  jobId,provider:'HCX_007',modelRevision:'model-1',
  asOf:now,mode:'LIVE_PROVIDER_RUN',task:'opportunity_terms',
  state:'NEEDS_REVIEW',interpretation:'현재 허가된 공고 조건을 사람 검토 전 해석함',
  evidenceRefs:['e-1'],caveats:['학업 사실 미확인'],
};
const rule={opportunityId:'opp-1',asOf:now,sourceRevisionId:'rev-1',rankConfigVersion:'rules-1',
  provenance:'CODE_RULES',state:'FEATURED',evidenceRefs:['e-1','e-2']};
const context={opportunityId:'opp-1',sourceRevisionId:'rev-1',permissionRef:'perm-1',
  rankConfigVersion:'rules-1',feedVersion:'a'.repeat(64),consentVersion:1,asOf:now,
  sourceVerified:true};
const receipt={
  jobId,runId:jobId,task:'experience_skills',provider:'HCX_007',modelRevision:'model-1',
  sourceRevisionId:'rev-1',consentVersion:1,rightsVersion:'right-1',
  asOf:now,recordedAt:'2026-11-07T12:01:00Z',expiresAt:'2099-11-07T13:00:00Z',
  inputSha256:'b'.repeat(64),reviewState:'NEEDS_REVIEW',metrics:{promptTokens:100,completionTokens:20,totalTokens:120},
  mode:'LIVE_PROVIDER_RUN',provenance:'SERVER_RECORDED',newProviderInvocation:true,billingState:'NOT_MEASURED',
};
const stored={
  jobId,state:'NEEDS_REVIEW',billing:'SETTLED',provenance:'CANDIDATE_CACHE',
  candidate:{task:'experience_skills',reviewRequired:true,reviewState:'NEEDS_REVIEW',
    objectTokens:[],citations:[{sourceToken:'s1',paragraphId:'p1',quote:'현재 본인 글'}],
    usage:{promptTokens:100,completionTokens:20,totalTokens:120}},
};
describe('#317 verified comparison and real receipt projections',()=>{
  it('allows only identical owner/rights/consent/revision/asOf/feed and shared evidence',()=>{
    expect(verifiedCareerAiComparison(proof,rule,context)).toMatchObject(proof);
    expect(()=>verifiedCareerAiComparison({...proof,feedVersion:'c'.repeat(64)},rule,context)).toThrow();
    expect(()=>verifiedCareerAiComparison({...proof,consentVersion:2},rule,context)).toThrow();
    expect(()=>verifiedCareerAiComparison({...proof,sourceRevisionId:'older'},rule,context)).toThrow();
    expect(()=>verifiedCareerAiComparison({...proof,permissionRef:'not-granted'},rule,context)).toThrow();
    expect(()=>verifiedCareerAiComparison({...proof,evidenceRefs:['unbound']},rule,context)).toThrow();
    expect(()=>verifiedCareerAiComparison(proof,rule,{...context,sourceVerified:false})).toThrow();
    expect(()=>verifiedCareerAiComparison(proof,{...rule,state:'NOT_FEATURED',reason:'NOT_EVALUATED',notes:[],evidenceRefs:[]},context)).toThrow();
  });
  it('does not fabricate cost and refuses receipts for a mismatched candidate or measured tokens',()=>{
    expect(verifiedCareerReceipt(receipt,stored,{jobId,task:'experience_skills'})).toMatchObject(receipt);
    expect(()=>verifiedCareerReceipt({...receipt,metrics:{...receipt.metrics,measuredCostKrw:100}},
      stored,{jobId,task:'experience_skills'})).toThrow();
    expect(()=>verifiedCareerReceipt({...receipt,jobId:'11111111-1111-4111-8111-111111111111'},
      stored,{jobId,task:'experience_skills'})).toThrow();
    expect(()=>verifiedCareerReceipt({...receipt,metrics:{...receipt.metrics,totalTokens:119}},
      stored,{jobId,task:'experience_skills'})).toThrow();
    expect(()=>verifiedCareerReceipt({...receipt,expiresAt:'2026-11-07T12:01:01Z'},
      stored,{jobId,task:'experience_skills'},Date.parse('2026-11-08T00:00:00Z'))).toThrow();
  });
  it('never claims an additional provider charge for a replayed cached result',()=>{
    const cached={...receipt,mode:'CACHED_PREVIOUS_RUN',newProviderInvocation:false,
      billingState:'NO_NEW_CHARGE',originalRunId:'11111111-1111-4111-8111-111111111111'};
    expect(verifiedCareerReceipt(cached,stored,{jobId,task:'experience_skills'}).mode).toBe('CACHED_PREVIOUS_RUN');
    expect(()=>verifiedCareerReceipt({...cached,metrics:{...cached.metrics,measuredCostKrw:500}},
      stored,{jobId,task:'experience_skills'})).toThrow();
  });
});
