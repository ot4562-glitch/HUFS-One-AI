'use strict';

/** Node 24 runtime smoke for the *real inline* github-script workflow body.
 * This test executes no GitHub writes: all REST methods are local stubs.
 * Real webhook delivery/permissions and workflow_dispatch in Actions remain
 * separate operational acceptance evidence, not covered by these fixtures. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const ROOT=join(__dirname,'../..');
const source=readFileSync(join(ROOT,'.github/workflows/issue-initial-routing.yml'),'utf8');
function inlineScript(){
  const marker='          script: |';
  const index=source.indexOf(marker);
  assert.ok(index>=0,'github-script inline script is present');
  const text=source.slice(index+marker.length).replace(/^\r?\n/,'');
  const lines=[];
  for(const line of text.split(/\r?\n/)){
    if(line.startsWith('            '))lines.push(line.slice(12));
    else if(line.trim()==='')lines.push('');
    else break;
  }
  assert.ok(lines.some(line=>line.includes('routeIssue')),'actual router entrypoint must execute');
  return lines.join('\n');
}
const script=inlineScript();
const execute=new Function('github','context','core','require',
  'return (async function(){\n'+script+'\n})()');
const localRequire=(path)=>{
  assert.equal(path,'./.github/scripts/issue-router.cjs');
  return require(join(ROOT,'.github/scripts/issue-router.cjs'));
};
function fixture(issue,eventName,manualInputs={}){
  const calls=[],logs=[];
  const current={...issue,labels:issue.labels||[],assignees:issue.assignees||[],state:'open'};
  const rest={issues:{
    get:async({issue_number})=>{calls.push(['get',issue_number]);return {data:current};},
    getLabel:async()=>{calls.push(['getLabel']);return {data:{}};},
    createLabel:async()=>{calls.push(['createLabel']);return {data:{}};},
    addLabels:async({labels})=>{calls.push(['addLabels',labels]);return {data:{}};},
    removeLabel:async()=>{calls.push(['removeLabel']);return {data:{}};},
    addAssignees:async({assignees})=>{calls.push(['addAssignees',assignees]);return {data:{}};},
    listForRepo:async()=>{calls.push(['listForRepo']);return {data:[]};},
  }};
  const github={rest,paginate:async()=>[]};
  const context={repo:{owner:'synthetic',repo:'workflow-fixture'},eventName,
    payload:eventName==='workflow_dispatch'?{inputs:manualInputs}:{issue:{number:issue.number}}};
  const core={info:(s)=>logs.push(s),warning:(s)=>logs.push(s)};
  return {calls,logs,run:()=>execute(github,context,core,localRequire)};
}
const writes=new Set(['createLabel','addLabels','removeLabel','addAssignees']);

test('Node 24 workflow_dispatch dry_run invokes the real inline script without writes',async()=>{
  const f=fixture({number:98761,title:'[추가 기능] 합성 화면',body:'',labels:[],assignees:[]},
    'workflow_dispatch',{issue_number:'98761',dry_run:'true'});
  await f.run();
  assert.ok(f.logs.some(v=>v.includes('"status":"dry-run"')));
  assert.ok(!f.calls.some(v=>writes.has(v[0])));
});
test('synthetic opened and edited events call fresh REST get and protect frozen role issues',async()=>{
  for(const event of ['opened','edited']){
    for(const number of [355,356,357,358,359]){
      const f=fixture({number,title:'[본선 진출 이후] 수정 금지',body:'',labels:[],assignees:[]},event);
      await f.run();
      assert.ok(f.calls.some(v=>v[0]==='get'&&v[1]===number));
      assert.ok(f.logs.some(v=>v.includes('"status":"protected"')));
      assert.ok(!f.calls.some(v=>writes.has(v[0])));
    }
  }
});
test('synthetic issues.opened reaches label and assignee stubs, never production',async()=>{
  const f=fixture({number:98762,title:'[추가 기능] 합성 API 연결',body:'',labels:[],assignees:[]},'opened');
  await f.run();
  assert.ok(f.calls.filter(v=>v[0]==='get').length>=2,'the router must refresh current state');
  assert.ok(f.calls.some(v=>v[0]==='addLabels'));
  assert.ok(f.calls.some(v=>v[0]==='addAssignees'));
  assert.ok(f.logs.some(v=>v.includes('"status":"assigned"')));
});
