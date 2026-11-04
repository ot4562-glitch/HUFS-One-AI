import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderReviewHtml} from '../review-html.mjs';
import {buildReviewPackage} from '../../../dist/evaluation/packages/core/src/evaluation/review-package.js';
import {emptyAnyReviewTemplate} from '../../../dist/evaluation/packages/core/src/evaluation/review-protocol.js';
const complete=buildReviewPackage({targetCommit:'c'.repeat(40)});
const packet={...complete,cases:complete.cases.slice(0,2),
 sources:complete.sources.filter(s=>complete.cases.slice(0,2).some(c=>c.sourceId===s.sourceId)),
 profiles:complete.profiles.filter(p=>p.profileId===complete.cases[0].profileId)};
function open(){
 const fullTemplate=emptyAnyReviewTemplate(complete),template={...fullTemplate,reviews:fullTemplate.reviews.slice(0,2)},downloads=[],errors=[];
 const dom=new JSDOM(renderReviewHtml(packet,template),{runScripts:'dangerously',url:'file:///synthetic-review.html',
  beforeParse(window){
   window.structuredClone=structuredClone;window.crypto.randomUUID=()=> 'SYN-EPHEMERAL-ID';
   window.Blob=Blob;window.URL.createObjectURL=blob=>{downloads.push(blob);return'blob:synthetic';};window.URL.revokeObjectURL=()=>{};
   window.HTMLAnchorElement.prototype.click=function(){};
   window.addEventListener('error',event=>errors.push(event.error));
  }});
 return{dom,template,downloads,errors,$:id=>dom.window.document.getElementById(id)};
}
test('offline editor preserves blank judgments and downloads unsigned edits without claiming review',async()=>{
 const x=open();try{
  assert.equal(x.$('case').options.length,2);assert.deepEqual(x.errors,[]);
  assert.equal(JSON.parse(x.$('editor').value).assessment,null);
  x.$('bindings').click();const row=JSON.parse(x.$('editor').value);
  assert.equal(row.decision,'NOT_RUN');assert.equal(row.reviewedAt,null);assert.equal(row.assessment.relevance,null);
  assert.equal(row.assessment.eligibility,null);assert(row.evidence.length>0);
  row.rationale='Unfinished local reviewer draft.';x.$('editor').value=JSON.stringify(row);
  x.$('draft').click();const saved=JSON.parse(await x.downloads[0].text());
  assert.equal(saved.reviews.length,2);assert.equal(saved.reviewerId,null);assert.equal(saved.signedAt,null);
  assert.equal(saved.reviews[0].rationale,row.rationale);assert.equal(saved.reviews[0].decision,'NOT_RUN');
 }finally{x.dom.window.close();}
});
test('saved draft can be resumed only against the same package and exact case hashes',async()=>{
 const x=open();try{
  const input=x.$('load');assert(input,'resume control required');
  const draft=structuredClone(x.template);draft.reviews[0].rationale='Resume this independently written local draft.';
  Object.defineProperty(input,'files',{configurable:true,value:[{size:1000,text:async()=>JSON.stringify(draft)}]});
  await input.onchange();assert.equal(JSON.parse(x.$('editor').value).rationale,draft.reviews[0].rationale);
  draft.packageSha256='0'.repeat(64);draft.reviews[0].rationale='Wrong package must not replace the current draft.';
  Object.defineProperty(input,'files',{configurable:true,value:[{size:1000,text:async()=>JSON.stringify(draft)}]});
  await input.onchange();assert.equal(JSON.parse(x.$('editor').value).rationale,'Resume this independently written local draft.');
  assert.match(x.$('message').textContent,/불러오지/);assert.deepEqual(x.errors,[]);
 }finally{x.dom.window.close();}
});
