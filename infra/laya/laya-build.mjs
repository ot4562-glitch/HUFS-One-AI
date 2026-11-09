// Local build only. Does not read operator config, start workers or load/download models.
import {stripTypeScriptTypes} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {isAbsolute, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function buildLayaModules(outDirectory) {
  if (!isAbsolute(outDirectory)) throw Error('LAYA_ABSOLUTE_OUTPUT_REQUIRED');
  await mkdir(outDirectory,{recursive:true});
  for (const name of ['laya-scheduler','laya-child-worker','laya-pressure']) {
    const source = await readFile(new URL(`../../packages/ai/src/${name}.ts`,import.meta.url),'utf8');
    // TypeScript 7 is a native CLI without the old JS compiler API.
    // Use the supported Node 22.13+/24 syntax transformer for these fixed,
    // checked-in modules only. The repository's tsc typecheck still runs in CI.
    // Reject unsupported TS syntax rather than silently emitting an empty module.
    let compiled;
    try { compiled=stripTypeScriptTypes(source,{mode:'transform'}); }
    catch { throw Error('LAYA_BUILD_FAILED'); }
    if(!compiled.trim())throw Error('LAYA_BUILD_FAILED');
    await writeFile(resolve(outDirectory,`${name}.js`),compiled,{mode:0o600});
  }
  await writeFile(resolve(outDirectory,'laya-worker.mjs'),await readFile(new URL('./laya-worker.mjs',import.meta.url)),{mode:0o600});
  await writeFile(resolve(outDirectory,'package.json'),'{"type":"module"}\n',{mode:0o600});
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args=process.argv.slice(2);
  if (args.length!==2 || args[0]!=='--outdir') {process.stderr.write('Usage: node infra/laya/laya-build.mjs --outdir ABSOLUTE_PATH\n');process.exitCode=1;}
  else await buildLayaModules(args[1]);
}
