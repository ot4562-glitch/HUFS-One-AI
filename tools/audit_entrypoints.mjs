/** #199: bounded, read-only inventory. Never executes discovered code or deletes files. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,join,posix,relative,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const DOCS=['README.md','Architecture.md','STATUS.md','docs/WORKSTREAMS.md','docs/TEAM_PROGRESS.md',
  'docs/PR_WORKFLOW.md','docs/DATA_GOVERNANCE.md'];
const ROOTS=['package.json','vitest.config.ts','apps','packages','tools','tests','infra','.github/workflows',...DOCS];
const SOURCE=/\.(?:[cm]?js|tsx?|json|ya?ml|sql|py|ps1|sh|service|template)$/;
const CODE=/\.(?:[cm]?js|tsx?)$/;
export function isAllowedPath(path){
  if(typeof path!=='string'||path.includes('\\')||path.startsWith('/')||/^[a-z]:/i.test(path))return false;
  const parts=path.split('/');
  if(parts.some(p=>!p||p==='..'||p==='.'||['private','windows-api-credentials','local_only','node_modules','dist'].includes(p.toLowerCase())))return false;
  if(parts[0]==='packages'&&!/^packages\/(?:contracts|core|ai|ui)\//.test(path)
    &&!/^packages\/fixtures\/(?:synthetic|negative)\//.test(path))return false;
  if(DOCS.includes(path))return true;
  return (SOURCE.test(path)||path.endsWith('/README.md'))&&(ROOTS.includes(path)||/^(?:apps|packages|tools|tests|infra)\//.test(path)
    ||/^\.github\/workflows\//.test(path));
}
const owner=path=>/^apps\/web\//.test(path)?'UI':/^packages\/core\/src\/academics\//.test(path)?'ACADEMICS'
  :/^packages\/core\/src\/(?:notices|opportunities|normalization)\//.test(path)?'RECOMMENDATIONS':'PLATFORM';
function candidates(path){
  const p=path.replace(/^dist\//,'');
  return [p,p.replace(/\.js$/,'.ts'),p.replace(/\.js$/,'.tsx'),
    ...(!posix.extname(p)?['.ts','.tsx','.js','.mjs','/index.ts','/index.js'].map(ext=>p+ext):[])];
}
function glob(pattern){
  return new RegExp('^'+pattern.split(/(\*\*\/|\*\*|\*)/).map(p=>p==='**/'?'(?:.*/)?':p==='**'?'.*':p==='*'?'[^/]*':p.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('')+'$');
}
function prInventory(prs){
  if(!prs)return {coverage:'NOT_PROVIDED',dependencies:[],overlaps:[]};
  const valid=Array.isArray(prs.items)&&prs.items.length<=1000&&prs.items.every(p=>Number.isSafeInteger(p.number)&&p.number>0
    &&typeof p.head==='string'&&typeof p.base==='string'&&Array.isArray(p.files)&&p.files.length<=3000
    &&p.files.every(f=>typeof f==='string'));
  const complete=valid&&prs.complete===true&&Number.isSafeInteger(prs.pagesRead)&&prs.pagesRead>0
    &&prs.pagesRead===prs.pagesExpected&&new Set(prs.items.map(p=>p.number)).size===prs.items.length;
  if(!valid)return {coverage:'INCOMPLETE',dependencies:[],overlaps:[]};
  const byHead=new Map(),files=new Map(),dependencies=[];
  for(const p of prs.items){const list=byHead.get(p.head)??[];list.push(p.number);byHead.set(p.head,list);}
  for(const p of prs.items){
    for(const parent of byHead.get(p.base)??[])if(parent!==p.number)dependencies.push({number:p.number,dependsOn:parent});
    for(const path of new Set(p.files.filter(isAllowedPath))){const list=files.get(path)??[];list.push(p.number);files.set(path,list);}
  }
  return {coverage:complete?'COMPLETE':'INCOMPLETE',dependencies,
    overlaps:[...files].filter(([,ns])=>ns.length>1).map(([path,numbers])=>({path,numbers:numbers.sort((a,b)=>a-b)}))};
}

