import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const command=resolve('tools/dependency_bom.mjs');
function fixture({installed='MIT',declared='MIT',licenseFile=true}={}){
  const root=mkdtempSync(join(tmpdir(),'hufs-bom-'));
  const path=join(root,'node_modules','@fixture','library');
  mkdirSync(path,{recursive:true});
  writeFileSync(join(root,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages:{
    '':{dependencies:{'@fixture/library':'1.2.3'}},
    'node_modules/@fixture/library':{version:'1.2.3',license:declared,
      resolved:'https://registry.npmjs.org/@fixture/library/-/library-1.2.3.tgz',
      integrity:'sha512-'+Buffer.alloc(64,1).toString('base64')},
  }}));
  writeFileSync(join(path,'package.json'),JSON.stringify({name:'@fixture/library',version:'1.2.3',license:installed}));
  if(licenseFile)writeFileSync(join(path,'LICENSE'),'Synthetic license evidence only.');
  return root;
}
function run(root,...args){
  return spawnSync(process.execPath,[command,'--root',root,...args],{encoding:'utf8',timeout:10000});
}
const properties=value=>Object.fromEntries(value.properties.map(item=>[item.name,item.value]));

test('exports deterministic CycloneDX pre-build components without inventing artifact verification',()=>{
  const root=fixture();
  try{
    const first=run(root),second=run(root);
    assert.equal(first.status,0,first.stderr);
    assert.equal(first.stdout,second.stdout);
    const bom=JSON.parse(first.stdout);
    assert.equal(bom.bomFormat,'CycloneDX');
    assert.equal(bom.specVersion,'1.6');
    assert.equal(bom.version,1);
    assert.deepEqual(bom.metadata.lifecycles,[{phase:'pre-build'}]);
    assert.equal(bom.components.length,1);
    const component=bom.components[0];
    assert.equal(component.type,'library');
    assert.equal(component.group,'@fixture');
    assert.equal(component.name,'library');
    assert.equal(component.version,'1.2.3');
    assert.equal(component.purl,'pkg:npm/%40fixture/library@1.2.3');
    assert.deepEqual(component.licenses,[{license:{name:'MIT'}}]);
    assert.equal(component.hashes,undefined);
    assert.equal(bom.dependencies,undefined);
    assert.equal(properties(bom.metadata)['hufs:dependencyGraph'],'NOT_VERIFIED');
    assert.equal(properties(bom.metadata)['hufs:releaseDecision'],'RELEASE_BLOCKED');
    assert.match(properties(bom.metadata)['hufs:lockfileSha256'],/^[a-f0-9]{64}$/);
    assert.equal(properties(component)['hufs:licenseEvidence'],'PRESENT');
    assert.equal(properties(component)['hufs:direct'],'true');
    assert.equal(properties(component)['hufs:usage'],'RUNTIME_OR_SHARED');
    assert.match(component['bom-ref'],/^urn:hufs:dependency:[a-f0-9]{64}$/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('retains incomplete license evidence as an explicit gap with a non-success exit',()=>{
  const root=fixture({declared:undefined,installed:undefined,licenseFile:false});
  // JSON omits undefined fields, so no declaration is manufactured by the fixture.
  writeFileSync(join(root,'node_modules','@fixture','library','package.json'),
    JSON.stringify({name:'@fixture/library',version:'1.2.3'}));
  const path=join(root,'package-lock.json');
  writeFileSync(path,JSON.stringify({lockfileVersion:3,packages:{
    '':{dependencies:{'@fixture/library':'1.2.3'}},
    'node_modules/@fixture/library':{version:'1.2.3',
      resolved:'https://registry.npmjs.org/@fixture/library/-/library-1.2.3.tgz',
      integrity:'sha512-'+Buffer.alloc(64,1).toString('base64')},
  }}));
  try{
    const result=run(root);assert.equal(result.status,1);
    const bom=JSON.parse(result.stdout);
    assert.equal(bom.components[0].licenses,undefined);
    assert.equal(properties(bom.components[0])['hufs:licenseEvidence'],'UNKNOWN');
    assert.equal(properties(bom.metadata)['hufs:inventoryStatus'],'PARTIAL');
    assert.equal(properties(bom.metadata)['hufs:releaseDecision'],'RELEASE_BLOCKED');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('does not resolve conflicting license declarations into an asserted license',()=>{
  const root=fixture({installed:'GPL-3.0-only',declared:'MIT'});
  try{
    const result=run(root);assert.equal(result.status,1);
    const bom=JSON.parse(result.stdout);
    assert.equal(bom.components[0].licenses,undefined);
    assert.equal(properties(bom.components[0])['hufs:licenseEvidence'],'CONFLICT');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('reports unavailable input and invalid flags without echoing private paths',()=>{
  for(const result of [run('/synthetic-private-marker/missing'),run('/synthetic-private-marker','--unsafe')]){
    assert.equal(result.status,2);
    assert.doesNotMatch(result.stdout+result.stderr,/synthetic-private-marker/);
    assert.deepEqual(JSON.parse(result.stdout),{
      status:'UNAVAILABLE',reason:'DEPENDENCY_BOM_UNAVAILABLE',releaseDecision:'RELEASE_BLOCKED',
    });
  }
});
