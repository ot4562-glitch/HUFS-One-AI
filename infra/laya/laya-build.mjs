// Local build only. Does not read operator config, start workers or load/download models.
import ts from 'typescript';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {isAbsolute, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function buildLayaModules(outDirectory) {
  if (!isAbsolute(outDirectory)) throw Error('LAYA_ABSOLUTE_OUTPUT_REQUIRED');
  await mkdir(outDirectory,{recursive:true});
  for (const name of ['laya-scheduler','laya-child-worker','laya-pressure']) {
    const source = await readFile(new URL(`../../packages/ai/src/${name}.ts`,import.meta.url),'utf8');
    const compiled = ts.transpileModule(source, {fileName:`${name}.ts`, reportDiagnostics:true,
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}});
    if (compiled.diagnostics?.some(item=>item.category===ts.DiagnosticCategory.Error)) throw Error('LAYA_BUILD_FAILED');
    await writeFile(resolve(outDirectory,`${name}.js`),compiled.outputText,{mode:0o600});
  }
  await writeFile(resolve(outDirectory,'laya-worker.mjs'),await readFile(new URL('./laya-worker.mjs',import.meta.url)),{mode:0o600});
  await writeFile(resolve(outDirectory,'package.json'),'{"type":"module"}\n',{mode:0o600});
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args=process.argv.slice(2);
  if (args.length!==2 || args[0]!=='--outdir') {process.stderr.write('Usage: node infra/laya/laya-build.mjs --outdir ABSOLUTE_PATH\n');process.exitCode=1;}
  else await buildLayaModules(args[1]);
}