export async function auditEntrypoints(directory,{prs,maxFileBytes=1024*1024,maxFiles=2000,maxTotalBytes=32*1024*1024}={}){
  for(const n of [maxFileBytes,maxFiles,maxTotalBytes])if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid inventory bound');
  const root=await realpath(directory);
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
  const sha=git('rev-parse','HEAD').trim();
  const dirty=git('status','--porcelain','--untracked-files=no','--',...ROOTS).trim().length>0;
  const selected=git('ls-files','-z','--',...ROOTS).split('\0').filter(Boolean);
  const paths=[...new Set(selected.filter(isAllowedPath))].sort(),tracked=new Set(paths);
  const findings=[],unknown=[],references=[],entrypoints=[],contents=new Map(),incoming=new Set();
  let total=0,incomplete=false;
  const uncertain=(path,reason,line)=>{unknown.push({path,reason,...(line?{line}:{})});};
  for(const path of paths){
    if(contents.size>=maxFiles){incomplete=true;uncertain(path,'FILE_COUNT_LIMIT');continue;}
    let current=root,info;
    try{
      for(const segment of path.split('/')){current=join(current,segment);info=await lstat(current);
        if(info.isSymbolicLink())throw Error('LINK_BOUNDARY');}
      const canonical=await realpath(current),rel=relative(root,canonical);
      if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+posix.sep)||rel.startsWith('..\\'))throw Error('LINK_BOUNDARY');
      if(!info.isFile())throw Error('NOT_FILE');
      if(info.size>maxFileBytes||total+info.size>maxTotalBytes){incomplete=true;uncertain(path,'FILE_LIMIT');continue;}
      const text=await readFile(current,'utf8');
      if(Buffer.byteLength(text)>maxFileBytes||total+Buffer.byteLength(text)>maxTotalBytes){incomplete=true;uncertain(path,'FILE_LIMIT');continue;}
      contents.set(path,text);total+=Buffer.byteLength(text);
    }catch(error){incomplete=true;uncertain(path,error?.message==='LINK_BOUNDARY'?'LINK_BOUNDARY':'NOT_MATERIALIZED');}
  }
  const addEntry=(path,kind,condition='DECLARED_HARNESS',verify)=>{
    if(!entrypoints.some(e=>e.path===path&&e.kind===kind))entrypoints.push({path,kind,owner:owner(path),condition,...(verify?{verify}:{})});
    incoming.add(path);
  };
  const reference=(from,target,kind,line=1,rootRelative=false)=>{
    if(typeof target!=='string')return;
    const path=posix.normalize(rootRelative?target:posix.join(posix.dirname(from),target));
    if(target.endsWith('/')){
      const prefix=path.replace(/\/+$/,'')+'/';
      const children=paths.filter(p=>p.startsWith(prefix));
      if(children.length){
        references.push({from,to:prefix,kind:'DIRECTORY_REFERENCE',line});
        uncertain(from,'DYNAMIC_DIRECTORY_CONTENT',line);
        for(const child of children)if(child.endsWith('.sql'))addEntry(child,'SQL_MIGRATION','OPT_IN_DIRECTORY_REFERENCE');
      }else uncertain(from,'DIRECTORY_OUTSIDE_ANALYSIS_SCOPE',line);
      return;
    }
    const choices=candidates(path),found=choices.find(p=>tracked.has(p));
    if(!choices.some(isAllowedPath)){uncertain(from,'OUTSIDE_ANALYSIS_SCOPE',line);return;}
    if(target.includes('*')||target.includes('${')){uncertain(from,'DYNAMIC_PATH',line);return;}
    if(!found){findings.push({code:'MISSING_TRACKED_REFERENCE',path:from,target:choices.find(isAllowedPath),kind,line});return;}
    references.push({from,to:found,kind,line});incoming.add(found);
    if(kind==='PACKAGE_SCRIPT'||kind==='WORKFLOW_COMMAND')addEntry(found,kind,'DECLARED_COMMAND');
    if(found.endsWith('.sql'))addEntry(found,'SQL_MIGRATION','EXPLICIT_DISPOSABLE_PG_OPT_IN');
  };
  const commandRefs=(path,text,kind)=>{
    const pattern=/(?:dist\/)?(?:apps|packages|tools|tests|infra)\/[A-Za-z0-9_./*${}-]+\.(?:tsx?|[cm]?js|sql|py|ps1|sh|json|ya?ml)\b/g;
    for(const match of text.matchAll(pattern))reference(path,match[0],kind,1,true);
  };
  let manifest;
  try{manifest=JSON.parse(contents.get('tools/entrypoints.json')??'null');}catch{}
  if(!manifest||manifest.version!==1||!Array.isArray(manifest.conditions)||manifest.conditions.length>100){
    incomplete=true;uncertain('tools/entrypoints.json','MANIFEST_UNAVAILABLE');
  }else for(const e of manifest.conditions){
    if(!isAllowedPath(e.path)||typeof e.condition!=='string'||typeof e.verify!=='string'){
      incomplete=true;uncertain('tools/entrypoints.json','INVALID_MANIFEST_ENTRY');continue;}
    if(!tracked.has(e.path))findings.push({code:'MISSING_TRACKED_REFERENCE',path:'tools/entrypoints.json',target:e.path,kind:'MANIFEST',line:1});
    else addEntry(e.path,'MANIFEST',e.condition,e.verify);
  }
  for(const [path,text] of contents){
    if(path.endsWith('.md')){
      for(const match of text.matchAll(/\[[^\]\n]+\]\(([^\s)#]+)(?:#[^\s)]*)?\)/g)){
        if(!/^[a-z]+:/i.test(match[1])&&SOURCE.test(match[1]))
          reference(path,match[1],'DOCUMENT_LINK',text.slice(0,match.index).split('\n').length);
      }
    }
    if(path==='package.json'){
      let value;try{value=JSON.parse(text);}catch{incomplete=true;uncertain(path,'INVALID_JSON');continue;}
      for(const [name,command] of Object.entries(value.scripts??{}))if(typeof command==='string'){
        commandRefs(path,command,'PACKAGE_SCRIPT');
        // An npm/workspace command without a literal path is intentionally not executed or guessed.
        if(!/(?:apps|packages|tools|tests|infra)\//.test(command))uncertain(path,'INDIRECT_PACKAGE_SCRIPT');
      }
    }
    if(/^\.github\/workflows\//.test(path)||/\.(?:sh|ps1|service|template|ya?ml)$/.test(path))commandRefs(path,text,'WORKFLOW_COMMAND');
    if(!CODE.test(path))continue;
    const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
    if(source.parseDiagnostics.length){incomplete=true;uncertain(path,'PARSE_ERROR');}
    const visit=node=>{
      const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier)){
        const target=node.moduleSpecifier.text;
        if(target.startsWith('.'))reference(path,target,'STATIC_IMPORT',line);
      }
      if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword
        ||ts.isIdentifier(node.expression)&&['require','fork','Worker'].includes(node.expression.text))){
        const arg=node.arguments[0],kind=node.expression.kind===ts.SyntaxKind.ImportKeyword?'DYNAMIC_IMPORT':'PROCESS_OR_REQUIRE';
        if(arg&&ts.isStringLiteralLike(arg)&&arg.text.startsWith('.'))reference(path,arg.text,kind,line);
        else if(!arg||!ts.isStringLiteralLike(arg))uncertain(path,kind,line);
      }
      if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='URL'){
        const arg=node.arguments?.[0],base=node.arguments?.[1];
        if(arg&&ts.isStringLiteralLike(arg)&&arg.text.startsWith('.')&&base?.getText(source)==='import.meta.url')reference(path,arg.text,'MODULE_URL',line);
        else if(base?.getText(source)==='import.meta.url'&&arg&&!ts.isStringLiteralLike(arg))uncertain(path,'DYNAMIC_MODULE_URL',line);
      }
      if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='testDir'&&ts.isStringLiteralLike(node.initializer)
        &&/playwright\.config\./.test(path)){
        const dir=posix.normalize(posix.join(posix.dirname(path),node.initializer.text))+'/';
        for(const target of paths)if(target.startsWith(dir)&&/\.spec\.[cm]?[jt]s$/.test(target))addEntry(target,'PLAYWRIGHT_TEST','PLAYWRIGHT_CONFIG');
      }
      if(path==='vitest.config.ts'&&ts.isPropertyAssignment(node)&&node.name.getText(source)==='include'&&ts.isArrayLiteralExpression(node.initializer)){
        for(const item of node.initializer.elements)if(ts.isStringLiteralLike(item)){
          const pattern=glob(item.text);for(const target of paths)if(pattern.test(target))addEntry(target,'VITEST_TEST','VITEST_CONFIG');
        }
      }
      ts.forEachChild(node,visit);
    };
    visit(source);
  }
  const pullRequests=prInventory(prs);
  const unreferenced=paths.filter(p=>CODE.test(p)&&!incoming.has(p));
  for(const path of unreferenced)uncertain(path,'NO_KNOWN_INCOMING_REFERENCE');
  const staticCoverage=incomplete?'INCOMPLETE':'COMPLETE';
  return {version:1,sha,dirty,contentBasis:'TRACKED_WORKING_TREE',status:!incomplete&&pullRequests.coverage==='COMPLETE'?'COMPLETE':'PARTIAL',
    scope:'TRACKED_MAINTAINED_CODE_ROOTS',staticCoverage,prCoverage:pullRequests.coverage,
    included:contents.size,excluded:selected.length-paths.length,bytes:total,findings,
    entrypoints:entrypoints.sort((a,b)=>a.path.localeCompare(b.path)||a.kind.localeCompare(b.kind)),
    references,unknown,unreferenced,pullRequests:{dependencies:pullRequests.dependencies,overlaps:pullRequests.overlaps},
    limitation:'Static references are evidence of use, not proof of runtime reachability, security, rights or safe deletion.'};
}

export function formatMarkdown(report){
  return [`# Execution entrypoint inventory`, ``, `HEAD SHA: ${report.sha}; tracked working tree dirty: ${report.dirty}`,`Status: ${report.status}; static: ${report.staticCoverage}; PR: ${report.prCoverage}`,
    `Included: ${report.included}; excluded in selected roots: ${report.excluded}; definite missing references: ${report.findings.length}; unknown: ${report.unknown.length}.`,
    ``,...report.findings.slice(0,20).map(f=>`- ${f.code}: ${f.path}:${f.line} → ${f.target}`),
    ``,report.limitation,`No code, PR, branch or data was modified.`].join('\n');
}
async function main(){
  const args=process.argv.slice(2);
  if(args.some(a=>!['--markdown','--prs-stdin'].includes(a)))throw Error('Usage: node tools/audit_entrypoints.mjs [--markdown] [--prs-stdin]');
  let prs;
  if(args.includes('--prs-stdin')){let data='';for await(const chunk of process.stdin){data+=chunk;if(Buffer.byteLength(data)>2*1024*1024)throw Error('PR snapshot limit');}prs=JSON.parse(data);}
  const report=await auditEntrypoints(process.cwd(),{prs});
  process.stdout.write((args.includes('--markdown')?formatMarkdown(report):JSON.stringify(report,null,2))+'\n');
  if(report.findings.length)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main().catch(()=>{process.stderr.write('ENTRYPOINT_AUDIT_FAILED: inspect the bounded local inputs; no mutation performed.\n');process.exitCode=2;});
