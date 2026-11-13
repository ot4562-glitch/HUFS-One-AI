import {describe,it,expect} from 'vitest';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createMaskedRecognitionPng} from '../../apps/api/src/modules/recognition-private-preview.js';

function raster(width=4,height=3){return {width,height,rgba:new Uint8Array(width*height*4).fill(73)};}
function decode(png:Buffer){
  expect([...png.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  const chunks:{kind:string;data:Buffer}[]=[];
  for(let at=8;at<png.length;){
    const size=png.readUInt32BE(at);let crc=0xffffffff;
    for(const byte of png.subarray(at+4,at+8+size)){
      crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
    }
    expect(png.readUInt32BE(at+8+size)).toBe((crc^0xffffffff)>>>0);
    chunks.push({kind:png.toString('ascii',at+4,at+8),data:png.subarray(at+8,at+8+size)});at+=12+size;
  }
  expect(chunks.map(c=>c.kind)).toEqual(['IHDR','IDAT','IEND']);
  const header=chunks[0]!.data;expect([...header.subarray(8)]).toEqual([8,6,0,0,0]);
  const width=header.readUInt32BE(0),height=header.readUInt32BE(4),raw=inflateSync(chunks[1]!.data),pixels=[];
  for(let y=0;y<height;y++){expect(raw[y*(width*4+1)]).toBe(0);pixels.push(...raw.subarray(y*(width*4+1)+1,(y+1)*(width*4+1)));}
  return {width,height,pixels};
}
describe('private recognition page pixel masking',()=>{
  it('replaces every channel with opaque black and leaves the input untouched',()=>{
    const input=raster(),copy=input.rgba.slice();
    const result=createMaskedRecognitionPng(input,[[.25,1/3,.75,2/3]]),decoded=decode(result.png);
    expect(decoded.width).toBe(4);expect(decoded.height).toBe(3);expect(input.rgba).toEqual(copy);
    for(let y=0;y<3;y++)for(let x=0;x<4;x++)expect(decoded.pixels.slice((y*4+x)*4,(y*4+x+1)*4))
      .toEqual(y===1&&x>=1&&x<3?[0,0,0,255]:[73,73,73,73]);
    expect(result.maskedPixels).toBe(2);expect(result.sha256).toBe(createHash('sha256').update(result.png).digest('hex'));
  });
  it('rounds fractional edges outward and counts overlapping masks only once',()=>{
    const result=createMaskedRecognitionPng(raster(),[[.01,.01,.26,.34],[0,0,.5,2/3]]);
    expect(result.maskedPixels).toBe(4);
    expect(decode(result.png).pixels.slice(0,8)).toEqual([0,0,0,255,0,0,0,255]);
  });
  it('can cover the entire page without retaining hidden alpha or pixel values',()=>{
    const result=createMaskedRecognitionPng(raster(),[[0,0,1,1]]);
    expect(result.maskedPixels).toBe(12);expect(new Set(decode(result.png).pixels)).toEqual(new Set([0,255]));
  });
  it('returns a deterministic metadata-free PNG for an explicit empty mask list',()=>{
    const a=createMaskedRecognitionPng(raster(),[]),b=createMaskedRecognitionPng(raster(),[]);
    expect(a.png).toEqual(b.png);expect(a.sha256).toBe(b.sha256);expect(a.maskedPixels).toBe(0);
    expect(decode(a.png).pixels).toEqual([...raster().rgba]);
  });
  it('merges arbitrary overlapping row intervals without changing their exact union',()=>{
    let seed=195;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
    for(let trial=0;trial<40;trial++){
      const boxes=Array.from({length:8},()=>{const xs=[random(),random()].sort((a,b)=>a-b),ys=[random(),random()].sort((a,b)=>a-b);
        return [xs[0]!,ys[0]!,xs[1]!,ys[1]!] as const;});
      const result=createMaskedRecognitionPng(raster(8,7),boxes),decoded=decode(result.png);let count=0;
      for(let y=0;y<7;y++)for(let x=0;x<8;x++){
        const covered=boxes.some(b=>x>=Math.floor(b[0]*8)&&x<Math.ceil(b[2]*8)&&y>=Math.floor(b[1]*7)&&y<Math.ceil(b[3]*7));
        if(covered)count++;
        expect(decoded.pixels.slice((y*8+x)*4,(y*8+x+1)*4)).toEqual(covered?[0,0,0,255]:[73,73,73,73]);
      }
      expect(result.maskedPixels).toBe(count);
    }
  });
  it('handles the maximum pixel count and 500 fully overlapping masks as one covered page',()=>{
    const result=createMaskedRecognitionPng(raster(2048,2048),Array.from({length:500},()=>[0,0,1,1] as const));
    expect(result.maskedPixels).toBe(4_194_304);expect(result.png.length).toBeLessThan(100_000);
    const idat=33,size=result.png.readUInt32BE(idat),raw=inflateSync(result.png.subarray(idat+8,idat+8+size));
    expect([...raw.subarray(1,5)]).toEqual([0,0,0,255]);expect([...raw.subarray(-4)]).toEqual([0,0,0,255]);
  });
  it.each([[0,3],[1.5,2],[4097,1],[2048,2049],[NaN,1]])('rejects invalid or excessive dimensions %s x %s',(width,height)=>{
    expect(()=>createMaskedRecognitionPng({width,height,rgba:new Uint8Array(4)},[])).toThrow('Invalid recognition preview');
  });
  it('rejects malformed byte buffers and invalid mask boundaries',()=>{
    expect(()=>createMaskedRecognitionPng({...raster(),rgba:new Uint8Array(4)},[])).toThrow();
    for(const box of [[-.1,0,1,1],[0,0,Infinity,1],[0,0,0,1],[0,1,1,.5],[0,0,1,1,2]])
      expect(()=>createMaskedRecognitionPng(raster(),[box as [number,number,number,number]])).toThrow();
    expect(()=>createMaskedRecognitionPng(raster(),Array.from({length:501},()=>[0,0,1,1]))).toThrow();
  });
});
