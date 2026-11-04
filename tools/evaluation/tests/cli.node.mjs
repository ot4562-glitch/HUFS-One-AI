import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),cli=join(root,'tools/evaluation/run.mjs');
function run(args){return spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});}
test('exports two blank review packages, actual assets and default NOT_RUN reports without overwriting legacy or an existing folder',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'eval61-cli-')),out=join(temp,'review'),head='f'.repeat(40);
 try{
  const legacy=await readFile(join(root,'packages/fixtures/synthetic/demo-snapshot.json'));
  const result=run(['export','--head',head,'--out',out]);assert.equal(result.status,0,result.stderr);
  const recommendation=JSON.parse(await readFile(join(out,'recommendation/package.json'),'utf8'));
  const media=JSON.parse(await readFile(join(out,'media/package.json'),'utf8'));
  assert.equal(recommendation.cases.length,200);assert.equal(media.cases.length,32);
  for(const name of ['recommendation','media']){
    const template=JSON.parse(await readFile(join(out,name,'review-template.json'),'utf8'));
    assert(template.reviews.every(r=>r.decision==='NOT_RUN'&&r.assessment===null&&r.reviewedAt===null));
    const html=await readFile(join(out,name,'review.html'),'utf8');assert.match(html,/서명은 실제 읽음/);assert.match(html,/connect-src 'none'/);
  }
  const report=run(['report','--package',join(out,'recommendation/package.json'),'--ledger',join(out,'recommendation/ledger.json')]);
  assert.equal(report.status,0,report.stderr);const summary=JSON.parse(report.stdout);
  assert.equal(summary.independentHumanLabelled,0);assert(summary.splits.every(s=>s.qualityState==='NOT_RUN'));
  const m=run(['media-report','--fixtures',join(out,'media/assets')]);assert.equal(m.status,0,m.stderr);
  const comparison=JSON.parse(m.stdout);assert.equal(comparison.temporal.passed,12);assert.equal(comparison.modes[1].status,'NOT_RUN');
  const independent=run(['media-report','--fixtures',join(out,'media/assets'),'--review-package',join(out,'media/package.json'),
    '--ledger',join(out,'media/ledger.json'),'--reference','INDEPENDENT']);
  assert.equal(independent.status,0,independent.stderr);
  assert.equal(JSON.parse(independent.stdout).referenceKind,'INDEPENDENT_NOT_RUN');assert.equal(JSON.parse(independent.stdout).modes[0].metrics,null);
  assert.equal((await stat(join(out,'media/assets/media/poster-001.png'))).size>0,true);
  assert.notEqual(run(['export','--head',head,'--out',out]).status,0);
  assert.deepEqual(await readFile(join(root,'packages/fixtures/synthetic/demo-snapshot.json')),legacy);
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('rejects unsigned import, stale manifests and private-identity/notes leakage to stdout',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'eval61-cli-')),out=join(temp,'review');
 try{
  const exported=run(['export','--head','a'.repeat(40),'--out',out]);assert.equal(exported.status,0,exported.stderr);
  const args=['import','--package',join(out,'recommendation/package.json'),'--ledger',join(out,'recommendation/ledger.json'),
    '--submission',join(out,'recommendation/review-template.json')];
  const before=await readFile(join(out,'recommendation/ledger.json'));
  const denied=run(args);assert.notEqual(denied.status,0);assert.match(denied.stderr,/EVALUATION_VALIDATION_FAILED/);
  assert.deepEqual(await readFile(join(out,'recommendation/ledger.json')),before);
  const manifestPath=join(out,'media/assets/manifest.json'),m=JSON.parse(await readFile(manifestPath,'utf8'));m.posters[0].expected.eligibility='UNKNOWN';
  await writeFile(manifestPath,JSON.stringify(m));assert.notEqual(run(['media-report','--fixtures',join(out,'media/assets')]).status,0);
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('executes at least fifty cold/warm core samples and one hundred local direction switches',()=>{
 const r=run(['benchmark','--samples','50']);assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);
 assert.equal(result.samples,50);assert.equal(result.uncached.count,50);assert.equal(result.localMapHit.count,50);
 assert.deepEqual([result.directionSwitches.distinctDirections,result.directionSwitches.count,result.directionSwitches.externalModelCalls],[20,100,0]);
 assert.equal(result.api,'NOT_RUN');assert.equal(result.modes.layaOn,'NOT_RUN');assert.equal(result.environment.node,process.version);
});

