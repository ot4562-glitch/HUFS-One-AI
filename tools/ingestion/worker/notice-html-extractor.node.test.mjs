import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {parseApprovedNoticeHtmlDraft,createCheerioApprovedNoticeExtractor}
  from './notice-html-extractor.mjs';
import {extractNoticeFieldCandidates} from '../notice-field-candidates.mjs';

const url='https://example.org/notices/1';
const encoding=new TextEncoder();
const bytes=value=>encoding.encode(value);
const input=content=>({content:bytes(content),contentType:'text/html;charset=utf-8',
  canonicalUrl:url,rootSelector:'main'});
const page=`<!DOCTYPE html><main><h1>가상 장학 공고</h1>
  <table><tr><th>게시일</th><td>2026.11.01</td></tr>
  <tr><th>지원 마감일</th><td>2026.12.01 18:00</td></tr></table>
  <p>서울 캠퍼스 학생 대상 여부는 공식 검수 필요</p>
  <form><input name="studentId"></form>
  <script>PRIVATE_TOKEN_FORBIDDEN</script>
  </main>`;
describe('#445 approved HTML5 detail parser is offline, bounded and review-only',()=>{
  it('extracts title/table/body spans and never active code or form values',()=>{
    const result=parseApprovedNoticeHtmlDraft(input(page));
    assert.equal(result.reviewState,'NEEDS_REVIEW');
    assert.equal(result.sourceUrl,url);
    assert.match(result.originalSha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(result.paragraphs,[
      {id:'p1',text:'제목: 가상 장학 공고'},
      {id:'p2',text:'게시일: 2026.11.01'},
      {id:'p3',text:'지원 마감일: 2026.12.01 18:00'},
      {id:'p4',text:'서울 캠퍼스 학생 대상 여부는 공식 검수 필요'},
    ]);
    assert.equal(JSON.stringify(result).includes('PRIVATE_TOKEN'),false);
    const fields=extractNoticeFieldCandidates({
      sourceId:'SYN-SOURCE',revisionId:'SYN-REV-1',
      paragraphs:result.paragraphs,
    });
    assert.equal(fields.state,'NEEDS_REVIEW');
    assert.equal(fields.fields.title.value,'가상 장학 공고');
    assert.equal(fields.fields.publishedDate.value,'2026-11-01');
    assert.equal(fields.fields.deadline.value.date,'2026-12-01');
    assert.equal(fields.fields.deadline.value.localTime,'18:00');
    assert.equal(fields.fields.eligibility.state,'UNKNOWN');
  });
  it('SourceContentExtractor wrapper has no fetch/storage side effects',async()=>{
    const port=createCheerioApprovedNoticeExtractor({rootSelector:'main'});
    const paragraphs=await port.extract({content:bytes(page),contentType:'text/html',
      canonicalUrl:url});
    assert.equal(paragraphs[0].text,'제목: 가상 장학 공고');
    assert.equal(paragraphs.length,4);
  });
  it('rejects active DTD, bad URLs, invalid encoding, huge pages and unsafe selectors',()=>{
    const valid=input('<main><p>가상 합성 내용</p></main>');
    for(const changed of [
      {...valid,canonicalUrl:'https://localhost./notices/1'},
      {...valid,canonicalUrl:'https://127.0.0.1/notices/1'},
      {...valid,canonicalUrl:'http://example.org/notices/1'},
      {...valid,rootSelector:'body script'},
      {...valid,contentType:'application/pdf'},
      {...valid,content:bytes('<!DOCTYPE html SYSTEM "file:///etc/passwd"><main><p>X</p></main>')},
      {...valid,content:bytes('<!ENTITY x SYSTEM "file:///etc/passwd"><main><p>X</p></main>')},
      {...valid,content:new Uint8Array([0xff,0xfe,0xfd])},
      {...valid,content:new Uint8Array(256*1024+1)},
      {...valid,content:bytes('<main><p></p></main>')},
    ])assert.throws(()=>parseApprovedNoticeHtmlDraft(changed),
      /NOTICE_DETAIL_REQUIRES_REVIEW/);
  });
  it('requires one unique operator-selected section, no ambiguous selector',()=>{
    const html=bytes('<main><p>첫 번째</p></main><main><p>두 번째</p></main>');
    assert.throws(()=>parseApprovedNoticeHtmlDraft({content:html,contentType:'text/html',
      canonicalUrl:url,rootSelector:'main'}),/NOTICE_DETAIL_REQUIRES_REVIEW/);
  });
  it('rejects unbounded extracted paragraphs and excessive text',()=>{
    const p=bytes('<main>'+Array.from({length:201},(_,i)=>'<p>test '+i+'</p>').join('')+'</main>');
    assert.throws(()=>parseApprovedNoticeHtmlDraft({content:p,contentType:'text/html',
      canonicalUrl:url,rootSelector:'main'}),/NOTICE_DETAIL_REQUIRES_REVIEW/);
    const long=bytes('<main><p>'+('가'.repeat(20001))+'</p></main>');
    assert.throws(()=>parseApprovedNoticeHtmlDraft({content:long,contentType:'text/html',
      canonicalUrl:url,rootSelector:'main'}),/NOTICE_DETAIL_REQUIRES_REVIEW/);
  });
});
