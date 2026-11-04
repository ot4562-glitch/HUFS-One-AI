import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {auditEntrypoints,isAllowedPath} from '../audit_entrypoints.mjs';

const roots=[];
afterEach(async()=>{for(const root of roots.splice(0)){
  assert.ok(root.startsWith(join(tmpdir(),'hufs-entrypoints-')));
  await rm(root,{recursive:true,force:true});
}});
async function fixture(extra={}){
  const root=await mkdtemp(join(tmpdir(),'hufs-entrypoints-'));roots.push(root);
  const files={
    'package.json':JSON.stringify({scripts:{admin:'node dist/apps/api/src/admin/reviewer-invite.js',
      e2e:'playwright test -c apps/web/playwright.config.ts'}}),
    'vitest.config.ts':"export default {test:{include:['tests/**/*.test.ts']}};",
    'tools/entrypoints.json':JSON.stringify({version:1,conditions:[{path:'infra/ai/worker.mjs',
      owner:'PLATFORM',condition:'EXPLICIT_OPT_IN',verify:'node --test tests/worker.test.ts'}]}),
    'apps/api/src/main.ts':"import './lib.js'; const worker = new URL('../../../infra/ai/worker.mjs',import.meta.url);",
    'apps/api/src/lib.ts':'export const value=1;',
    'apps/api/src/admin/reviewer-invite.ts':'export const cli=true;',
    'apps/web/playwright.config.ts':"export default {testDir:'./e2e'};",
    'apps/web/e2e/ui.spec.ts':"export const synthetic=true;",
    'tests/worker.test.ts':"import '../apps/api/src/main.js';",
    'infra/ai/worker.mjs':'export const worker=true;',
    ...extra};
  for(const [path,body] of Object.entries(files)){
    await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),body);
  }
  const git=(...args)=>execFileSync('git',['-c','commit.gpgsign=false','-c',`core.hooksPath=${join(root,'no-hooks')}`,...args],
    {cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git('init','-q');git('add','.');git('-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','commit','-qm','synthetic fixture');
  return {root,git};
}

test('preserves package CLI, Playwright spec, worker and Vitest entrypoints without static importers',async()=>{
  const {root}=await fixture();const r=await auditEntrypoints(root);
  assert.equal(r.findings.length,0);
  assert.match(r.sha,/^[a-f0-9]{40}$/);
  assert.ok(r.entrypoints.some(e=>e.path==='apps/api/src/admin/reviewer-invite.ts'&&e.kind==='PACKAGE_SCRIPT'));
  assert.ok(r.entrypoints.some(e=>e.path==='apps/web/e2e/ui.spec.ts'&&e.kind==='PLAYWRIGHT_TEST'));
  assert.ok(r.entrypoints.some(e=>e.path==='tests/worker.test.ts'&&e.kind==='VITEST_TEST'));
  assert.ok(r.entrypoints.some(e=>e.path==='infra/ai/worker.mjs'&&e.condition==='EXPLICIT_OPT_IN'));
  assert.ok(!r.unreferenced.includes('apps/api/src/admin/reviewer-invite.ts'));
  assert.equal(r.prCoverage,'NOT_PROVIDED');assert.equal(r.status,'PARTIAL');
});

test('reports missing literal module and SQL references with source location',async()=>{
  const {root}=await fixture({'apps/api/src/broken.ts':
    "import './absent.js'; const sql=new URL('../../../infra/sql/missing.sql',import.meta.url);"});
  const r=await auditEntrypoints(root);
  assert.deepEqual(r.findings.map(f=>f.target).sort(),['apps/api/src/absent.js','infra/sql/missing.sql']);
  assert.ok(r.findings.every(f=>f.code==='MISSING_TRACKED_REFERENCE'&&f.line===1));
});

test('records SQL directory loading without inventing a missing .ts module and detects stale source links',async()=>{
  const {root}=await fixture({'infra/sql/001.sql':'SELECT 1;',
    'apps/api/src/sql.ts':"const dir=new URL('../../../infra/sql/',import.meta.url); const name='001.sql'; const sql=new URL('../../../infra/sql/'+name,import.meta.url);",
    'README.md':'[deleted source](apps/api/src/deleted.ts)'});
  const r=await auditEntrypoints(root);
  assert.deepEqual(r.findings.map(f=>f.target),['apps/api/src/deleted.ts']);
  assert.ok(r.entrypoints.some(e=>e.path==='infra/sql/001.sql'&&e.kind==='SQL_MIGRATION'));
  assert.ok(r.unknown.some(e=>e.reason==='DYNAMIC_MODULE_URL'));
});

test('retains unresolved dynamic modules as UNKNOWN instead of asserting dead code',async()=>{
  const {root}=await fixture({'apps/api/src/dynamic.ts':"export const load = path => import(path);"});
  const r=await auditEntrypoints(root);
  assert.equal(r.findings.length,0);
  assert.ok(r.unknown.some(x=>x.path==='apps/api/src/dynamic.ts'&&x.reason==='DYNAMIC_IMPORT'));
  assert.ok(r.unreferenced.includes('apps/api/src/dynamic.ts'));
  assert.ok(!JSON.stringify(r).includes('deadCode'));
});

test('preserves Worker constructors, aliases and cwd-dependent strings instead of dropping them',async()=>{
  const {root}=await fixture({'apps/api/src/workers.ts':
    "import {Worker as Thread} from 'node:worker_threads'; new Thread(workerPath); new Worker('./worker.mjs'); new Thread(new URL('../../../infra/ai/worker.mjs',import.meta.url)); new Thread(new URL('./missing-worker.mjs',import.meta.url));"});
  const r=await auditEntrypoints(root);
  assert.ok(r.unknown.some(x=>x.path==='apps/api/src/workers.ts'&&x.reason==='DYNAMIC_WORKER'));
  assert.ok(r.unknown.some(x=>x.path==='apps/api/src/workers.ts'&&x.reason==='WORKER_STRING_BASE_UNKNOWN'));
  assert.ok(r.entrypoints.some(x=>x.path==='infra/ai/worker.mjs'&&x.kind==='WORKER'));
  assert.ok(r.findings.some(x=>x.target==='apps/api/src/missing-worker.mjs'));
});

test('never reads protected paths or includes protected names and contents',async()=>{
  const {root}=await fixture({'private/DO-NOT-READ.ts':'PROTECTED-SENTINEL',
    'packages/fixtures/real/DO-NOT-READ.ts':'PROTECTED-SENTINEL',
    'csv/DO-NOT-READ.csv':'PROTECTED-SENTINEL'});
  const r=await auditEntrypoints(root);const output=JSON.stringify(r);
  assert.ok(r.excluded>=1);
  assert.ok(!output.includes('DO-NOT-READ'));assert.ok(!output.includes('PROTECTED-SENTINEL'));
  for(const path of ['private/a.ts','windows-api-credentials/a.ts','apps/../../private/a.ts',
    'apps/Private/a.ts','C:/private/a.ts','/apps/a.ts','packages/fixtures/real/a.ts'])assert.equal(isAllowedPath(path),false);
});

test('connects complete PR head/base and shared file changes but rejects partial pagination',async()=>{
  const {root}=await fixture();
  const items=[{number:1,head:'feature-a',base:'main',files:['apps/api/src/lib.ts']},
    {number:2,head:'feature-b',base:'feature-a',files:['apps/api/src/lib.ts']}];
  const partial=await auditEntrypoints(root,{prs:{complete:true,pagesRead:1,pagesExpected:2,items}});
  assert.equal(partial.prCoverage,'INCOMPLETE');assert.equal(partial.status,'PARTIAL');
  const r=await auditEntrypoints(root,{prs:{complete:true,pagesRead:2,pagesExpected:2,items}});
  assert.equal(r.prCoverage,'COMPLETE');assert.equal(r.status,'COMPLETE');
  assert.deepEqual(r.pullRequests.dependencies,[{number:2,dependsOn:1}]);
  assert.deepEqual(r.pullRequests.overlaps,[{path:'apps/api/src/lib.ts',numbers:[1,2]}]);
});

test('does not inspect a file beyond its bound or claim a complete truncated scan',async()=>{
  const {root}=await fixture({'apps/api/src/big.ts':'x'.repeat(1024)});
  const r=await auditEntrypoints(root,{maxFileBytes:512});
  assert.equal(r.status,'PARTIAL');assert.equal(r.staticCoverage,'INCOMPLETE');
  assert.ok(r.unknown.some(x=>x.path==='apps/api/src/big.ts'&&x.reason==='FILE_LIMIT'));
});
