#!/usr/bin/env node
import {readFile,writeFile,mkdir,lstat,open,rename,unlink} from 'node:fs/promises';
import {dirname,resolve,join,parse} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {platform,arch,cpus} from 'node:os';
import {z} from 'zod';
import {buildReviewPackage} from '../../dist/evaluation/packages/core/src/evaluation/review-package.js';
import {buildMediaReviewPackage} from '../../dist/evaluation/packages/core/src/evaluation/media-review-package.js';
import {validateAnyReviewPackage,emptyAnyReviewTemplate} from '../../dist/evaluation/packages/core/src/evaluation/review-protocol.js';
import {emptyReviewLedger,inspectReviewLedger,prepareReviewPayload,importSignedReviewBatch,createReviewerAuthority,
  AuthorityConfig,ReviewPayloadSchema,SignedReviewSchema,ReviewLedgerSchema} from '../../dist/evaluation/packages/core/src/evaluation/review-ledger.js';
import {canonicalJson,hashBytes,hashCanonical} from '../../dist/evaluation/packages/core/src/evaluation/canonical.js';
import {recommendationReport,RankEnrichmentObservationSchema} from '../../dist/evaluation/packages/core/src/evaluation/recommendation-report.js';
import {buildMediaFixturePack,validateMediaFixturePack} from '../../dist/evaluation/packages/core/src/evaluation/media-fixtures.js';
import {mediaComparisonReport,MediaObservationSchema} from '../../dist/evaluation/packages/core/src/evaluation/media-evaluation.js';
import {runCoreBenchmark} from '../../dist/evaluation/packages/core/src/evaluation/core-benchmark.js';
import {renderReviewHtml} from './review-html.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),FIXTURE_DIR=join(root,'packages/fixtures/synthetic/evaluation-v1');
const schemaVersion='https://json-schema.org/draft/2020-12/schema',MAX_JSON=10*1024*1024;
function args(raw){const [command,...rest]=raw,options={};for(let i=0;i<rest.length;i+=2){
  const name=rest[i];if(!name?.startsWith('--')||rest[i+1]===undefined||rest[i+1].startsWith('--')||name in options)throw Error();
  options[name]=rest[i+1];}return{command,options};}
function required(options,name){const value=options[name];if(!value)throw Error();return value;}
async function safePath(path){const full=resolve(path),parts=full.slice(parse(full).root.length).split(/[\\/]/);let current=parse(full).root;
 for(const part of parts){current=join(current,part);try{if((await lstat(current)).isSymbolicLink())throw Error('symlink');}catch(e){if(e.code==='ENOENT')break;throw e;}}
 return full;}
async function boundedBytes(path,limit=MAX_JSON){const file=await safePath(path),st=await lstat(file);
 if(!st.isFile()||st.size>limit)throw Error();const bytes=await readFile(file);if(bytes.length>limit)throw Error();return bytes;}
async function json(path){return JSON.parse((await boundedBytes(path)).toString('utf8'));}
async function newFile(path,bytes){const file=await safePath(path);await mkdir(dirname(file),{recursive:true,mode:0o700});
 await safePath(dirname(file));await writeFile(file,bytes,{flag:'wx',mode:0o600});}
