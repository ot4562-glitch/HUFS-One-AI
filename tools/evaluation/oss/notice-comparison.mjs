/** Optional offline candidate experiment. Only the checked-in synthetic cases
 * are passed to the pinned Python probe. No source discovery or real inputs. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
const extractorUrl=new URL('../../ingestion/worker/notice-html-extractor.mjs',import.meta.url);
const workerRequire=createRequire(extractorUrl);
const cheerioVersion=JSON.parse(readFileSync(workerRequire.resolve('cheerio/package.json'))).version;
const started=performance.now();
const {parseApprovedNoticeHtmlDraft}=await import('../../ingestion/worker/notice-html-extractor.mjs');
const importMs=performance.now()-started;
const fixtureBytes=readFileSync(new URL('./notice-cases.json',import.meta.url)),fixture=JSON.parse(fixtureBytes);
const sha=b=>createHash('sha256').update(b).digest('hex');
const rate=(num,den)=>({num,den,value:den===0?null:num/den});
const normalize=s=>s.normalize('NFC').replace(/\s+/gu,' ').trim();
export function scoreNoticeConversion(cases,observations){
  if(observations.length!==cases.length||new Set(observations.map(c=>c.id)).size!==cases.length)throw new Error('Invalid comparison population');
  const byId=new Map(observations.map(c=>[c.id,c]));
  let found=0,total=0,leaked=0,excluded=0,abstained=0,empty=0;
  for(const c of cases){
    const observed=byId.get(c.id);if(!observed||typeof observed.text!=='string')throw new Error('Invalid comparison observation');
    const text=normalize(observed.text);
    for(const value of c.expected){total++;if(text.includes(normalize(value)))found++;}
    for(const value of c.excluded){excluded++;if(text.includes(normalize(value)))leaked++;}
    if(c.expectAbstention){empty++;if(text==='')abstained++;}
  }
  return {expectedFragments:rate(found,total),excludedFragmentsPresent:rate(leaked,excluded),correctAbstentions:rate(abstained,empty)};
}
function summary(observations){return {
  metrics:scoreNoticeConversion(fixture.cases,observations),
  cases:observations.map(c=>({id:c.id,originalSha256:c.originalSha256,outputSha256:sha(Buffer.from(c.text)),
    outputBytes:Buffer.byteLength(c.text),timingMs:c.timingMs})),
};}
export function runNoticeComparison({python}={}){
  const observations=fixture.cases.map(c=>{
    const bytes=Buffer.from(c.html),samples=[];let text='';
    for(let i=0;i<25;i++){
      const before=performance.now();
      try{text=parseApprovedNoticeHtmlDraft({content:bytes,contentType:'text/html',
        canonicalUrl:'https://synthetic.example.edu/notice',rootSelector:'main'}).paragraphs.map(p=>p.text).join('\n');}
      catch{if(!c.expectAbstention)throw new Error('Synthetic baseline extraction failed');text='';}
      samples.push(performance.now()-before);
    }
    const warm=samples.slice(1).sort((a,b)=>a-b);
    return {id:c.id,originalSha256:sha(bytes),text,timingMs:{first:samples[0],
      warmMedian:(warm[11]+warm[12])/2,warmP95:warm[Math.floor(warm.length*.95)],warmSamples:24}};
  });
  let candidate={state:'NOT_RUN',reason:'Optional pinned local Python dependency not selected'};
  if(python){
    const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
    const result=JSON.parse(execFileSync(python,[fileURLToPath(new URL('./markitdown_probe.py',import.meta.url))],
      {encoding:'utf8',timeout:30000,maxBuffer:1024*1024,env}));
    if(result.version!=='markitdown-synthetic-probe-v1'||result.toolVersion!=='0.1.9'
      ||result.fixtureSha256!==sha(fixtureBytes)||result.attempts.network!==0||result.attempts.subprocess!==0
      ||result.cases.length!==observations.length||result.cases.some(c=>{
        const baseline=observations.find(b=>b.id===c.id);return !baseline||baseline.originalSha256!==c.originalSha256;
      }))throw new Error('Invalid candidate provenance');
    candidate={state:'SYNTHETIC_LOCAL_RUN',version:result.toolVersion,python:result.python,dependencies:result.dependencies,
      networkGuard:result.networkGuard,attempts:result.attempts,importMs:result.importMs,...summary(result.cases)};
  }
  return {version:fixture.version,referenceKind:fixture.referenceKind,fixtureSha256:sha(fixtureBytes),
    scope:'HTML_ONLY_NOT_PDF_OFFICE_HWP_OR_MODEL_EVALUATION',externalModelCalls:0,
    toolSha256:{node:sha(readFileSync(fileURLToPath(import.meta.url))),python:sha(readFileSync(new URL('./markitdown_probe.py',import.meta.url)))},
    baseline:{state:'SYNTHETIC_LOCAL_RUN',tool:'existing-cheerio-notice-extractor',node:process.version,
      extractorSha256:sha(readFileSync(extractorUrl)),cheerioVersion,
      workerLockSha256:sha(readFileSync(new URL('../../ingestion/worker/package-lock.json',import.meta.url))),
      importMs,...summary(observations)},candidate};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const args=process.argv.slice(2);if(args.length!==0&&(args.length!==2||args[0]!=='--python'||!args[1]))throw new Error();
    process.stdout.write(JSON.stringify(runNoticeComparison(args.length?{python:args[1]}:{}),null,2)+'\n');
  }catch{process.stderr.write('SYNTHETIC_NOTICE_COMPARISON_FAILED\n');process.exitCode=1;}
}
