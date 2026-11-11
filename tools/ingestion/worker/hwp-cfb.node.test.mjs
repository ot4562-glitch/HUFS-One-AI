import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedHwpCfbStreams} from './hwp-cfb.mjs';
import {parseApprovedLegacyHwpDraft,createApprovedLegacyHwpExtractor}
  from './korean-documents.mjs';

const FREE=0xffffffff,END=0xfffffffe,FAT=0xfffffffd;
function record(tag,payload){
  const head=Buffer.alloc(4);
  head.writeUInt32LE(tag|(payload.length<<20));
  return Buffer.concat([head,payload]);
}
const paragraph='가상 HWP 원문\r';
const payload=Buffer.from(paragraph,'utf16le');
const count=Buffer.alloc(4);count.writeUInt32LE(paragraph.length);
const section=Buffer.concat([record(0x42,count),record(0x43,payload)]);
const source={sourceId:'SYN-SOURCE',revisionId:'SYN-REV'};
function syntheticHwp(){
  const header=Buffer.alloc(512,0);
  Buffer.from('d0cf11e0a1b11ae1','hex').copy(header,0);
  header.writeUInt16LE(0x3e,24);header.writeUInt16LE(3,26);
  header.writeUInt16LE(0xfffe,28);header.writeUInt16LE(9,30);
  header.writeUInt16LE(6,32);
  header.writeUInt32LE(1,44); // 1 FAT sector
  header.writeUInt32LE(0,48); // directory first sector
  header.writeUInt32LE(4096,56); // mini cutoff
  header.writeUInt32LE(2,60); // mini FAT sector
  header.writeUInt32LE(1,64);
  header.writeUInt32LE(END,68);
  for(let p=76;p<512;p+=4)header.writeUInt32LE(FREE,p);
  header.writeUInt32LE(1,76); // FAT SID
  const directory=Buffer.alloc(512);
  const entry=(id,{name,type,left=FREE,right=FREE,child=FREE,start=END,size=0})=>{
    const at=id*128,utf16=Buffer.from(name+'\0','utf16le');
    utf16.copy(directory,at);
    directory.writeUInt16LE(utf16.length,at+64);
    directory[at+66]=type;directory[at+67]=1;
    directory.writeUInt32LE(left,at+68);
    directory.writeUInt32LE(right,at+72);
    directory.writeUInt32LE(child,at+76);
    directory.writeUInt32LE(start,at+116);
    directory.writeUInt32LE(size,at+120);
  };
  entry(0,{name:'Root Entry',type:5,child:1,start:3,size:320});
  entry(1,{name:'FileHeader',type:2,right:2,start:0,size:256});
  entry(2,{name:'BodyText',type:1,child:3});
  entry(3,{name:'Section0',type:2,start:4,size:section.length});
  const fat=Buffer.alloc(512),miniFAT=Buffer.alloc(512);
  for(let p=0;p<512;p+=4){
    fat.writeUInt32LE(FREE,p);
    miniFAT.writeUInt32LE(FREE,p);
  }
  fat.writeUInt32LE(END,0);
  fat.writeUInt32LE(FAT,4);
  fat.writeUInt32LE(END,8);
  fat.writeUInt32LE(END,12);
  miniFAT.writeUInt32LE(1,0);
  miniFAT.writeUInt32LE(2,4);
  miniFAT.writeUInt32LE(3,8);
  miniFAT.writeUInt32LE(END,12);
  miniFAT.writeUInt32LE(END,16);
  const miniStream=Buffer.alloc(512);
  const fileHeader=Buffer.alloc(256);
  fileHeader.write('HWP Document File','ascii');
  fileHeader.copy(miniStream,0);
  section.copy(miniStream,256);
  return Buffer.concat([header,directory,fat,miniFAT,miniStream]);
}
describe('#445 complete in-memory HWP5 OLE CFB FAT / MiniFAT reader',()=>{
  it('reads actual synthetic .hwp container bytes without an external converter',async()=>{
    const bytes=syntheticHwp();
    const streams=readBoundedHwpCfbStreams(bytes);
    assert.equal(streams.fileHeader.length,256);
    assert.equal(streams.sectionStreams.length,1);
    assert.deepEqual(streams.sectionStreams[0],section);
    const parsed=parseApprovedLegacyHwpDraft({...source,content:bytes});
    assert.equal(parsed.state,'NEEDS_REVIEW');
    assert.equal(parsed.format,'HWP5_CFB');
    assert.match(parsed.originalSha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(parsed.paragraphs,[{id:'s0p1',text:'가상 HWP 원문'}]);
    const port=createApprovedLegacyHwpExtractor(source);
    assert.deepEqual(await port.extract({
      content:bytes,contentType:'application/x-hwp',
    }),parsed.paragraphs);
    await assert.rejects(port.extract({
      content:bytes,contentType:'application/pdf',
    }),/KOREAN_DOCUMENT_REQUIRES_REVIEW/);
  });
  it('fails closed on OLE header forgery, invalid FAT/mini chains and directory graph cycles',()=>{
    const cases=[
      bytes=>{bytes[0]=0x50;},
      bytes=>{bytes.writeUInt32LE(1,512+512+0);}, // directory stream FAT points at sector 1
      bytes=>{bytes.writeUInt32LE(3,512+512+12);}, // root FAT cyclic
      bytes=>{bytes.writeUInt32LE(4,512+512+512+16);}, // mini FAT cyclic
      bytes=>{bytes.writeUInt32LE(1,512+128+72);}, // FileHeader right sibling loops
      bytes=>{bytes.writeUInt32LE(4,512+128+116);}, // mini sector alias to Section
      bytes=>{bytes.writeUInt32LE(99,512+384+116);}, // bad mini start
      bytes=>{bytes.writeUInt32LE(0x1000000,512+384+120);}, // unbounded section size
      bytes=>{bytes.writeUInt32LE(4,48);}, // directory SID points outside file
      bytes=>{bytes.writeUInt32LE(2,512+512+4);}, // FAT sector incorrectly claimed
      bytes=>{bytes.writeUInt16LE(0,28);}, // endianness
    ];
    for(const mutate of cases){
      const b=syntheticHwp();mutate(b);
      assert.throws(()=>parseApprovedLegacyHwpDraft({...source,content:b}),
        /KOREAN_DOCUMENT_REQUIRES_REVIEW/);
    }
  });
  it('rejects unsupported encrypted HWP and malformed Section records',()=>{
    const encrypted=syntheticHwp();
    encrypted.writeUInt32LE(2,512+512+512+512+36);
    assert.throws(()=>parseApprovedLegacyHwpDraft({
      ...source,content:encrypted}),/KOREAN_DOCUMENT_REQUIRES_REVIEW/);
    const corrupted=syntheticHwp();
    corrupted[512*4+256+0]=0;
    assert.throws(()=>parseApprovedLegacyHwpDraft({
      ...source,content:corrupted}),/KOREAN_DOCUMENT_REQUIRES_REVIEW/);
  });
});