const jsonText=value=>JSON.stringify(value,null,2)+'\n';
async function newJson(path,value){await newFile(path,jsonText(value));}
async function freshDirectory(path){const dir=await safePath(path);await mkdir(dirname(dir),{recursive:true,mode:0o700});await mkdir(dir,{mode:0o700});return dir;}
async function authority(options){
 if(!options['--authority']){if(options['--authority-sha256'])throw Error();return undefined;}
 return createReviewerAuthority(await json(options['--authority']),required(options,'--authority-sha256'));
}
async function fixturesAt(directory,{create=false}={}){
 const pack=buildMediaFixturePack();
 if(create){
  await mkdir(directory,{recursive:true,mode:0o700});
  for(const asset of pack.assets)await newFile(join(directory,asset.path),asset.bytes);
  await newJson(join(directory,'manifest.json'),pack.manifest);
  await newJson(join(directory,'manifest.schema.json'),{$schema:schemaVersion,title:'Exact versioned synthetic media reference',const:pack.manifest});
  return pack;
 }
 const manifest=await json(join(directory,'manifest.json')),assets=new Map();
 const referenceSchema=await json(join(directory,'manifest.schema.json'));
 if(canonicalJson(referenceSchema)!==canonicalJson({$schema:schemaVersion,title:'Exact versioned synthetic media reference',const:pack.manifest}))throw Error();
 for(const asset of pack.assets)assets.set(asset.path,await boundedBytes(join(directory,asset.path),256*1024));
 validateMediaFixturePack(manifest,assets);return{manifest,assets:[...assets].map(([path,bytes])=>({path,bytes}))};
}
async function exportPacket(folder,packet,images){
 await mkdir(folder,{recursive:true,mode:0o700});const template=emptyAnyReviewTemplate(packet);
 await newJson(join(folder,'package.json'),packet);await newJson(join(folder,'package.schema.json'),{$schema:schemaVersion,const:packet});
 await newJson(join(folder,'review-template.json'),template);await newJson(join(folder,'ledger.json'),emptyReviewLedger(packet));
 await newFile(join(folder,'review.html'),renderReviewHtml(packet,template,images));
}
async function exportAll(options){
 const head=required(options,'--head'),out=await freshDirectory(required(options,'--out'));
 const recommendation=buildReviewPackage({targetCommit:head}),media=buildMediaReviewPackage({targetCommit:head});
 const fixtures=await fixturesAt(join(out,'media/assets'),{create:true}),images={};
 for(const poster of fixtures.manifest.posters)images[poster.id]='data:image/png;base64,'+
   Buffer.from(fixtures.assets.find(a=>a.path===poster.image.path).bytes).toString('base64');
 await exportPacket(join(out,'recommendation'),recommendation,{});
 await exportPacket(join(out,'media'),media,images);
 for(const [name,schema]of Object.entries({reviewPayload:ReviewPayloadSchema,signedReview:SignedReviewSchema,
   reviewLedger:ReviewLedgerSchema,reviewerAuthority:AuthorityConfig,mediaObservation:MediaObservationSchema,rankEnrichment:RankEnrichmentObservationSchema}))
   await newJson(join(out,'schemas',name+'.schema.json'),z.toJSONSchema(schema));
 await newJson(join(out,'authority-template.json'),{schemaVersion:'reviewer-authority-v1',environment:null,registryId:null,
   approvalEvidenceId:null,approvedBy:null,approvedAt:null,reviewers:[]});
 const doc=await boundedBytes(join(root,'docs/INDEPENDENT_EVALUATION.md'));await newFile(join(out,'README.md'),doc);
 return{status:'EXPORTED_UNSIGNED',targetCommit:head,recommendationCases:200,mediaCases:32,independentHumanLabelled:0,
   packageSha256:{recommendation:recommendation.packageSha256,media:media.packageSha256}};
}
async function appendImport(options){
 const packet=validateAnyReviewPackage(await json(required(options,'--package'))),file=await safePath(required(options,'--ledger'));
 const approved=await authority(options);if(!approved)throw Error();
 const submission=await json(required(options,'--submission'));let lock,temp;
 try{
  lock=await open(file+'.lock','wx',0o600);const before=await boundedBytes(file),ledger=JSON.parse(before.toString('utf8'));
  const next=importSignedReviewBatch(ledger,packet,submission,{authority:approved,now:new Date().toISOString()});
  if(next.headHash!==ledger.headHash){
   const entry=next.entries.at(-1),journal=file+'.entries';
   await mkdir(journal,{recursive:true,mode:0o700});await safePath(journal);
   const journalFile=join(journal,entry.sequence+'-'+entry.entryHash+'.json');
   try{await newJson(journalFile,entry);}catch(e){if(e.code!=='EEXIST'||canonicalJson(await json(journalFile))!==canonicalJson(entry))throw e;}
   temp=file+'.tmp-'+randomUUID();const handle=await open(temp,'wx',0o600);
   try{await handle.writeFile(jsonText(next));await handle.sync();}finally{await handle.close();}
   if(hashBytes(await boundedBytes(file))!==hashBytes(before))throw Error();
   await rename(temp,file);temp=undefined;
  }
  const report=inspectReviewLedger(next,packet,{authority:approved,now:new Date().toISOString()});
  return{status:next.headHash===ledger.headHash?'EXACT_REPLAY':'APPENDED',ledgerHead:next.headHash,
    independentHumanLabelled:report.independentHumanLabelled,syntheticSignedCases:report.syntheticSignedCases,
    pendingHumanCases:report.pendingHumanCases,humanAcceptance:report.humanAcceptance};
 }finally{if(temp)await unlink(temp).catch(()=>{});if(lock){await lock.close();await unlink(file+'.lock');}}
}
async function main(){
 const {command,options}=args(process.argv.slice(2));let result;
 const allowed={
  export:['--head','--out'],fixtures:['--action'],prepare:['--package','--input','--out'],
  assemble:['--payload','--signature-file','--key-id','--out'],import:['--package','--ledger','--submission','--authority','--authority-sha256'],
  report:['--package','--ledger','--authority','--authority-sha256','--reference','--enrichment','--out'],
  'ledger-report':['--package','--ledger','--authority','--authority-sha256'],
  'media-report':['--fixtures','--ocr-observation','--hcx-observation','--out','--review-package','--ledger','--reference','--authority','--authority-sha256'],benchmark:['--samples','--out'],
  'authority-digest':['--authority'],
 };
 if(!allowed[command]||Object.keys(options).some(k=>!allowed[command].includes(k)))throw Error();
 if(command==='export')result=await exportAll(options);
 else if(command==='fixtures'){
  const action=required(options,'--action');if(!['generate','check'].includes(action))throw Error();
  if(action==='generate'){await freshDirectory(FIXTURE_DIR);await fixturesAt(FIXTURE_DIR,{create:true});}
  else await fixturesAt(FIXTURE_DIR);
  result={status:action==='generate'?'GENERATED_SYNTHETIC_REFERENCE':'CANONICAL_BYTES_VERIFIED',posters:20,temporalCases:12,independentHumanReview:'NOT_RUN'};
 }else if(command==='prepare'){
  const packet=validateAnyReviewPackage(await json(required(options,'--package')));
  const payload=prepareReviewPayload(await json(required(options,'--input')),packet),bytes=canonicalJson(payload);
  await newFile(required(options,'--out'),bytes);result={status:'PREPARED_UNSIGNED',payloadSha256:hashBytes(bytes),reviewCount:payload.reviews.length};
 }else if(command==='assemble'){
  const payload=ReviewPayloadSchema.parse(await json(required(options,'--payload'))),bytes=await boundedBytes(required(options,'--signature-file'),64);
  if(bytes.length!==64)throw Error();
  const signed=SignedReviewSchema.parse({payload,signature:{algorithm:'Ed25519',keyId:required(options,'--key-id'),value:bytes.toString('base64')}});
  await newJson(required(options,'--out'),signed);result={status:'ASSEMBLED_UNVERIFIED',reviews:payload.reviews.length};
 }else if(command==='import')result=await appendImport(options);
 else if(command==='report'||command==='ledger-report'){
  const packet=validateAnyReviewPackage(await json(required(options,'--package'))),ledger=await json(required(options,'--ledger'));
  const approved=await authority(options),context={now:new Date().toISOString(),...(approved?{authority:approved}:{})};
  if(command==='ledger-report'){
   const r=inspectReviewLedger(ledger,packet,context);result={packageSha256:r.packageSha256,ledgerHead:r.ledgerHead,totalCases:r.totalCases,
    independentHumanLabelled:r.independentHumanLabelled,syntheticSignedCases:r.syntheticSignedCases,unverifiedCurrentRecords:r.unverifiedCurrentRecords,
    pendingHumanCases:r.pendingHumanCases,independentGoldReview:r.independentGoldReview,humanAcceptance:r.humanAcceptance};
  }else{
   if(packet.datasetKind!=='RECOMMENDATION'||(options['--reference']&&!['INDEPENDENT','TRACK_OWNER_SELF'].includes(options['--reference'])))throw Error();
   result=recommendationReport(packet,ledger,{...context,...(options['--reference']?{reference:options['--reference']}:{}),
    ...(options['--enrichment']?{enrichment:await json(options['--enrichment'])}:{})});
  }
 }else if(command==='media-report'){
  const pack=await fixturesAt(required(options,'--fixtures')),observations=[];
  for(const [flag,mode]of [['--ocr-observation','HTML_GENERAL_OCR'],['--hcx-observation','HTML_GENERAL_OCR_HCX']]){
   if(options[flag]){const value=await json(options[flag]);if(value.mode!==mode)throw Error();observations.push(value);}}
  let reference;
  if(['--review-package','--ledger','--reference','--authority','--authority-sha256'].some(flag=>options[flag])){
   const kind=required(options,'--reference');if(!['INDEPENDENT','SYNTHETIC_TEST'].includes(kind))throw Error();
   const packet=validateAnyReviewPackage(await json(required(options,'--review-package')));
   if(packet.datasetKind!=='MEDIA_TEMPORAL')throw Error();
   const approved=await authority(options);reference={packet,ledger:await json(required(options,'--ledger')),
    now:new Date().toISOString(),reference:kind,...(approved?{authority:approved}:{})};}
  result=mediaComparisonReport(pack.manifest,new Map(pack.assets.map(a=>[a.path,a.bytes])),observations,reference);
 }else if(command==='benchmark')result={...runCoreBenchmark(Number(options['--samples']??50)),
   environment:{node:process.version,platform:platform(),arch:arch(),logicalCpus:cpus().length,measuredAt:new Date().toISOString()}};
 else if(command==='authority-digest')result={canonicalSha256:hashCanonical(AuthorityConfig.parse(await json(required(options,'--authority')))),
   status:'DIGEST_ONLY_NOT_AUTHORIZATION'};
 if(options['--out']&&!['export','prepare','assemble'].includes(command)){
  await newJson(options['--out'],result);console.log(JSON.stringify({status:'REPORT_WRITTEN'}));
 }else console.log(JSON.stringify(result));
}
try{await main();}catch{console.error('EVALUATION_VALIDATION_FAILED: inspect the local input schema, bindings and operator instructions. No approval was created.');process.exitCode=1;}
