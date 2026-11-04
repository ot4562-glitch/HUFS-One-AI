import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {PNG} from 'pngjs';
import jpeg from 'jpeg-js';
import {describe,expect,it} from 'vitest';
import {decodeApprovedRaster,RasterValidationError} from '../../packages/ai/src/raster.js';

function crc(bytes:Buffer){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;}
function chunk(type:string,data:Buffer){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;}
function png(width=16,height=12){const image=new PNG({width,height});for(let i=0;i<image.data.length;i++)image.data[i]=(i*31)%256;return PNG.sync.write(image);}
function jpg(width=16,height=12){return jpeg.encode({width,height,data:Buffer.alloc(width*height*4,127)},75).data;}
function binding(bytes:Uint8Array){return {sourceRevisionId:'synthetic-rev',assetId:'synthetic-asset',originalSha256:createHash('sha256').update(bytes).digest('hex')};}
function decode(bytes:Uint8Array){return decodeApprovedRaster(bytes,binding(bytes));}
function withHeader(bytes:Buffer,change:(h:Buffer)=>void){const h=Buffer.from(bytes.subarray(16,29));change(h);return Buffer.concat([bytes.subarray(0,8),chunk('IHDR',h),bytes.subarray(33)]);}
function withData(bytes:Buffer,data:Buffer){return Buffer.concat([bytes.subarray(0,33),chunk('IDAT',data),chunk('IEND',Buffer.alloc(0))]);}

describe('approved raster decoding from synthetic pixels',()=>{
  it.each(['png','jpeg'] as const)('fully decodes %s with dimensions derived from bytes',format=>{
    const bytes=format==='png'?png():jpg();
    const result=decode(bytes);
    expect(result).toMatchObject({...binding(bytes),format:format==='png'?'png':'jpeg',width:16,height:12,transformVersion:'raster-identity-v1'});
    expect(result.bytes).toEqual(bytes);
    expect(result.bytes).not.toBe(bytes);
  });
  it('snapshots caller bytes',()=>{const bytes=png(),result=decode(bytes);bytes.fill(0);expect(result.bytes[0]).toBe(137);});
  it('decodes synthetic Adam7 passes with bounded inflation',()=>{
    const header=withHeader(png(3,3),h=>{h[12]=1;});
    // Adam7 nonempty pass row sizes for 3x3 RGBA8: 5 + 5 + 9 + 10 + 13.
    expect(decode(withData(header,deflateSync(Buffer.alloc(42))))).toMatchObject({width:3,height:3,format:'png'});
  });
  it('decodes synthetic one-bit palette pixels',()=>{
    const header=withHeader(png(3,2),h=>{h[8]=1;h[9]=3;});
    const bytes=Buffer.concat([header.subarray(0,33),chunk('PLTE',Buffer.from([0,0,0,255,255,255])),chunk('IDAT',deflateSync(Buffer.from([0,0xa0,0,0x40]))),chunk('IEND',Buffer.alloc(0))]);
    expect(decode(bytes)).toMatchObject({width:3,height:2});
  });
  it('decodes synthetic sixteen-bit grayscale pixels',()=>{
    const header=withHeader(png(3,2),h=>{h[8]=16;h[9]=0;});
    expect(decode(withData(header,deflateSync(Buffer.alloc(14))))).toMatchObject({width:3,height:2});
  });
  it('ignores caller-supplied dimensions and format',()=>{const bytes=png();expect(decodeApprovedRaster(bytes,{...binding(bytes),width:999,height:999,format:'jpeg'} as ReturnType<typeof binding>)).toMatchObject({width:16,height:12,format:'png'});});
  it('rejects a different original hash',()=>{const bytes=png();expect(()=>decodeApprovedRaster(bytes,{...binding(bytes),originalSha256:'0'.repeat(64)})).toThrow(RasterValidationError);});
  it.each(['','../asset','x'.repeat(129),undefined,null,123])('rejects invalid provenance token %s',assetId=>{const bytes=png();expect(()=>decodeApprovedRaster(bytes,{...binding(bytes),assetId} as ReturnType<typeof binding>)).toThrow(RasterValidationError);});
  it.each([Buffer.alloc(0),Buffer.from('not a raster'),Buffer.from('%PDF-1.7'),Buffer.alloc(5*1024*1024+1)])('rejects unsupported/oversized bytes',bytes=>{expect(()=>decode(bytes)).toThrow(RasterValidationError);});
  it.each(['truncated','crc','trailer','apng','zero','side','pixels','interlaceInvalid','depth','critical','exif'] as const)('rejects PNG %s',kind=>{
    let bytes=png();
    if(kind==='truncated')bytes=bytes.subarray(0,-1);
    if(kind==='crc')bytes[29]=bytes[29]!^1;
    if(kind==='trailer')bytes=Buffer.concat([bytes,Buffer.from('trailer')]);
    if(kind==='apng'||kind==='critical'||kind==='exif')bytes=Buffer.concat([bytes.subarray(0,33),chunk(kind==='apng'?'acTL':kind==='exif'?'eXIf':'FAKE',Buffer.alloc(8)),bytes.subarray(33)]);
    if(['zero','side','pixels','interlaceInvalid','depth'].includes(kind))bytes=withHeader(bytes,h=>{
      if(kind==='zero')h.writeUInt32BE(0);
      if(kind==='side')h.writeUInt32BE(2241);
      if(kind==='pixels'){h.writeUInt32BE(2240);h.writeUInt32BE(2240,4);}
      if(kind==='interlaceInvalid')h[12]=2;
      if(kind==='depth')h[8]=3;
    });
    expect(()=>decode(bytes)).toThrow(RasterValidationError);
  });
  it.each(['checksum','overExpansion','underExpansion','extraCompressedStream'] as const)('rejects PNG inflated %s',kind=>{
    let data=deflateSync(Buffer.alloc(12*(16*4+1)));
    if(kind==='checksum')data[data.length-1]=data[data.length-1]!^1;
    if(kind==='overExpansion')data=deflateSync(Buffer.alloc(12*(16*4+1)+100000));
    if(kind==='underExpansion')data=deflateSync(Buffer.alloc(1));
    if(kind==='extraCompressedStream')data=Buffer.concat([data,deflateSync(Buffer.from('extra'))]);
    expect(()=>decode(withData(png(),data))).toThrow(RasterValidationError);
  });
  it.each(['truncated','trailer','segment','side','pixels','exif','entropy'] as const)('rejects JPEG %s',kind=>{
    let bytes=Buffer.from(jpg());
    if(kind==='truncated')bytes=bytes.subarray(0,-2);
    if(kind==='trailer')bytes=Buffer.concat([bytes,Buffer.from('trailer')]);
    if(kind==='segment')bytes.writeUInt16BE(65535,4);
    if(kind==='exif'){const exif=Buffer.from([0xff,0xe1,0,8,69,120,105,102,0,0]);bytes=Buffer.concat([bytes.subarray(0,2),exif,bytes.subarray(2)]);}
    const sof=bytes.indexOf(Buffer.from([0xff,0xc0]));
    if(kind==='side')bytes.writeUInt16BE(2241,sof+7);
    if(kind==='pixels'){bytes.writeUInt16BE(2240,sof+5);bytes.writeUInt16BE(2240,sof+7);}
    if(kind==='entropy'){const sos=bytes.indexOf(Buffer.from([0xff,0xda]));const end=sos+2+bytes.readUInt16BE(sos+2);bytes=Buffer.concat([bytes.subarray(0,end),Buffer.from([0xff,0xd9])]);}
    expect(()=>decode(bytes)).toThrow(RasterValidationError);
  });
});
