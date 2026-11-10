import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {loadRegistry,validateRegistry} from './verify-seeds.mjs';
const clone=(v)=>structuredClone(v);
describe('HUFS public source discovery seed inventory',()=>{
  it('records cross-domain coverage and never claims raw acquisition',async()=>{
    const registry=await loadRegistry();
    const summary=validateRegistry(registry);
    assert.ok(summary.domainCount>=30);
    assert.equal(summary.realRecordsInThisRegistry,0);
    assert.ok(summary.gapDomains>0);
    assert.ok(summary.privateDomains>=2);
  });
  it('refuses foreign or credentialed URL sources',async()=>{
    const registry=await loadRegistry();
    for(const url of ['https://hufs.ac.kr.evil.example/notice',
       'https://user:pass@www.hufs.ac.kr/notice','http://www.hufs.ac.kr/notice']){
      const copy=clone(registry);copy.sources[0].url=url;
      assert.throws(()=>validateRegistry(copy));
    }
  });
  it('cannot silently pretend seed metadata is ingested content',async()=>{
    const copy=clone(await loadRegistry());copy.sources[0].contentAcquired=true;
    assert.throws(()=>validateRegistry(copy));
  });
  it('does not mix private user data and public discovery',async()=>{
    const copy=clone(await loadRegistry());
    const privateRow=copy.domains.find(d=>d.dataClass==='PRIVATE_OPT_IN');
    privateRow.sourceIds=[copy.sources[0].id];
    assert.throws(()=>validateRegistry(copy));
  });
  it('rejects unknown and duplicate source references',async()=>{
    const registry=await loadRegistry();
    const row=registry.domains.find(d=>d.readiness==='DISCOVERY_SEED_ONLY');
    for(const refs of [['UNKNOWN'],[row.sourceIds[0],row.sourceIds[0]]]){
      const copy=clone(registry);copy.domains.find(d=>d.id===row.id).sourceIds=refs;
      assert.throws(()=>validateRegistry(copy));
    }
  });
});