test('canonical signing, independent test authority, append and exact replay work through the actual CLI',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'eval61-sign-')),out=join(temp,'review');
 const digest=b=>createHash('sha256').update(b).digest('hex');
 const stable=v=>JSON.stringify(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):
   Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])));
 try{
  const head='b'.repeat(40),exported=run(['export','--head',head,'--out',out]);assert.equal(exported.status,0,exported.stderr);
  const packetPath=join(out,'recommendation/package.json'),ledgerPath=join(out,'recommendation/ledger.json');
  const packet=JSON.parse(await readFile(packetPath,'utf8')),item=packet.cases[0],now=new Date().toISOString(),epoch=Date.parse(now);
  const {publicKey,privateKey}=generateKeyPairSync('ed25519'),der=publicKey.export({type:'spki',format:'der'}),keyId=digest(der);
  const registry={schemaVersion:'reviewer-authority-v1',environment:'SYNTHETIC_TEST',registryId:'SYN-CLI-REGISTRY',
   approvedBy:'SYN-OPERATOR',approvalEvidenceId:'SYN-ONLY-NOT-HUMAN',approvedAt:new Date(epoch-60000).toISOString(),
   reviewers:[{reviewerId:'SYN-CLI-REVIEWER',role:'INDEPENDENT_REVIEWER',keyId,publicKeySpki:der.toString('base64'),
    scopes:[{gateId:'D01',packageSha256:packet.packageSha256,targetCommit:head}],startsAt:new Date(epoch-60000).toISOString(),
    expiresAt:new Date(epoch+3600000).toISOString(),revokedAt:null}]};
  const payload={schemaVersion:'review-submission-v1',gateId:'D01',submissionId:'SYN-CLI-SUB',signatureId:'SYN-CLI-SIGNATURE',
   packageSha256:packet.packageSha256,targetCommit:head,reviewerId:'SYN-CLI-REVIEWER',signedAt:now,expectedLedgerHead:'0'.repeat(64),
   reviews:[{reviewId:'SYN-CLI-ROW',caseId:item.caseId,caseSha256:item.caseSha256,reviewedAt:now,decision:'LABELLED',
    assessment:{kind:'RECOMMENDATION',relevance:item.draft.relevance,eligibility:'UNKNOWN',
      conditions:item.conditions.map(c=>({evidenceId:c.evidenceId,outcome:'UNKNOWN'}))},
    rationale:'SYNTHETIC PRIVATE NOTE MUST NOT APPEAR ON STDOUT',unknownReason:'Protocol only, no real reading.',
    evidence:item.evidence.slice(0,1),reviewEvidenceId:'SYN-CLI-EVIDENCE',amendsReviewId:null,correctionReason:null,anchor:{selected:false,reason:null}}]};
  const draft=join(temp,'draft.json'),canonical=join(temp,'payload.json'),sig=join(temp,'signature.bin'),submission=join(temp,'submission.json'),auth=join(temp,'authority.json');
  await writeFile(draft,JSON.stringify(payload));await writeFile(auth,JSON.stringify(registry));
  const prepared=run(['prepare','--package',packetPath,'--input',draft,'--out',canonical]);assert.equal(prepared.status,0,prepared.stderr);
  assert.equal((await readFile(canonical)).toString(),stable(payload));
  await writeFile(sig,sign(null,await readFile(canonical),privateKey));
  const assembled=run(['assemble','--payload',canonical,'--signature-file',sig,'--key-id',keyId,'--out',submission]);assert.equal(assembled.status,0,assembled.stderr);
  const args=['import','--package',packetPath,'--ledger',ledgerPath,'--submission',submission,'--authority',auth,'--authority-sha256',digest(stable(registry))];
  const appended=run(args);assert.equal(appended.status,0,appended.stderr);
  assert(!appended.stdout.includes('PRIVATE NOTE'));assert(!appended.stdout.includes('SYN-CLI-REVIEWER'));
  assert.deepEqual([JSON.parse(appended.stdout).status,JSON.parse(appended.stdout).syntheticSignedCases,JSON.parse(appended.stdout).independentHumanLabelled],['APPENDED',1,0]);
  const ledgerBefore=await readFile(ledgerPath),replayed=run(args);assert.equal(replayed.status,0,replayed.stderr);
  assert.equal(JSON.parse(replayed.stdout).status,'EXACT_REPLAY');assert.deepEqual(await readFile(ledgerPath),ledgerBefore);
  const stolenPin=[...args];stolenPin[stolenPin.length-1]='0'.repeat(64);assert.notEqual(run(stolenPin).status,0);
  assert.deepEqual(await readFile(ledgerPath),ledgerBefore);
 }finally{await rm(temp,{recursive:true,force:true});}
});
