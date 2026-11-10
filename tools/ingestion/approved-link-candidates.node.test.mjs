import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {extractReviewedLinkCandidates} from './approved-link-candidates.mjs';

// A small DOM-shaped fake: real Crawlee/Cheerio is the production parser.
function fakeDom(nodes){
  const $=value=>{
    if(typeof value==='string')return {each:callback=>{
      for(const [index,node] of nodes.entries())
        if(callback(index,node)===false)break;
    }};
    return {attr:name=>value.attrs?.[name],text:()=>value.text??''};
  };
  return $;
}
const source={canonicalUrl:'https://example.org/notices/page/1',
  approvedOrigin:'https://example.org/',allowPathPrefixes:['/notices','/files']};
const run=(nodes,kind='HTML',opts={})=>extractReviewedLinkCandidates({
  $:fakeDom(nodes),...source,kind,...opts,
});
describe('#445 offline HTML/RSS/Atom/sitemap candidate extraction',()=>{
  it('emits only same-origin bounded notice and attachment proposals, not jobs',()=>{
    const v=run([
      {attrs:{href:'/notices/123'},text:'가상 장학 공고'},
      {attrs:{href:'/notices/123'},text:'중복'},
      {attrs:{href:'https://example.org/files/attachment.pdf'},text:'서식'},
      {attrs:{href:'/sso/login'},text:'학적 로그인'},
      {attrs:{href:'https://evil.example.org/notices/1'},text:'외부'},
      {attrs:{href:'javascript:alert(1)'},text:'script'},
    ]);
    assert.equal(v.state,'REVIEW_REQUIRED');
    assert.deepEqual(v.candidates,[
      {url:'https://example.org/notices/123',type:'DOCUMENT',label:'가상 장학 공고'},
      {url:'https://example.org/files/attachment.pdf',type:'ATTACHMENT',label:'서식'},
    ]);
    assert.equal(v.scanned,6);
    assert.equal('approved' in v,false);
  });
  it('parses RSS, Atom and sitemap selector values without network',()=>{
    const rss=run([{text:'https://example.org/notices/123'}],'RSS');
    assert.deepEqual(rss.candidates,[{url:'https://example.org/notices/123',type:'DOCUMENT'}]);
    const atom=run([{attrs:{href:'/notices/456'}}],'ATOM');
    assert.deepEqual(atom.candidates,[{url:'https://example.org/notices/456',type:'DOCUMENT'}]);
    const map=run([{text:'https://example.org/files/a.hwpx'}],'SITEMAP');
    assert.deepEqual(map.candidates,[{url:'https://example.org/files/a.hwpx',type:'ATTACHMENT'}]);
  });
  it('refuses non-HTTPS and sensitive redirect/authority URLs',()=>{
    const v=run([
      {attrs:{href:'http://example.org/notices/1'}},
      {attrs:{href:'https://u:p@example.org/notices/1'}},
      {attrs:{href:'https://127.0.0.1/notices/1'}},
      {attrs:{href:'https://example.org/notices/%2e%2e/admin'}},
      {attrs:{href:'https://example.org/notices/1#token'}},
      {attrs:{href:'//other.example.org/notices/1'}},
      {attrs:{href:'https://example.org:8443/notices/2'}},
      {attrs:{href:'/notices/a'}},
    ]);
    assert.deepEqual(v.candidates,[{url:'https://example.org/notices/a',type:'DOCUMENT'}]);
  });
  it('does not discover outside operator-reviewed path prefixes',()=>{
    const v=run([{attrs:{href:'/notices-old/1'}},{attrs:{href:'/notices/1'}},
      {attrs:{href:'/notices/archive/2'}}], 'HTML',{allowPathPrefixes:['/notices']});
    assert.equal(v.candidates.length,2);
  });
  it('rejects unsafe scope, URL, parser or unbounded result limits',()=>{
    for(const opts of [{approvedOrigin:'https://other.example.org/'},
      {canonicalUrl:'http://example.org/notices/page/1'},
      {allowPathPrefixes:[]},{allowPathPrefixes:['../']},
      {allowPathPrefixes:['/notices/%2e%2e']},{limit:101},{kind:'UNKNOWN'}]){
      assert.throws(()=>run([],opts.kind||'HTML',opts),/SOURCE_CANDIDATES_NOT_APPROVED/);
    }
    assert.throws(()=>extractReviewedLinkCandidates({...source,$:null}),
      /SOURCE_CANDIDATES_NOT_APPROVED/);
  });
  it('caps large pages at 100 candidates and scans at most 500 nodes',()=>{
    const nodes=Array.from({length:600},(_,i)=>({
      attrs:{href:'/notices/'+i},text:'공고 '+i,
    }));
    assert.equal(run(nodes).candidates.length,100);
    const rejected=run(nodes,'HTML',{limit:1});
    assert.equal(rejected.candidates.length,1);
  });
});
