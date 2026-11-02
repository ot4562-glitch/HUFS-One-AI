/**
 * Remove generated source maps and sourceMappingURL directives from the
 * synthetic-only dist package. This is NOT a release approval or a scanner:
 * publication and consent/rights gates still run independently and fail closed.
 *
 * Fail if dist contains symlinks or oversized text artifacts. Never read any
 * original student data or paths outside the generated dist tree.
 */
import {lstat,readdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const MAX_TEXT_BYTES=8_000_000;
const INLINE=/^\s*\/\/[#@]\s*sourceMappingURL=[^\r\n]*(?:\r?\n|$)|\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//gm;
export async function stripBuildSourcemaps(distRoot){
  const root=resolve(distRoot);
  const rootStat=await lstat(root);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink())
    throw new Error('dist must be an ordinary generated directory');
  const files=[];
  async function scan(dir){
    for(const child of await readdir(dir,{withFileTypes:true})){
      const path=join(dir,child.name),stat=await lstat(path);
      if(stat.isSymbolicLink())throw new Error('build symlink not permitted');
      if(stat.isDirectory())await scan(path);
      else if(stat.isFile())files.push({path,size:stat.size});
    }
  }
  await scan(root); // preflight every file before changing a single artifact
  if(files.some(({path,size})=>/\.(js|mjs|cjs|css)$/i.test(path)&&size>MAX_TEXT_BYTES))
    throw new Error('oversized generated source artifact');
  let mapsRemoved=0,referencesRemoved=0;
  for(const {path,size} of files){
    if(path.toLowerCase().endsWith('.map')){
      await unlink(path);mapsRemoved++;continue;
    }
    if(!/\.(js|mjs|cjs|css)$/i.test(path))continue;
    const text=await readFile(path,'utf8');
    const sanitized=text.replace(INLINE,()=>{referencesRemoved++;return '';});
    if(text!==sanitized)await writeFile(path,sanitized,'utf8');
  }
  return {mapsRemoved,referencesRemoved};
}
const self=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(self){
  stripBuildSourcemaps(resolve(process.cwd(),'dist')).then(
    result=>process.stdout.write(JSON.stringify({distMaps:'STRIPPED',...result})+'\n'),
    error=>{process.stderr.write('Build source map sanitization failed: '+String(error.message)+'\n');
      process.exitCode=1;},
  );
}
