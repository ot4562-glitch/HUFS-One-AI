import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateIndependentReviewGate} from './check-independent-review.mjs';

const h='a'.repeat(40),old='b'.repeat(40);
const review=(login,state='APPROVED',sha=h,id=1,type='User')=>({
  id,commit_id:sha,state,submitted_at:new Date(1_700_000_000_000+id*1000).toISOString(),
  user:{login,type},
});
const evaluate=(reviews,opts={})=>evaluateIndependentReviewGate({
  author:'ot4562-glitch',headSha:h,reviews,...opts,
});
describe('collaborator reviews gate exact HEAD; no author or bot shortcut',()=>{
  it('rejects no review, commented-only, self approval and stale approvals',()=>{
    assert.equal(evaluate([]).approved,false);
    assert.equal(evaluate([review('taewangim-alt','COMMENTED')]).approved,false);
    assert.equal(evaluate([review('ot4562-glitch')]).approved,false);
    assert.equal(evaluate([review('taewangim-alt','APPROVED',old)]).approved,false);
    assert.equal(evaluate([review('unknown-person')]).approved,false);
    assert.equal(evaluate([review('taewangim-alt','APPROVED',h,1,'Bot')]).approved,false);
  });
  it('accepts a different trusted collaborator approving the latest commit',()=>{
    assert.deepEqual(evaluate([review('lhh42001')]),{
      approved:true,approvedBy:['lhh42001'],reason:'APPROVED',
    });
  });
  it('rejects outstanding change requests regardless of other approvals',()=>{
    const x=evaluate([review('lhh42001','APPROVED',h,1),
      review('qamarrchae','CHANGES_REQUESTED',h,2)]);
    assert.equal(x.approved,false);
    assert.equal(x.reason,'OUTSTANDING_CHANGES_REQUESTED');
  });
  it('a newer dismissal or change request invalidates the prior approval',()=>{
    assert.equal(evaluate([review('taewangim-alt','APPROVED',h,1),
      review('taewangim-alt','DISMISSED',h,2)]).approved,false);
    assert.equal(evaluate([review('taewangim-alt','APPROVED',h,1),
      review('taewangim-alt','CHANGES_REQUESTED',h,2)]).approved,false);
  });
  it('allows the repository owner to independently review another team member',()=>{
    const otherAuthor={author:'taewangim-alt'};
    assert.deepEqual(evaluate([review('ot4562-glitch')],otherAuthor),{
      approved:true,approvedBy:['ot4562-glitch'],reason:'APPROVED',
    });
    const blocked=evaluate([
      review('ot4562-glitch','CHANGES_REQUESTED',h,1),
      review('lhh42001','APPROVED',h,2),
    ],otherAuthor);
    assert.equal(blocked.approved,false);
    assert.equal(blocked.reason,'OUTSTANDING_CHANGES_REQUESTED');
    // Being the PR author still never counts as an independent approval.
    assert.equal(evaluate([review('ot4562-glitch')]).approved,false);
  });
  it('uses submission time, not response enumeration order, for each reviewer',()=>{
    const later=review('ot4562-glitch','CHANGES_REQUESTED',h,9);
    const earlier=review('ot4562-glitch','APPROVED',h,3);
    const options={author:'taewangim-alt'};
    const conflicting=[later,earlier,review('lhh42001','APPROVED',h,4)];
    assert.equal(evaluate(conflicting,options).reason,'OUTSTANDING_CHANGES_REQUESTED');
    assert.equal(evaluate([...conflicting].reverse(),options).approved,false);
  });
  it('requires the current author and actual SHA shape',()=>{
    assert.equal(evaluate([review('taewangim-alt')],{headSha:'invalid'}).approved,false);
    assert.equal(evaluate([review('taewangim-alt')],{author:'taewangim-alt'}).approved,false);
    assert.equal(evaluate(null).approved,false);
  });
});
