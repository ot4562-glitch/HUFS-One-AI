/** Opt-in real engine/namespace test, using synthetic in-memory source bytes.
 * Requires independently installed root-owned runtime artifacts. No network,
 * SQL approval, NCP connection, browser download or real source is created. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createApprovedPlaywrightExtractor} from './approved-playwright-extractor.mjs';
const enabled=process.env.HUFS_SOURCE_BROWSER_LINUX==='1';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('real Crawlee, Chromium and isolated namespace replay approved synthetic JS/JSON',
  {skip:!enabled,timeout:60000},async()=>{
    assert.equal(process.platform,'linux');assert.notEqual(process.getuid(),0);
    const runtime=JSON.parse(await readFile('/etc/hufs-one/source-browser-runtime.json','utf8'));
    const canonicalUrl='https://synthetic.example.edu/notice';
    const content=Buffer.from('<!doctype html><html><body><main><p>LOADING</p></main><script src="/app.js"></script></body></html>');
    const script=Buffer.from('fetch("/data.json").then(r=>r.json()).then(d=>document.querySelector("main").innerHTML="<p>"+d.title+"</p>")');
    const json=Buffer.from('{"title":"SYNTHETIC rendered notice"}');
    const resources=[['SCRIPT','app.js','text/javascript; charset=utf-8',script],['JSON','data.json','application/json',json]]
      .map(([kind,path,contentType,bytes],i)=>({bytes,contentType,manifest:{kind,canonicalUrl:'https://synthetic.example.edu/'+path,
        sourceId:'SYN-ASSET-'+i,revisionId:'SYN-ASSET-REV-'+i,permissionRef:'SYN-ASSET-PERM',rightsReceiptId:'SYN-RIGHT-'+i,
        originalSha256:sha(bytes),byteLength:bytes.length}}));
    const adapter=await createApprovedPlaywrightExtractor({runtime,enabled:true,resources:{load:async()=>({
      resources,revalidate:async()=>{},
    })}});
    const input={content,contentType:'text/html; charset=utf-8',canonicalUrl,sourceId:'SYN-SOURCE',
      sourceRevisionId:'SYN-REV',permissionRef:'SYN-PERM',actorRef:'SYN-OPERATOR',originalSha256:sha(content),
      assertSourceRights:async()=>{}};
    const result=await adapter.extract(input);
    assert.equal(result.evidence.originalSha256,sha(content));assert.notEqual(result.evidence.domSha256,sha(content));
    assert.equal(result.evidence.resources.length,2);assert.equal(result.evidence.reviewState,'NEEDS_REVIEW');
    assert.deepEqual(result.paragraphs,[{id:'p1',text:'SYNTHETIC rendered notice'}]);
    const unknown=Buffer.from('<html><body><main><p>SYNTHETIC</p></main><script src="https://unapproved.example.edu/foreign.js"></script></body></html>');
    await assert.rejects(adapter.extract({...input,content:unknown,originalSha256:sha(unknown),sourceRevisionId:'SYN-REV-2'}));
  });
