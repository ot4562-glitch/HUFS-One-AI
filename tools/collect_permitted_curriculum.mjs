/** npm run build:api, then node tools/collect_permitted_curriculum.mjs INDEX
 * Operator authors restricted curriculum-permissions.json {sources:[...]}; each
 * source must contain reviewed URL+permission evidence+robots/terms and expiry.
 * No policy is generated from a public page's mere accessibility. */
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {collectCurriculum} from '../dist/apps/api/src/modules/curriculum/permitted-curriculum.js';
import {readRestrictedJson,projectRoot,git,noLinks} from './private_registry_io.mjs';
async function main(){
  const index=Number(process.argv[2]);
  if(!Number.isInteger(index)||index<0||index>50)throw new Error('INVALID_SOURCE');
  const policies=await readRestrictedJson('curriculum-permissions.json');
  const source=policies.sources?.[index];if(!source)throw new Error('SOURCE_NOT_PERMITTED');
  const directory=path.join(projectRoot,'local_only','public-curriculum');
  await mkdir(directory,{recursive:true});await noLinks(directory);
  const filename=path.join(directory,`catalog-${index}.json`);
  git(['check-ignore','-q','--',path.relative(projectRoot,filename)]);
  let previous;
  try{await noLinks(filename);const st=await lstat(filename);if(st.size>2_000_000)throw new Error('INVALID_FILE');previous=JSON.parse(await readFile(filename,'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const result=await collectCurriculum({sourceUrl:source.sourceUrl,previous,
    authority:{resolve:async url=>{
      const current=await readRestrictedJson('curriculum-permissions.json');
      return current.sources?.find(p=>p.sourceUrl===url)??null;
    }}});
  // Contains only validated public catalog fields; no owner settings/ledgers.
  // Exclusive immutable revision plus current pointer keeps corrections visible.
  await writeFile(path.join(directory,`catalog-${index}-v${result.version}-${result.sourceSha256}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  await writeFile(filename,JSON.stringify(result,null,2)+'\n',{flag:previous?'w':'wx'});
  process.stdout.write(JSON.stringify({status:'COLLECTED',courses:result.courses.length,duplicates:result.duplicateRows,version:result.version,reused:result.reused})+'\n');
}
main().catch(()=>{process.stdout.write(JSON.stringify({status:'BLOCKED',code:'SOURCE_OR_STORAGE_NOT_PERMITTED',personalValuesLogged:0})+'\n');process.exitCode=1;});
