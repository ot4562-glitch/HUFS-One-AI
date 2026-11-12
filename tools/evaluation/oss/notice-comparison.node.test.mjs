import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runNoticeComparison,scoreNoticeConversion} from './notice-comparison.mjs';
test('synthetic baseline records denominators, exact origin hashes and candidate NOT_RUN',()=>{
  const report=runNoticeComparison();
  assert.equal(report.referenceKind,'AUTHOR_SYNTHETIC_NOT_HUMAN_GOLD');
  assert.equal(report.baseline.cases.length,8);assert.equal(report.candidate.state,'NOT_RUN');
  assert.equal(report.baseline.metrics.expectedFragments.num,16);
  assert.equal(report.baseline.metrics.expectedFragments.den,16);
  assert.equal(report.baseline.metrics.excludedFragmentsPresent.num,0);
  assert.deepEqual(report.baseline.metrics.correctAbstentions,{num:2,den:2,value:1});
  assert.equal(report.externalModelCalls,0);
  assert.equal(report.baseline.cheerioVersion,'1.2.0');
  assert.match(report.baseline.extractorSha256,/^[a-f0-9]{64}$/);
  assert.match(report.baseline.workerLockSha256,/^[a-f0-9]{64}$/);
  for(const c of report.baseline.cases)assert.match(c.originalSha256,/^[a-f0-9]{64}$/);
});
test('missing output and leaked boilerplate cannot disappear from metric denominators',()=>{
  const cases=[{id:'SYN-A',expected:['서울','2027'],excluded:['NAV']},{id:'SYN-B',expected:[],excluded:[],expectAbstention:true}];
  const score=scoreNoticeConversion(cases,[{id:'SYN-A',text:'서울 NAV'},{id:'SYN-B',text:'invented'}]);
  assert.deepEqual(score.expectedFragments,{num:1,den:2,value:0.5});
  assert.deepEqual(score.excludedFragmentsPresent,{num:1,den:1,value:1});
  assert.deepEqual(score.correctAbstentions,{num:0,den:1,value:0});
  assert.throws(()=>scoreNoticeConversion(cases,[{id:'SYN-A',text:''}]));
  assert.throws(()=>scoreNoticeConversion(cases,[{id:'SYN-A',text:''},{id:'SYN-A',text:''}]));
});
test('actual optional MarkItDown preserves Korean across the process boundary',
  {skip:!process.env.HUFS_MARKITDOWN_PYTHON},()=>{
    const report=runNoticeComparison({python:process.env.HUFS_MARKITDOWN_PYTHON});
    assert.equal(report.candidate.state,'SYNTHETIC_LOCAL_RUN');
    assert.deepEqual(report.candidate.metrics.expectedFragments,{num:16,den:16,value:1});
    assert.deepEqual(report.candidate.metrics.correctAbstentions,{num:2,den:2,value:1});
    assert.deepEqual(report.candidate.attempts,{network:0,subprocess:0});
    assert.equal(report.candidate.metrics.excludedFragmentsPresent.den,5);
  });
