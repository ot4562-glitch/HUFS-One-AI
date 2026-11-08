import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAuditReport,classifyAudit} from '../audit_dependency_vulnerabilities.mjs';

const payload=(counts={})=>JSON.stringify({metadata:{vulnerabilities:{
  info:0,low:0,moderate:0,high:0,critical:0,total:0,...counts}}});
const clean=parseAuditReport(payload(),0);

test('read-only audit parser accepts a valid empty advisory response',()=>{
  assert.deepEqual(clean,{info:0,low:0,moderate:0,high:0,critical:0,total:0});
  assert.equal(classifyAudit(clean,clean).blocked,false);
});
test('a high runtime advisory blocks both runtime and whole lockfile gates',()=>{
  const high=parseAuditReport(payload({high:1,total:1}),1);
  assert.deepEqual(classifyAudit(high,high).devOnly,
    {info:0,low:0,moderate:0,high:0,critical:0});
  assert.equal(classifyAudit(high,high).blocked,true);
});
test('a high development-only advisory is reported separately and still blocks',()=>{
  const all=parseAuditReport(payload({high:1,total:1}),1);
  const r=classifyAudit(clean,all);
  assert.equal(r.runtime.high,0);
  assert.equal(r.devOnly.high,1);
  assert.equal(r.blocked,true);
});
test('a moderate-only report is visible but does not trigger the high severity gate',()=>{
  const moderate=parseAuditReport(payload({moderate:1,total:1}),1);
  assert.equal(classifyAudit(moderate,moderate).blocked,false);
});
test('missing advisory database, npm failures and malformed response are not green',()=>{
  for(const [body,code] of [
    ['',1],['not-json',0],[JSON.stringify({error:{code:'ENOAUDIT'}}),1],
    [JSON.stringify({metadata:{}}),0],[payload(),2],
    [payload({critical:-1,total:-1}),1],[payload({high:2,total:0}),1],
  ])assert.throws(()=>parseAuditReport(body,code),/SCAN_UNAVAILABLE/);
});
test('runtime cannot have more findings than the full audit without an integrity failure',()=>{
  const high=parseAuditReport(payload({high:1,total:1}),1);
  assert.throws(()=>classifyAudit(high,clean),/SCAN_UNAVAILABLE/);
});
