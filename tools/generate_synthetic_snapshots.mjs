import {readFile,writeFile} from 'node:fs/promises';
import {buildSharedSyntheticCorpus} from '../dist/apps/api/src/modules/auth/reviewer-generated-corpus.js';

const args=process.argv.slice(2);
if(args.length>1||(args.length===1&&args[0]!=='--check'))
  throw new Error('Usage: npm run fixtures:generate [-- --check]');
const target=new URL('../packages/fixtures/synthetic/demo-corpus-snapshots.json',import.meta.url);
const expected=JSON.stringify(buildSharedSyntheticCorpus(),null,2)+'\n';
if(args[0]==='--check'){
  if(await readFile(target,'utf8')!==expected)
    throw new Error('Synthetic artifact is stale; run npm run fixtures:generate');
  process.stdout.write('Canonical synthetic artifact matches all five generated snapshots.\n');
}else{
  await writeFile(target,expected,'utf8');
  process.stdout.write('Generated five SYNTHETIC snapshots; independent gold review remains PENDING.\n');
}
