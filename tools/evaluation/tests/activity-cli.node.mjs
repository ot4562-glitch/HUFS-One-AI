import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../../',import.meta.url)),cli=join(root,'tools/evaluation/run.mjs');
const fixture=join(root,'tools/evaluation/fixtures/activity-origins.synthetic.json');
const run=args=>spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
test('activity CLI requires a private output file, binds executed code/input and refuses overwrite or invalid data without leaking it',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'hufs-activity-evaluation-')),out=join(dir,'report.json');
  try{
    const result=run(['activity-evaluate','--input',fixture,'--out',out]);assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),{status:'REPORT_WRITTEN'});
    const report=JSON.parse(await readFile(out,'utf8'));
    assert.equal(report.datasetKind,'SYNTHETIC');assert.equal(report.status,'READY');assert.equal(report.releaseEligible,false);
    assert.match(report.inputSha256,/^[a-f0-9]{64}$/);assert.match(report.implementationSha256,/^[a-f0-9]{64}$/);
    assert(report.total.scored>0);assert.equal(report.independentAcceptance,'NOT_RUN');
    const before=await readFile(out);
    assert.notEqual(run(['activity-evaluate','--input',fixture,'--out',out]).status,0);
    assert.deepEqual(await readFile(out),before);
    assert.notEqual(run(['activity-evaluate','--input',fixture]).status,0);
    const bad=join(dir,'bad.json');await writeFile(bad,JSON.stringify({privateTitle:'DO_NOT_PRINT_PRIVATE_DATA'}));
    const rejected=run(['activity-evaluate','--input',bad,'--out',join(dir,'invalid.json')]);
    assert.notEqual(rejected.status,0);assert.equal((rejected.stdout+rejected.stderr).includes('DO_NOT_PRINT_PRIVATE_DATA'),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
