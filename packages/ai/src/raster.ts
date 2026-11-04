import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {PNG} from 'pngjs';
import jpeg from 'jpeg-js';
import type {ClovaRaster} from './clova-wire.js';

const MAX_BYTES=5*1024*1024,MAX_SIDE=2240,MAX_PIXELS=4_000_000;
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const TOKEN=/^[A-Za-z0-9_.:-]{1,128}$/;
export class RasterValidationError extends Error {
  constructor(){super('RASTER_REQUIRES_REVIEW');this.name='RasterValidationError';}
}
type RasterIdentity={sourceRevisionId:string;assetId:string;originalSha256:string};
function reject():never{throw new RasterValidationError();}
function dimensions(width:number,height:number){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1
    ||width>MAX_SIDE||height>MAX_SIDE||width*height>MAX_PIXELS)reject();
  return {width,height};
}
const CRC_TABLE=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function crc32(bytes:Buffer){let n=0xffffffff;for(const b of bytes)n=(n>>>8)^CRC_TABLE[(n^b)&255]!;return (n^0xffffffff)>>>0;}

function pngPreflight(bytes:Buffer){
  if(bytes.length<45)reject();
  let offset=8,width=0,height=0,depth=0,color=0,interlace=0,seenData=false,dataEnded=false,seenPalette=false;
  const compressed:Buffer[]=[];
  let chunkCount=0;
  while(offset<bytes.length){
    if(++chunkCount>4096||offset+12>bytes.length)reject();
    const length=bytes.readUInt32BE(offset),end=offset+12+length;
    if(end>bytes.length)reject();
    const type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,end-4);
    if(!/^[A-Za-z]{4}$/.test(type)||type[2]!==type[2]!.toUpperCase()
      ||crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))reject();
    if(offset===8&&type!=='IHDR')reject();
    if(type==='IHDR'){
      if(offset!==8||length!==13)reject();
      ({width,height}=dimensions(data.readUInt32BE(0),data.readUInt32BE(4)));
      depth=data[8]!;color=data[9]!;interlace=data[12]!;
      const depths:Record<number,number[]>={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if(!depths[color]?.includes(depth)||data[10]!==0||data[11]!==0||interlace>1)reject();
    }else if(type==='PLTE'){
      if(seenData||seenPalette||length===0||length%3!==0||length>768||color===0||color===4
        ||(color===3&&length/3>2**depth))reject();
      seenPalette=true;
    }else if(type==='IDAT'){
      if(dataEnded||(color===3&&!seenPalette))reject();
      seenData=true;compressed.push(data);
    }else if(type==='IEND'){
      if(length!==0||!seenData||end!==bytes.length)reject();
      offset=end;break;
    }else{
      // Animation and orientation require a different coordinate transform adapter.
      if(['acTL','fcTL','fdAT','eXIf'].includes(type)||type[0]===type[0]!.toUpperCase())reject();
      if(seenData)dataEnded=true;
    }
    offset=end;
  }
  if(offset!==bytes.length||bytes.toString('ascii',bytes.length-8,bytes.length-4)!=='IEND')reject();
  const channels:Record<number,number>={0:1,2:3,3:1,4:2,6:4};
  const rowBytes=(w:number)=>Math.ceil(w*channels[color]!*depth/8)+1;
  let expected=0;
  if(!interlace)expected=rowBytes(width)*height;
  else for(const [x,y,dx,dy] of [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] as const){
    const w=Math.max(0,Math.ceil((width-x)/dx)),h=Math.max(0,Math.ceil((height-y)/dy));
    if(w&&h)expected+=rowBytes(w)*h;
  }
  const input=Buffer.concat(compressed);
  // pngjs's noninterlaced sync inflater stops at maxLength and may miss a bad
  // checksum/excess output. Validate the complete stream, with a hard output cap,
  // before its full pixel decoder. Adam7 is bounded by the same exact pass sizes.
  // Node returns {buffer,engine} for info:true; @types/node 22's sync signature
  // only declares the default Buffer result.
  const inflated=inflateSync(input,{maxOutputLength:expected,info:true}) as unknown as {buffer:Buffer;engine:{bytesWritten:number}};
  if(inflated.buffer.length!==expected||inflated.engine.bytesWritten!==input.length)reject();
  return {width,height};
}

