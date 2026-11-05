import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open} from 'node:fs/promises';
import {isAbsolute,join,parse,resolve,sep} from 'node:path';
import {PNG} from 'pngjs';
import {z} from 'zod';
import {SyntheticClubPosterDescriptorSchema,type SyntheticClubPosterDescriptor} from '@hufs-one/contracts';

export interface TrustedSyntheticClubPosterPort{
  describe(assetId:string):SyntheticClubPosterDescriptor|null|Promise<SyntheticClubPosterDescriptor|null>;
  read(assetId:string):Promise<{descriptor:SyntheticClubPosterDescriptor;bytes:Uint8Array}|null>;
}
const Manifest=z.strictObject({version:z.literal(1),assets:z.array(
  SyntheticClubPosterDescriptorSchema.safeExtend({fileName:z.string().regex(/^[a-z0-9][a-z0-9-]{0,100}\.png$/)})
).max(100)}).superRefine((m,ctx)=>{
  if(new Set(m.assets.map(a=>a.assetId)).size!==m.assets.length
    ||new Set(m.assets.map(a=>a.fileName)).size!==m.assets.length)
    ctx.addIssue({code:'custom',message:'Duplicate poster manifest entry'});
});
const failure=()=>new Error('Synthetic poster unavailable');
async function checkedComponents(path:string){
  const root=parse(path).root,parts=path.slice(root.length).split(sep).filter(Boolean);
  const paths=[root];for(const part of parts)paths.push(join(paths[paths.length-1]!,part));
  const result=[];
  for(const [index,part] of paths.entries()){
    const stat=await lstat(part);
    if(stat.isSymbolicLink()||(index<paths.length-1?!stat.isDirectory():!stat.isFile())
      ||(index===paths.length-1&&stat.nlink!==1))throw failure();
    result.push({path:part,ino:stat.ino,dev:stat.dev});
  }
  return result;
}

/** Explicit server-owned manifest. Assets are never mounted as public static
 * files: the HTTP route binds a loaded image to a current approved club read. */
export class FileSyntheticClubPosterStore implements TrustedSyntheticClubPosterPort{
  private readonly entries:Map<string,z.infer<typeof Manifest>['assets'][number]>;
  private readonly root:string;
  constructor(root:string,manifest:unknown){
    if(!isAbsolute(root))throw failure();this.root=resolve(root);
    this.entries=new Map(Manifest.parse(manifest).assets.map(asset=>[asset.assetId,asset]));
  }
  describe(assetId:string):SyntheticClubPosterDescriptor|null{
    const asset=this.entries.get(assetId);if(!asset)return null;
    const {fileName:_,...descriptor}=asset;
    return structuredClone(descriptor);
  }
  async read(assetId:string):Promise<{descriptor:SyntheticClubPosterDescriptor;bytes:Uint8Array}|null>{
    const asset=this.entries.get(assetId);if(!asset)return null;
    const path=join(this.root,asset.fileName),before=await checkedComponents(path);
    const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
      const stat=await file.stat(),leaf=before[before.length-1]!;
      if(!stat.isFile()||stat.nlink!==1||stat.size!==asset.byteLength
        ||stat.ino!==leaf.ino||stat.dev!==leaf.dev)throw failure();
      const bytes=Buffer.alloc(asset.byteLength+1);let total=0;
      while(total<bytes.length){
        const read=await file.read(bytes,total,bytes.length-total,total);
        if(read.bytesRead===0)break;total+=read.bytesRead;
      }
      const after=await file.stat();
      if(total!==asset.byteLength||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs
        ||after.ctimeMs!==stat.ctimeMs||after.nlink!==1)throw failure();
      const current=await checkedComponents(path);
      if(current.some((part,i)=>part.ino!==before[i]?.ino||part.dev!==before[i]?.dev))throw failure();
      const exact=bytes.subarray(0,total);
      if(createHash('sha256').update(exact).digest('hex')!==asset.sha256
        ||!exact.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        ||exact.toString('ascii',12,16)!=='IHDR'
        ||exact.readUInt32BE(16)!==asset.width||exact.readUInt32BE(20)!==asset.height)throw failure();
      const decoded=PNG.sync.read(exact,{checkCRC:true});
      if(decoded.width!==asset.width||decoded.height!==asset.height)throw failure();
      return {descriptor:this.describe(assetId)!,bytes:Buffer.from(exact)};
    }finally{await file.close();}
  }
}
