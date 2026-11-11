import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import * as native from './native-worker.mjs';

const canonicalUrl='https://synthetic.example.edu/approved/notice';
describe('#445 real CheerioCrawler acquisition uses only a supplied exact request',()=>{
  it('uses the real crawler/client interface without default networking or persisted sources',async()=>{
    assert.equal(typeof native.createApprovedCheerioAcquisition,'function');
    const driver=native.createApprovedCheerioAcquisition();let calls=0;
    const bytes=Buffer.from('<!doctype html><main><h1>합성 안내</h1><p>공고 후보</p></main>');
    await driver.acquire({canonicalUrl,request:async()=>{calls++;return new Response(bytes,{headers:{'content-type':'text/html; charset=utf-8'}});}});
    assert.equal(calls,1);
  });
  it('preserves a conditional 304 and processes binary bytes without treating them as HTML',async()=>{
    assert.equal(typeof native.createApprovedCheerioAcquisition,'function');
    const driver=native.createApprovedCheerioAcquisition();
    for(const [status,content,contentType] of [[304,null,null],[200,Buffer.from([0,255,128,1]),'application/pdf']]){
      let calls=0;
      await driver.acquire({canonicalUrl,request:async()=>{calls++;return new Response(content,{status,
        ...(contentType?{headers:{'content-type':contentType}}:{})});}});
      assert.equal(calls,1);
    }
  });
  it('never retries a failed guarded source operation or exposes the private failure message',async()=>{
    assert.equal(typeof native.createApprovedCheerioAcquisition,'function');
    let calls=0;
    await assert.rejects(native.createApprovedCheerioAcquisition().acquire({canonicalUrl,
      request:async()=>{calls++;throw new Error('PRIVATE SOURCE OR TOKEN');}}),
    error=>error.message==='Approved Crawlee acquisition failed');
    assert.equal(calls,1);
  });
  it('refuses an invalid exact source authority before requesting anything',async()=>{
    assert.equal(typeof native.createApprovedCheerioAcquisition,'function');
    for(const url of ['http://example.org','https://127.0.0.1','https://user:secret@example.org','https://example.org/#x']){
      let calls=0;
      await assert.rejects(native.createApprovedCheerioAcquisition().acquire({canonicalUrl:url,
        request:async()=>{calls++;return new Response('not reached');}}));
      assert.equal(calls,0);
    }
  });
});
