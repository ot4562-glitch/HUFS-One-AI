import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {extractNoticeFieldCandidates} from './notice-field-candidates.mjs';
const o={sourceId:'SYN-SOURCE',revisionId:'SYN-REV-1'};
const parse=paragraphs=>extractNoticeFieldCandidates({...o,paragraphs});
describe('#445 Korean notice candidate facts are human review only',()=>{
  it('uses the actual paragraph spans for a valid explicit deadline and campus',()=>{
    const actual=parse([
      {id:'p-1',text:'합성 지원 공고입니다.'},
      {id:'p-2',text:'신청 마감: 2026. 11. 30. 18:00'},
      {id:'p-3',text:'서울캠퍼스 지원 안내'},
    ]);
    assert.equal(actual.state,'NEEDS_REVIEW');
    assert.deepEqual(actual.fields.deadline,{
      state:'KNOWN',value:{date:'2026-11-30',localTime:'18:00',
        timeZone:'Asia/Seoul'},sourceSpanIds:['p-2'],
    });
    assert.deepEqual(actual.fields.campus,{state:'KNOWN',
      value:'SEOUL',sourceSpanIds:['p-3']});
    assert.deepEqual(actual.fields.eligibility,{
      state:'UNKNOWN',reason:'STUDENT_FACTS_AND_REVIEW_REQUIRED',
    });
  });
  it('never guesses time from a date-only announcement',()=>{
    const v=parse([{id:'p-1',text:'접수마감 2026년 11월 30일'}]);
    assert.deepEqual(v.fields.deadline.value,{date:'2026-11-30',
      localTime:null,timeZone:'Asia/Seoul'});
  });
  it('does not choose arbitrarily among conflicting deadlines or campuses',()=>{
    const v=parse([
      {id:'p-1',text:'접수 마감: 2026-11-30 18:00, 서울캠퍼스'},
      {id:'p-2',text:'정정 신청 마감: 2026-12-01 18:00, 글로벌캠퍼스'},
    ]);
    assert.equal(v.fields.deadline.state,'UNKNOWN');
    assert.equal(v.fields.campus.state,'UNKNOWN');
  });
  it('ignores broken calendar dates and ambiguous relative dates',()=>{
    const v=parse([
      {id:'p-1',text:'접수 마감 2026-02-30, 서울캠퍼스'},
      {id:'p-2',text:'이번 금요일 마감, 2026년 제1학기.'},
      {id:'p-3',text:'지원 마감 2026-11-01 25:99'},
    ]);
    assert.deepEqual(v.fields.deadline,{
      state:'UNKNOWN',reason:'NO_EXPLICIT_DEADLINE',
    });
    assert.equal(v.fields.campus.value,'SEOUL');
  });
  it('rejects malformed unbounded input, never treating it as an approved revision',()=>{
    for(const paragraphs of [[],[{id:'x',text:''}],
      [{id:'../../secret',text:'example'}],
      Array.from({length:201},(_,i)=>({id:'p'+i,text:'x'}))])
      assert.throws(()=>parse(paragraphs),/NOTICE_CANDIDATES_REQUIRE_REVIEW/);
    assert.throws(()=>extractNoticeFieldCandidates({...o,sourceId:'s/..',
      paragraphs:[{id:'p1',text:'x'}]}),/NOTICE_CANDIDATES_REQUIRE_REVIEW/);
  });
});
