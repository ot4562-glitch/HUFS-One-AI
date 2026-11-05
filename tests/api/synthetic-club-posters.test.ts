import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,readFile,writeFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {FileSyntheticClubPosterStore} from '../../apps/api/src/modules/opportunities/synthetic-club-posters.js';

const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
const png=()=>readFile(new URL('../../packages/fixtures/synthetic/clubs/generated/ai-club-poster-v1.png',import.meta.url));
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'hufs-synthetic-poster-'));roots.push(root);
  const bytes=await png();await writeFile(join(root,'ai-club-poster-v1.png'),bytes);
  const asset={assetId:'SYN-POSTER-CLUB-090',fileName:'ai-club-poster-v1.png',
    sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length,width:1672,height:941,mimeType:'image/png',
    alt:'가상 학생들의 협업을 그린 AI 합성 그림. 실제 학생이 아닙니다.',
    provenance:{kind:'AI_GENERATED_SYNTHETIC',generator:'OpenAI imagegen',generatedAt:null,
      recordedAt:'2026-11-04T23:10:31Z',reference:'GENERATED-CLUB-POSTER-20261105-V1'}};
  return {root,bytes,asset};
}
describe('#123 pinned synthetic poster store',()=>{
  it('reads only the pinned, decodable PNG and exposes no filesystem path',async()=>{
    const f=await fixture(),store=new FileSyntheticClubPosterStore(f.root,{version:1,assets:[f.asset]});
    const item=await store.read(f.asset.assetId);
    expect(item?.bytes).toEqual(f.bytes);
    expect(store.describe(f.asset.assetId)).not.toHaveProperty('fileName');
    expect(store.describe(f.asset.assetId)).not.toHaveProperty('root');
    expect(await store.read('SYN-POSTER-CLUB-999')).toBeNull();
  });
  it('rejects byte corruption and false dimensions even if a caller supplies a matching hash',async()=>{
    const f=await fixture(),bad=Buffer.from(f.bytes);bad[bad.length-1]=0;
    await writeFile(join(f.root,f.asset.fileName),bad);
    const store=new FileSyntheticClubPosterStore(f.root,{version:1,assets:[f.asset]});
    await expect(store.read(f.asset.assetId)).rejects.toThrow();
    await writeFile(join(f.root,f.asset.fileName),f.bytes);
    const forged=new FileSyntheticClubPosterStore(f.root,{version:1,assets:[{...f.asset,width:123}]});
    await expect(forged.read(f.asset.assetId)).rejects.toThrow();
  });
  it('refuses symlink files and ancestor directories, not merely unsafe basenames',async()=>{
    const f=await fixture(),target=join(f.root,'real.png');
    await writeFile(target,f.bytes);await rm(join(f.root,f.asset.fileName));
    await symlink(target,join(f.root,f.asset.fileName));
    const store=new FileSyntheticClubPosterStore(f.root,{version:1,assets:[f.asset]});
    await expect(store.read(f.asset.assetId)).rejects.toThrow();
    const actual=join(f.root,'actual');await mkdir(actual);await writeFile(join(actual,f.asset.fileName),f.bytes);
    const linked=join(f.root,'linked');await symlink(actual,linked);
    await expect(new FileSyntheticClubPosterStore(linked,{version:1,assets:[f.asset]}).read(f.asset.assetId)).rejects.toThrow();
  });
  it('rejects traversal, duplicate asset IDs and oversized claims at configuration time',async()=>{
    const f=await fixture();
    for(const assets of [[{...f.asset,fileName:'../outside.png'}],[f.asset,f.asset],
      [{...f.asset,byteLength:2*1024*1024+1}],[{...f.asset,width:2049}]]){
      expect(()=>new FileSyntheticClubPosterStore(f.root,{version:1,assets})).toThrow();
    }
  });
});
