import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {parseApprovedBoardCandidates} from './site-adapters.mjs';
const bytes=value=>new TextEncoder().encode(value);
const scope={
  family:'TABLE_BOARD_V1',sourceId:'SYN-TABLE',rootSelector:'main',
  canonicalUrl:'https://example.org/notices?page=1',
  approvedOrigin:'https://example.org/',
  allowPathPrefixes:['/notices','/files'],
  allowedQueryKeys:['page','id'],limit:5,
};
const table=String.raw`<!DOCTYPE html><main><table><tbody>
<tr><td class="title"><a href="/notices?id=101">가상 학사 공지</a></td>
<td><time>2026.11.11</time></td>
<td class="files"><a href="/files/notice-101.hwpx">서식</a></td></tr>
<tr><td class="title"><a href="/notices?id=102">가상 장학 안내</a></td>
<td><time>2026.11.10</time></td>
<td class="files"><a href="/files/notice-102.hwp">HWP 서식</a></td></tr>
</tbody></table><nav><a href="/notices?page=2">2</a>
<a href="/notices?page=3">3</a><a href="https://other.example.org/notices">OUT</a></nav>
<script>throw Error("must never execute")</script></main>`;
describe('#445 independent board layout adapters: no network/no authorization',()=>{
  it('table board extracts bounded source detail, HWPX/HWP links and page proposals',()=>{
    const result=parseApprovedBoardCandidates({content:bytes(table),policy:scope});
    assert.equal(result.state,'REVIEW_REQUIRED');
    assert.equal(result.originalSha256.length,64);
    assert.equal(result.scanned,2);
    assert.equal(result.posts.length,2);
    assert.deepEqual(result.posts.map(p=>p.url),[
      'https://example.org/notices?id=101',
      'https://example.org/notices?id=102',
    ]);
    assert.deepEqual(result.posts[0].attachmentCandidates,[
      'https://example.org/files/notice-101.hwpx',
    ]);
    assert.equal(result.posts[0].postedAtCandidate,'2026.11.11');
    assert.deepEqual(result.paginationCandidates,[
      'https://example.org/notices?page=2',
      'https://example.org/notices?page=3',
    ]);
    assert.equal(result.hasMoreRows,false);
  });
  it('card layout keeps a distinct selector family',()=>{
    const cards=String.raw`<main><ul>
<li><h3><a href="/notices?id=6">가상 카드 공고</a></h3><time>2026.11.11</time>
<div class="attachments"><a href="/files/application.pdf">PDF</a></div></li>
</ul></main>`;
    const result=parseApprovedBoardCandidates({
      content:bytes(cards),policy:{...scope,family:'CARD_BOARD_V1',sourceId:'SYN-CARD'},
    });
    assert.equal(result.family,'CARD_BOARD_V1');
    assert.equal(result.posts.length,1);
    assert.equal(result.posts[0].title,'가상 카드 공고');
    assert.deepEqual(result.posts[0].attachmentCandidates,[
      'https://example.org/files/application.pdf',
    ]);
  });
  it('filters unsafe proposed destinations and unapproved query keys',()=>{
    const html=String.raw`<main><table><tbody>
<tr><td class="title"><a href="/notices?id=6">정상</a></td></tr>
<tr><td class="title"><a href="/notices?secret=token">비승인 파라미터</a></td></tr>
<tr><td class="title"><a href="/notices?id=6&id=7">중복 파라미터</a></td></tr>
<tr><td class="title"><a href="javascript:alert(1)">스크립트</a></td></tr>
<tr><td class="title"><a href="https://127.0.0.1/notices">IP</a></td></tr>
<tr><td class="title"><a href="/notices/%252fadmin">이중 인코딩</a></td></tr>
<tr><td class="title"><a href="/login">로그인</a></td></tr>
</tbody></table></main>`;
    const result=parseApprovedBoardCandidates({content:bytes(html),policy:scope});
    assert.deepEqual(result.posts.map(x=>x.title),['정상']);
  });
  it('rejects unsafe operator policy, destination, selectors and off-origin listing',()=>{
    for(const invalid of [
      {...scope,canonicalUrl:'https://evil.example.org/notices?page=1'},
      {...scope,canonicalUrl:'http://example.org/notices?page=1'},
      {...scope,canonicalUrl:'https://example.org./notices?page=1',
        approvedOrigin:'https://example.org./'},
      {...scope,canonicalUrl:'https://example.org/sso/login'},
      {...scope,canonicalUrl:'https://example.org/notices?secret=bad'},
      {...scope,rootSelector:'html body > main'},
      {...scope,selectors:{item:'table tbody tr',title:'td a[href]',date:'time',
        attachment:'.files a',pagination:'nav a'}},
      {...scope,selectors:{item:'table tbody tr',script:'iframe'}},
      {...scope,allowPathPrefixes:['/notices/../admin']},
      {...scope,allowedQueryKeys:['page','page']},
      {...scope,limit:99999},
    ])assert.throws(()=>parseApprovedBoardCandidates({content:bytes(table),policy:invalid}),
      /PUBLIC_BOARD_CANDIDATES_NOT_APPROVED/);
  });
  it('refuses duplicate URLs with inconsistent titles, excessive rows and DTDs',()=>{
    const duplicate=String.raw`<main><table><tbody>
<tr><td class="title"><a href="/notices?id=1">첫 번째</a></td></tr>
<tr><td class="title"><a href="/notices?id=1">서로 다른 제목</a></td></tr>
</tbody></table></main>`;
    for(const content of [
      duplicate,
      '<!DOCTYPE html SYSTEM "https://evil.example.org/xxe"><main><table/></main>',
      '<main><table><tbody>'+Array.from({length:301},(_,i)=>
        '<tr><td class="title"><a href="/notices?id='+i+'">공지</a></td></tr>').join('')+
        '</tbody></table></main>',
    ])assert.throws(()=>parseApprovedBoardCandidates({content:bytes(content),policy:scope}),
      /PUBLIC_BOARD_CANDIDATES_NOT_APPROVED/);
  });
  it('reports truncated review proposals without scheduling another fetch',()=>{
    const result=parseApprovedBoardCandidates({
      content:bytes(table),policy:{...scope,limit:1},
    });
    assert.equal(result.posts.length,1);
    assert.equal(result.hasMoreRows,true);
    assert.equal('fetch' in result,false);
    assert.equal('approved' in result,false);
  });
});
