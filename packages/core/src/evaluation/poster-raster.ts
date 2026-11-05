/** Tiny authored bitmap alphabet. No system font, model or remote asset is used. */
const GLYPHS:Record<string,string>={
 A:'01110/10001/10001/11111/10001/10001/10001',B:'11110/10001/10001/11110/10001/10001/11110',
 C:'01111/10000/10000/10000/10000/10000/01111',D:'11110/10001/10001/10001/10001/10001/11110',
 E:'11111/10000/10000/11110/10000/10000/11111',F:'11111/10000/10000/11110/10000/10000/10000',
 G:'01111/10000/10000/10111/10001/10001/01111',H:'10001/10001/10001/11111/10001/10001/10001',
 I:'11111/00100/00100/00100/00100/00100/11111',J:'00111/00010/00010/00010/10010/10010/01100',
 K:'10001/10010/10100/11000/10100/10010/10001',L:'10000/10000/10000/10000/10000/10000/11111',
 M:'10001/11011/10101/10101/10001/10001/10001',N:'10001/11001/10101/10011/10001/10001/10001',
 O:'01110/10001/10001/10001/10001/10001/01110',P:'11110/10001/10001/11110/10000/10000/10000',
 Q:'01110/10001/10001/10001/10101/10010/01101',R:'11110/10001/10001/11110/10100/10010/10001',
 S:'01111/10000/10000/01110/00001/00001/11110',T:'11111/00100/00100/00100/00100/00100/00100',
 U:'10001/10001/10001/10001/10001/10001/01110',V:'10001/10001/10001/10001/10001/01010/00100',
 W:'10001/10001/10001/10101/10101/10101/01010',X:'10001/10001/01010/00100/01010/10001/10001',
 Y:'10001/10001/01010/00100/00100/00100/00100',Z:'11111/00001/00010/00100/01000/10000/11111',
 '0':'01110/10001/10011/10101/11001/10001/01110','1':'00100/01100/00100/00100/00100/00100/01110',
 '2':'01110/10001/00001/00010/00100/01000/11111','3':'11110/00001/00001/01110/00001/00001/11110',
 '4':'00010/00110/01010/10010/11111/00010/00010','5':'11111/10000/10000/11110/00001/00001/11110',
 '6':'01110/10000/10000/11110/10001/10001/01110','7':'11111/00001/00010/00100/01000/01000/01000',
 '8':'01110/10001/10001/01110/10001/10001/01110','9':'01110/10001/10001/01111/00001/00001/01110',
 ':':'00000/00100/00100/00000/00100/00100/00000','-':'00000/00000/00000/11111/00000/00000/00000',
 '.':'00000/00000/00000/00000/00000/00100/00100','/':'00001/00001/00010/00100/01000/10000/10000',
 ' ':'00000/00000/00000/00000/00000/00000/00000',
};
export type PixelBox=[number,number,number,number];
function crc32(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(name:string,data:Uint8Array){const type=Buffer.from(name,'ascii'),b=Buffer.alloc(12+data.length);
  b.writeUInt32BE(data.length);type.copy(b,4);b.set(data,8);b.writeUInt32BE(crc32(Buffer.concat([type,data])),8+data.length);return b;}
/** Stored DEFLATE blocks make output bytes independent of zlib/platform versions. */
function zlibStored(bytes:Uint8Array){const parts:Buffer[]=[Buffer.from([0x78,0x01])];let a=1,b=0;
  for(const value of bytes){a=(a+value)%65521;b=(b+a)%65521;}
  for(let offset=0;offset<bytes.length;offset+=65535){const block=bytes.subarray(offset,Math.min(offset+65535,bytes.length));
    const h=Buffer.alloc(5);h[0]=offset+block.length===bytes.length?1:0;h.writeUInt16LE(block.length,1);h.writeUInt16LE(0xffff^block.length,3);parts.push(h,Buffer.from(block));}
  const sum=Buffer.alloc(4);sum.writeUInt32BE(((b<<16)|a)>>>0);parts.push(sum);return Buffer.concat(parts);}
export function renderPosterRaster(lines:readonly string[]){
  if(lines.length>6||lines.some(s=>s.length>48||[...s].some(c=>!GLYPHS[c])))throw new Error('Unsupported fixture glyph/layout');
  const width=640,height=360,pixels=new Uint8Array(width*height);
  const draw=(text:string,x:number,y:number,scale:number,color:number):PixelBox=>{
    let left=width,top=height,right=0,bottom=0;
    for(const [index,char]of [...text].entries())for(const [row,bits]of GLYPHS[char]!.split('/').entries())
      for(let column=0;column<5;column++)if(bits[column]==='1')for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
        const px=x+index*6*scale+column*scale+dx,py=y+row*scale+dy;
        if(px<0||py<0||px>=width||py>=height)throw new Error('Fixture layout overflow');
        pixels[py*width+px]=color;left=Math.min(left,px);top=Math.min(top,py);right=Math.max(right,px+1);bottom=Math.max(bottom,py+1);
      }
    if(right<=left||bottom<=top)throw new Error('Empty fixture line');return[left,top,right,bottom];
  };
  draw('SYNTHETIC EVALUATION POSTER',24,16,2,2);
  const fields=lines.map((text,index)=>{const rowTop=48+index*40;return{text,rowTop,bboxPx:draw(text,24,rowTop,2,1)};});
  draw('SYNTHETIC / NOT AN ACTUAL NOTICE',24,332,1,2);
  const raw=Buffer.alloc((width+1)*height);for(let y=0;y<height;y++)raw.set(pixels.subarray(y*width,(y+1)*width),y*(width+1)+1);
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=3;
  const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
    chunk('PLTE',Buffer.from([255,255,255,16,24,40,40,86,140])),chunk('IDAT',zlibStored(raw)),chunk('IEND',Buffer.alloc(0))]);
  return {bytes,width,height,fields};
}