function jpegPreflight(bytes:Buffer){
  let offset=2,frame:ReturnType<typeof dimensions>|undefined,scans=0,markers=0;
  while(offset<bytes.length){
    if(++markers>2048||bytes[offset++]!==0xff)reject();
    while(bytes[offset]===0xff)offset++;
    const marker=bytes[offset++];
    if(marker===0xd9){if(offset!==bytes.length||!frame||!scans)reject();return frame;}
    if(marker===undefined||marker===0||marker===0xd8||(marker>=0xd0&&marker<=0xd7)||marker===1||offset+2>bytes.length)reject();
    const length=bytes.readUInt16BE(offset),end=offset+length;
    if(length<2||end>bytes.length)reject();
    if(marker===0xc0||marker===0xc1||marker===0xc2){
      if(frame||length<8||bytes[offset+2]!==8)reject();
      frame=dimensions(bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3));
      const components=bytes[offset+7]!;
      if(![1,3,4].includes(components)||length!==8+3*components)reject();
      const ids=new Set<number>();let blocks=0;
      for(let i=0;i<components;i++){
        const id=bytes[offset+8+i*3]!,sample=bytes[offset+9+i*3]!,h=sample>>4,v=sample&15;
        if(ids.has(id)||h<1||h>4||v<1||v>4||bytes[offset+10+i*3]!>3)reject();
        ids.add(id);blocks+=h*v;
      }
      if(blocks>10)reject();
    }else if(marker===0xda){
      if(!frame||++scans>16||length<6||length!==6+2*bytes[offset+2]!)reject();
      offset=end;const start=offset;
      while(offset<bytes.length){
        if(bytes[offset]!==0xff){offset++;continue;}
        if(bytes[offset+1]===0){offset+=2;continue;}
        if(bytes[offset+1]!>=0xd0&&bytes[offset+1]!<=0xd7){offset+=2;continue;}
        break;
      }
      if(offset===start)reject();
      continue;
    }else if(marker===0xe1&&bytes.toString('ascii',offset+2,offset+8)==='Exif\0\0')reject();
    else if(!(marker===0xc4||marker===0xdb||marker===0xdd||marker===0xfe||(marker>=0xe0&&marker<=0xef)))reject();
    offset=end;
  }
  return reject();
}

/** Caller must establish permission before calling; this validates pixels and
 * provenance, not source rights. Work is bounded by compressed bytes, dimensions,
 * PNG expansion and JPEG allocator limits. Synchronous decode still consumes CPU;
 * public ingestion must run this in a killable worker with a deadline/concurrency cap. */
export function decodeApprovedRaster(input:Uint8Array,identity:RasterIdentity):ClovaRaster {
  try{
    if(!(input instanceof Uint8Array)||input.byteLength===0||input.byteLength>MAX_BYTES)reject();
    if(!identity||typeof identity.assetId!=='string'||typeof identity.sourceRevisionId!=='string'
      ||typeof identity.originalSha256!=='string'||!TOKEN.test(identity.assetId)||!TOKEN.test(identity.sourceRevisionId)
      ||!/^[a-f0-9]{64}$/.test(identity.originalSha256))reject();
    const bytes=Buffer.from(input);
    if(createHash('sha256').update(bytes).digest('hex')!==identity.originalSha256)reject();
    let format:'png'|'jpeg',size:ReturnType<typeof dimensions>;
    if(bytes.subarray(0,8).equals(PNG_SIGNATURE)){
      format='png';size=pngPreflight(bytes);
      const decoded=PNG.sync.read(bytes,{checkCRC:true});
      if(decoded.width!==size.width||decoded.height!==size.height||decoded.data.length!==size.width*size.height*4)reject();
    }else if(bytes[0]===0xff&&bytes[1]===0xd8){
      format='jpeg';size=jpegPreflight(bytes);
      const decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:4,maxMemoryUsageInMB:128});
      if(decoded.width!==size.width||decoded.height!==size.height||decoded.data.length!==size.width*size.height*4)reject();
    }else return reject();
    return {bytes,sourceRevisionId:identity.sourceRevisionId,assetId:identity.assetId,originalSha256:identity.originalSha256,
      format,...size,transformVersion:'raster-identity-v1'};
  }catch{throw new RasterValidationError();}
}
