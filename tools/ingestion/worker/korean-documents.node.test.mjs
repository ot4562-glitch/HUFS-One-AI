import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {parseApprovedHwpxDraft,readBoundedHwpxZip,
  createApprovedHwpxExtractor,parseLegacyHwpSectionDraft} from './korean-documents.mjs';

const encode=value=>Buffer.from(value,'utf8');
function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){
    crc^=byte;
    for(let k=0;k<8;k++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;
  }
  return (crc^0xffffffff)>>>0;
}
function zip(entries){
  const locals=[],central=[];
  let offset=0;
  for(const {name,text,method=8,flags=0} of entries){
    const content=Buffer.isBuffer(text)?text:encode(text);
    const data=method===8?deflateRawSync(content):content;
    const nameBuf=encode(name),checksum=crc32(content);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);
    local.writeUInt16LE(flags,6);
    local.writeUInt16LE(method,8);
    local.writeUInt32LE(checksum,14);
    local.writeUInt32LE(data.length,18);
    local.writeUInt32LE(content.length,22);
    local.writeUInt16LE(nameBuf.length,26);
    const cd=Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50,0);
    cd.writeUInt16LE(20,4);
    cd.writeUInt16LE(20,6);
    cd.writeUInt16LE(flags,8);
    cd.writeUInt16LE(method,10);
    cd.writeUInt32LE(checksum,16);
    cd.writeUInt32LE(data.length,20);
    cd.writeUInt32LE(content.length,24);
    cd.writeUInt16LE(nameBuf.length,28);
    cd.writeUInt32LE(offset,42);
    const l=Buffer.concat([local,nameBuf,data]);
    locals.push(l);central.push(Buffer.concat([cd,nameBuf]));
    offset+=l.length;
  }
  const directory=Buffer.concat(central),eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);
  eocd.writeUInt16LE(entries.length,8);eocd.writeUInt16LE(entries.length,10);
  eocd.writeUInt32LE(directory.length,12);eocd.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,eocd]);
}
const sections=[
  {name:'Contents/section0.xml',text:'<?xml version="1.0" encoding="UTF-8"?><hs:sec><hp:p><hp:run><hp:t>가상 지원 마감일: 2026.12.31</hp:t></hp:run></hp:p><hp:p><hp:tbl><hp:tc><hp:p><hp:run><hp:t>모의 장학 서식</hp:t></hp:run></hp:p></hp:tc></hp:tbl></hp:p></hs:sec>'},
  {name:'Contents/section1.xml',text:'<hs:sec><hp:p><hp:run><hp:t>글로벌 캠퍼스</hp:t></hp:run></hp:p></hs:sec>'},
];
const manifest='<opf:package><opf:manifest><opf:item id="a" href="section0.xml"/><opf:item id="b" href="section1.xml"/></opf:manifest><opf:spine><opf:itemref idref="b"/><opf:itemref idref="a"/></opf:spine></opf:package>';
const entries=[
  {name:'mimetype',text:'application/hwp+zip',method:0},
  {name:'Contents/content.hpf',text:manifest},
  ...sections,
];
const approved={sourceId:'SYN-SOURCE',revisionId:'SYN-REV'};
function record(tag,content,level=0){
  const h=Buffer.alloc(4);h.writeUInt32LE(tag|level<<10|content.length<<20);
  return Buffer.concat([h,content]);
}
describe('#445 HWPX actual ZIP/XML parser (synthetic bytes only)',()=>{
  it('reads compressed sections in manifest spine order and excludes enclosing table duplicates',()=>{
    const bytes=zip(entries);
    const d=parseApprovedHwpxDraft({...approved,content:bytes});
    assert.equal(d.state,'NEEDS_REVIEW');assert.equal(d.format,'HWPX');
    assert.equal(d.completeness,'TEXT_ONLY_LAYOUT_AND_NON_TEXT_NEED_REVIEW');
    assert.match(d.originalSha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(d.paragraphs.map(x=>x.text),[
      '글로벌 캠퍼스','가상 지원 마감일: 2026.12.31','모의 장학 서식',
    ]);
    assert.equal(d.paragraphs.length,3);
    assert.equal(readBoundedHwpxZip(bytes).size,4);
  });
  it('SourceContentExtractor wrapper requires explicit HWPX content type',async()=>{
    const extractor=createApprovedHwpxExtractor(approved);
    const paragraphs=await extractor.extract({
      content:zip(entries),contentType:'application/hwp+zip',
    });
    assert.equal(paragraphs.length,3);
    await assert.rejects(extractor.extract({
      content:zip(entries),contentType:'application/pdf',
    }),/KOREAN_DOCUMENT_REQUIRES_REVIEW/);
  });
  it('blocks spoofed mimetype, duplicate entries, path traversal and unreferenced sections',()=>{
    for(const files of [
      [{...entries[0],text:'application/zip'},...entries.slice(1)],
      [...entries,entries[2]],
      [...entries,{name:'Contents/../secret',text:'payload'}],
      [...entries,{name:'Contents/section2.xml',text:'<hs:sec/>'}],
      [entries[0],entries[1],entries[2]],
      [entries[0],{name:'Contents/content.hpf',text:manifest.replace('idref="b"','idref="unknown"')},...sections],
    ])assert.throws(()=>parseApprovedHwpxDraft({...approved,content:zip(files)}),
      /KOREAN_DOCUMENT_REQUIRES_REVIEW/);
  });
  it('rejects corrupted CRC, local/central header mismatch, flags and truncated EOCD',()=>{
    const original=zip(entries);
    const cases=[
      Buffer.from(original),
      Buffer.from(original),
      Buffer.from(original),
      original.subarray(0,original.length-4),
    ];
    cases[0].writeUInt32LE(0,14);
    cases[1].writeUInt16LE(1,6);
    cases[2].writeUInt32LE(0xffffffff,18);
    for(const candidate of cases)
      assert.throws(()=>parseApprovedHwpxDraft({...approved,content:candidate}),
        /KOREAN_DOCUMENT_REQUIRES_REVIEW/);
  });
  it('blocks XML DTD and excessive expanded or raw content',()=>{
    const corrupted=zip([entries[0],entries[1],{
      name:'Contents/section0.xml',text:'<!DOCTYPE root [<!ENTITY x SYSTEM "file:///etc/passwd">]><hs:sec><hp:p><hp:t>&x;</hp:t></hp:p></hs:sec>',
    },sections[1]]);
    assert.throws(()=>parseApprovedHwpxDraft({...approved,content:corrupted}),
      /KOREAN_DOCUMENT_REQUIRES_REVIEW/);
    const huge=zip([entries[0],entries[1],{
      name:'Contents/section0.xml',text:'<hs:sec><hp:p><hp:t>'+('가'.repeat(100000))+'</hp:t></hp:p></hs:sec>',
    },sections[1]]);
    assert.throws(()=>parseApprovedHwpxDraft({...approved,content:huge}),
      /KOREAN_DOCUMENT_REQUIRES_REVIEW/);
  });
});
describe('#445 HWP5 binary section record decoder (requires independently reviewed CFB stream)',()=>{
  const header=Buffer.alloc(256);
  header.write('HWP Document File','ascii');
  const text='가상 HWP 문단\r',payload=Buffer.from(text,'utf16le');
  const count=Buffer.alloc(4);count.writeUInt32LE(text.length);
  const section=Buffer.concat([record(0x42,count),record(0x43,payload)]);
  it('decodes plain and raw-deflate HWP5 Section streams with review-only state',()=>{
    const raw=parseLegacyHwpSectionDraft({fileHeader:header,
      sectionStreams:[section],...approved});
    assert.equal(raw.state,'NEEDS_REVIEW');
    assert.deepEqual(raw.paragraphs,[{id:'s0p1',text:'가상 HWP 문단'}]);
    const flags=Buffer.from(header);flags.writeUInt32LE(1,36);
    const zipped=parseLegacyHwpSectionDraft({
      fileHeader:flags,sectionStreams:[deflateRawSync(section)],...approved,
    });
    assert.deepEqual(zipped.paragraphs,raw.paragraphs);
  });
  it('rejects mismatched paragraph character counts and dangling nonempty headers',()=>{
    const tooLong=Buffer.alloc(4);tooLong.writeUInt32LE(text.length+2);
    const badCount=Buffer.concat([record(0x42,tooLong),record(0x43,payload)]);
    const dangling=Buffer.concat([section,record(0x42,count)]);
    const skipped=Buffer.concat([record(0x42,count),record(0x42,count),record(0x43,payload)]);
    for(const bytes of [badCount,dangling,skipped]){
      assert.throws(()=>parseLegacyHwpSectionDraft({
        fileHeader:header,sectionStreams:[bytes],...approved,
      }),/KOREAN_DOCUMENT_REQUIRES_REVIEW/);
    }
  });
  it('refuses encrypted, distribution-only, unsupported controls and bad records',()=>{
    for(const flags of [2,4,6]){
      const h=Buffer.from(header);h.writeUInt32LE(flags,36);
      assert.throws(()=>parseLegacyHwpSectionDraft({fileHeader:h,
        sectionStreams:[section],...approved}),/KOREAN_DOCUMENT_REQUIRES_REVIEW/);
    }
    const control=Buffer.concat([record(0x42,count),record(0x43,Buffer.from('A\u000b\r','utf16le'))]);
    for(const bytes of [control,section.subarray(0,section.length-1)]){
      assert.throws(()=>parseLegacyHwpSectionDraft({
        fileHeader:header,sectionStreams:[bytes],...approved,
      }),/KOREAN_DOCUMENT_REQUIRES_REVIEW/);
    }
  });
});
