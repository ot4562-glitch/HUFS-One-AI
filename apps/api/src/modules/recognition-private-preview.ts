/** Server-only raster primitive for #512. Callers must independently bind an
 * authenticated owner, current asset/page/rights and trusted mask specification.
 * This function grants no read permission and does not find sensitive content.
 * It handles already decoded RGBA; file decoding/inspection is a separate port.
 */
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';

export type RecognitionMaskBox=readonly [number,number,number,number];
export interface RecognitionPageRaster{width:number;height:number;rgba:Uint8Array;}
const fail=():never=>{throw new Error('Invalid recognition preview');};
const crcTable=Uint32Array.from({length:256},(_,initial)=>{
  let value=initial;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;
});
function chunk(kind:string,data:Buffer):Buffer{
  const type=Buffer.from(kind,'ascii'),body=Buffer.concat([type,data]);let crc=0xffffffff;
  for(const value of body)crc=(crc>>>8)^crcTable[(crc^value)&255]!;
  const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length,0);body.copy(result,4);
  result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
}

/** Rasterizes each declared rectangle to opaque black, rounding OUTWARD.
 * No original encoded bytes, EXIF, text, ancillary chunks, filename or URL are
 * copied. Empty masks explicitly preserve pixels; never call that anonymized.
 * The output PNG encodes only IHDR, IDAT and IEND. Even hidden alpha-channel
 * values inside masks are replaced. Input buffers are never mutated.
 */
export function createMaskedRecognitionPng(input:RecognitionPageRaster,boxes:readonly RecognitionMaskBox[]):{
  png:Buffer;sha256:string;maskedPixels:number;
}{
  const {width,height,rgba}=input;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096
    ||width*height>4_194_304||!(rgba instanceof Uint8Array)||rgba.byteLength!==width*height*4
    ||rgba.buffer instanceof SharedArrayBuffer||!Array.isArray(boxes)||boxes.length>500)fail();
  const rectangles=boxes.map(box=>{
    if(!Array.isArray(box)||box.length!==4||box.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)
      ||box[0]>=box[2]||box[1]>=box[3])return fail();
    return [Math.floor(box[0]*width),Math.floor(box[1]*height),Math.ceil(box[2]*width),Math.ceil(box[3]*height)] as const;
  }).sort((a,b)=>a[0]-b[0]);
  const pixels=Buffer.from(rgba),black=Buffer.from([0,0,0,255]);let maskedPixels=0;
  // Merge active intervals per row, so 500 overlapping full-page boxes do not
  // perform 500 full-page pixel passes. Every output pixel is filled at most once.
  for(let y=0;y<height;y++){
    let start=-1,end=-1;
    const fill=()=>{if(start>=0){pixels.fill(black,(y*width+start)*4,(y*width+end)*4);maskedPixels+=end-start;}};
    for(const [left,top,right,bottom] of rectangles){
      if(y<top||y>=bottom)continue;
      if(start<0){start=left;end=right;}
      else if(left<=end)end=Math.max(end,right);
      else{fill();start=left;end=right;}
    }
    fill();
  }
  const scanlines=Buffer.alloc(height*(width*4+1));
  for(let y=0;y<height;y++)pixels.copy(scanlines,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
    chunk('IDAT',deflateSync(scanlines,{level:6})),chunk('IEND',Buffer.alloc(0))]);
  return {png,sha256:createHash('sha256').update(png).digest('hex'),maskedPixels};
}
