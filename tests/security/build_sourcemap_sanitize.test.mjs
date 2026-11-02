import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stripBuildSourcemaps} from '../../tools/strip_build_sourcemaps.mjs';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'synthetic-api-maps-'));
  t.after(async()=>rm(root,{recursive:true,force:true}));
  const dist=join(root,'dist'),api=join(dist,'apps','api','src');
  await mkdir(api,{recursive:true});
  return {dist,api};
}
test('compiled API package strips old maps and inline source links',async t=>{
  const {dist,api}=await fixture(t);
  await writeFile(join(api,'server.js'),
    "export const synthetic=true;\n//# sourceMappingURL=server.js.map\n");
  await writeFile(join(api,'server.js.map'),'{"sources":["synthetic-only.ts"]}');
  await writeFile(join(api,'routing.mjs'),"export const routing=true;\n");
  const result=await stripBuildSourcemaps(dist);
  assert.deepEqual(result,{mapsRemoved:1,referencesRemoved:1});
  assert.equal((await readFile(join(api,'server.js'),'utf8')).includes('sourceMappingURL'),false);
  assert.deepEqual(await readdir(api),['routing.mjs','server.js']);
  assert.deepEqual(await stripBuildSourcemaps(dist),{mapsRemoved:0,referencesRemoved:0});
});
test('symlink detection denies sanitizing the entire build before modifying anything',async t=>{
  const {dist,api}=await fixture(t);
  await writeFile(join(api,'server.js.map'),'{}');
  try{await symlink(join(api,'server.js.map'),join(api,'unsafe-map-symlink'));}
  catch(e){t.skip('Symlinks not supported by this test runner');return;}
  await assert.rejects(stripBuildSourcemaps(dist),/symlink/);
  assert.equal((await stat(join(api,'server.js.map'))).isFile(),true);
});
test('oversized generated source blocks the scrubber before any map deletion',async t=>{
  const {dist,api}=await fixture(t);
  await writeFile(join(api,'a.js'),'x'.repeat(8_000_001));
  await writeFile(join(api,'b.js.map'),'{}');
  await assert.rejects(stripBuildSourcemaps(dist),/oversized/);
  assert.equal((await stat(join(api,'b.js.map'))).isFile(),true);
});
