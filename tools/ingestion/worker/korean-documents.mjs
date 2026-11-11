/**
 * #445: bounded, offline HWPX ZIP/XML extraction and HWP 5 section-record decoder.
 * Neither API is authority to collect, store, search, OCR or publish a document.
 * Raw HWP 5 CFB stream decoding is available but remains review-only.
 */
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {load} from 'cheerio';
import {readBoundedHwpCfbStreams} from './hwp-cfb.mjs';

const MAX_ARCHIVE=8*1024*1024;
const MAX_EXPANDED=16*1024*1024;
const MAX_ENTRIES=128;
const MAX_PARAGRAPHS=200;
const MAX_LINE=20000;
const utf8=new TextDecoder('utf-8',{fatal:true});
const utf16=new TextDecoder('utf-16le',{fatal:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ref=/^[A-Za-z0-9_.:-]{1,128}$/;
function denied(){throw new Error('KOREAN_DOCUMENT_REQUIRES_REVIEW');}
const local=tag=>String(tag??'').split(':').at(-1).toLowerCase();
function xml(bytes){
  let value;
  try{value=utf8.decode(bytes);}catch{denied();}
  if(value.length>3*1024*1024||/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(value)
    ||/\u0000/.test(value))denied();
  return load(value,{xmlMode:true,decodeEntities:true});
}
const normal=value=>String(value??'').normalize('NFC').replace(/\s+/gu,' ').trim();

function u16(b,p){if(p<0||p+2>b.length)denied();return b.readUInt16LE(p);}
function u32(b,p){if(p<0||p+4>b.length)denied();return b.readUInt32LE(p);}
function checkName(name){
  if(name.length<1||name.length>220||name.startsWith('/')||name.includes('\\')
    ||name.includes('\0')||name.includes('//')||name.includes(':')
    ||name.split('/').some(part=>part==='.'||part==='..')
    ||/%(?:00|25|2e|2f|5c)/i.test(name))denied();
}
const crcTable=Array.from({length:256},(_,index)=>{
  let x=index;
  for(let k=0;k<8;k++)x=(x&1)?0xedb88320^(x>>>1):x>>>1;
  return x>>>0;
});
function crc32(data){
  let x=0xffffffff;
  for(const byte of data)x=crcTable[(x^byte)&255]^(x>>>8);
  return (x^0xffffffff)>>>0;
}
/** Validates local and central ZIP metadata, sizes, CRC, paths and duplicates.
 * Never writes archive entries to disk. ZIP64, encryption and exotic flags fail.
 */
export function readBoundedHwpxZip(raw){
  if(!(raw instanceof Uint8Array)||raw.byteLength<22||raw.byteLength>MAX_ARCHIVE)denied();
  const b=Buffer.from(raw);
  let end=-1;
  for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--){
    if(u32(b,p)===0x06054b50&&p+22+u16(b,p+20)===b.length){end=p;break;}
  }
  if(end<0||u16(b,end+4)!==0||u16(b,end+6)!==0
    ||u16(b,end+8)!==u16(b,end+10))denied();
  const count=u16(b,end+10),tableBytes=u32(b,end+12),tableAt=u32(b,end+16);
  if(count<3||count>MAX_ENTRIES||tableAt+tableBytes>end)denied();
  const items=new Map();
  let pos=tableAt,expandedTotal=0;
  const ranges=[];
  for(let i=0;i<count;i++){
    if(u32(b,pos)!==0x02014b50)denied();
    const flags=u16(b,pos+8),method=u16(b,pos+10);
    const crc=u32(b,pos+16),packed=u32(b,pos+20),size=u32(b,pos+24);
    const nameSize=u16(b,pos+28),extra=u16(b,pos+30),comment=u16(b,pos+32);
    const disk=u16(b,pos+34),external=u32(b,pos+38),localAt=u32(b,pos+42);
    const next=pos+46+nameSize+extra+comment;
    if(next>tableAt+tableBytes||nameSize<1||disk!==0||(flags&~0x808)!==0
      ||(method!==0&&method!==8)||packed>MAX_ARCHIVE
      ||size>MAX_EXPANDED||expandedTotal+size>MAX_EXPANDED
      ||((external>>>16)&0xf000)===0xa000)denied();
    let name;
    try{name=utf8.decode(b.subarray(pos+46,pos+46+nameSize));}catch{denied();}
    checkName(name);
    if(items.has(name))denied();
    if(u32(b,localAt)!==0x04034b50||u16(b,localAt+6)!==flags
      ||u16(b,localAt+8)!==method)denied();
    const localNameLength=u16(b,localAt+26),localExtra=u16(b,localAt+28);
    const bodyAt=localAt+30+localNameLength+localExtra;
    if(bodyAt+packed>tableAt)denied();
    if(!Buffer.from(b.subarray(localAt+30,localAt+30+localNameLength))
      .equals(b.subarray(pos+46,pos+46+nameSize)))denied();
    // Flags with a data descriptor are permitted only when the central
    // directory's sizes and CRC can be independently checked.
    if(!(flags&8)&&(u32(b,localAt+14)!==crc
      ||u32(b,localAt+18)!==packed||u32(b,localAt+22)!==size))denied();
    const compressed=b.subarray(bodyAt,bodyAt+packed);
    let value;
    try{
      value=method===0?Buffer.from(compressed):
        inflateRawSync(compressed,{maxOutputLength:size+1});
    }catch{denied();}
    if(value.length!==size||crc32(value)!==crc)denied();
    ranges.push({start:localAt,end:bodyAt+packed});
    items.set(name,value);
    expandedTotal+=size;
    pos=next;
  }
  if(pos!==tableAt+tableBytes||!items.has('mimetype')
    ||!items.has('Contents/content.hpf'))denied();
  ranges.sort((a,b)=>a.start-b.start);
  if(ranges[0].start!==0||ranges.some((r,i)=>i>0&&ranges[i-1].end>r.start))denied();
  const first=b.subarray(0,30);
  if(u16(first,8)!==0||u16(first,26)!==8
    ||items.get('mimetype').toString('utf8')!=='application/hwp+zip')denied();
  return items;
}
/** Extract only hp:t within hp:p, in reviewed manifest/spine order.
 * Nested table cells remain separate paragraphs; control objects are omitted,
 * explicitly requiring human verification of meaning and order.
 */
export function parseApprovedHwpxDraft({content,sourceId,revisionId}){
  if(!ref.test(sourceId)||!ref.test(revisionId))denied();
  const zip=readBoundedHwpxZip(content);
  const $manifest=xml(zip.get('Contents/content.hpf'));
  const items=new Map();
  const manifestRows=$manifest('*').toArray().filter(e=>local(e.name)==='item');
  for(const element of manifestRows){
    const node=$manifest(element),id=node.attr('id'),href=node.attr('href');
    if(!href||!id||items.has(id))denied();
    const name=href.startsWith('Contents/')?href:'Contents/'+href;
    checkName(name);
    if(/^Contents\/section\d{1,3}\.xml$/.test(name)){
      if(!zip.has(name))denied();
      items.set(id,name);
    }
  }
  const archiveSections=[...zip.keys()].filter(s=>/^Contents\/section\d{1,3}\.xml$/.test(s));
  if(!items.size||items.size>16||archiveSections.length!==items.size
    ||new Set(items.values()).size!==items.size)denied();
  const spine=$manifest('*').toArray().filter(e=>local(e.name)==='itemref');
  let ordered;
  if(spine.length){
    ordered=spine.map(e=>items.get($manifest(e).attr('idref')));
    if(ordered.length!==items.size||ordered.some(x=>!x)
      ||new Set(ordered).size!==items.size)denied();
  }else{
    ordered=[...items.values()].sort((a,b)=>
      Number(a.match(/section(\d+)/)[1])-Number(b.match(/section(\d+)/)[1]));
  }
  const paragraphs=[];
  for(let section=0;section<ordered.length;section++){
    const $=xml(zip.get(ordered[section]));
    const nodes=$('*').toArray().filter(e=>local(e.name)==='p');
    if(!nodes.length)denied();
    for(const node of nodes){
      // Walk nested markup but never absorb a nested paragraph (e.g., table
      // cells) into an enclosing paragraph.
      const parts=[];
      const descend=n=>{
        if(n!==node&&local(n.name)==='p')return;
        if(local(n.name)==='t'){parts.push($(n).text());return;}
        for(const child of n.children??[])if(child.type==='tag')descend(child);
      };
      descend(node);
      const text=normal(parts.join(''));
      if(!text)continue;
      if(text.length>MAX_LINE||paragraphs.length>=MAX_PARAGRAPHS)denied();
      paragraphs.push(Object.freeze({id:'s'+section+'p'+(paragraphs.length+1),text}));
    }
  }
  if(!paragraphs.length)denied();
  return Object.freeze({state:'NEEDS_REVIEW',format:'HWPX',
    sourceId,revisionId,originalSha256:hash(content),
    completeness:'TEXT_ONLY_LAYOUT_AND_NON_TEXT_NEED_REVIEW',
    paragraphs:Object.freeze(paragraphs)});
}
export function createApprovedHwpxExtractor({sourceId,revisionId}){
  if(!ref.test(sourceId)||!ref.test(revisionId))denied();
  return {async extract({content,contentType}){
    if(!/^(?:application\/hwp\+zip|application\/vnd\.hancom\.hwpx)(?:;|$)/i.test(contentType))denied();
    return parseApprovedHwpxDraft({content,sourceId,revisionId}).paragraphs;
  }};
}
/** Parses HWP 5 FileHeader+BodyText streams extracted by an independently
 * audited OLE/CFB reader. NOT a complete .hwp-byte extractor yet. */
export function parseLegacyHwpSectionDraft({fileHeader,sectionStreams,sourceId,revisionId}){
  if(!(fileHeader instanceof Uint8Array)||fileHeader.length<256
    ||!Array.isArray(sectionStreams)||!sectionStreams.length||sectionStreams.length>16
    ||!ref.test(sourceId)||!ref.test(revisionId))denied();
  const header=Buffer.from(fileHeader);
  if(header.subarray(0,17).toString('ascii')!=='HWP Document File')denied();
  const flags=u32(header,36);
  if(flags&0x6)denied(); // encrypted or distribution-only: never bypass
  const compressed=(flags&1)!==0;
  const paragraphs=[];
  for(let section=0;section<sectionStreams.length;section++){
    const stream=sectionStreams[section];
    if(!(stream instanceof Uint8Array)||!stream.length||stream.length>MAX_ARCHIVE)denied();
    let bytes;
    try{bytes=compressed?inflateRawSync(stream,{maxOutputLength:4*1024*1024}):Buffer.from(stream);}
    catch{denied();}
    let pos=0,sequence=0,current=null;
    while(pos<bytes.length){
      const header=u32(bytes,pos);pos+=4;
      const tag=header&1023,level=(header>>>10)&1023;
      let size=header>>>20;
      if(size===4095){size=u32(bytes,pos);pos+=4;}
      if(size>bytes.length-pos||size>MAX_LINE*4||level>64)denied();
      const data=bytes.subarray(pos,pos+size);pos+=size;
      if(tag===0x42){ // PARA_HEADER
        // An unfinished nonempty paragraph must not be silently replaced by
        // another header and reported as complete source text.
        if(size<4||(current&&current.expected>0))denied();
        current={text:'',expected:u32(data,0)&0x7fffffff};
        if(current.expected>MAX_LINE+1)denied();
        sequence++;
      }else if(tag===0x43){ // PARA_TEXT
        if(!current||size%2)denied();
        let raw;
        try{raw=utf16.decode(data);}catch{denied();}
        // A truncated/replaced text record must not silently contradict the
        // paragraph-header character count; CR is still present at this point.
        if(raw.length!==current.expected)denied();
        // Extended inline controls, object anchors and unknown controls
        // need a richer audited parser; never silently call them source text.
        if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(raw))denied();
        current.text+=raw.replace(/\r/g,'');
        if(current.text.length>MAX_LINE)denied();
        const value=normal(current.text);
        if(value){
          if(paragraphs.length>=MAX_PARAGRAPHS)denied();
          paragraphs.push(Object.freeze({id:'s'+section+'p'+sequence,text:value}));
        }
        current=null;
      }
    }
    if(!sequence||(current&&current.expected>0))denied();
  }
  if(!paragraphs.length)denied();
  return Object.freeze({state:'NEEDS_REVIEW',format:'HWP5_SECTION_STREAMS',
    sourceId,revisionId,completeness:'CFB_BINDING_AND_LAYOUT_NEED_REVIEW',
    paragraphs:Object.freeze(paragraphs)});
}

/** Parses complete in-memory .hwp (OLE2 CFB) bytes without filesystem/network
 * access. Only approved FileHeader + sequential BodyText sections are read.
 * This is not a completeness certificate: controls/tables/objects and all
 * extracted dates still require independent source-rights + human review.
 */
export function parseApprovedLegacyHwpDraft({content,sourceId,revisionId}){
  if(!ref.test(sourceId)||!ref.test(revisionId)
    ||!(content instanceof Uint8Array))denied();
  const {fileHeader,sectionStreams}=readBoundedHwpCfbStreams(content);
  const result=parseLegacyHwpSectionDraft({
    fileHeader,sectionStreams,sourceId,revisionId,
  });
  return Object.freeze({...result,format:'HWP5_CFB',
    originalSha256:hash(content),
    completeness:'TEXT_RECORDS_ONLY_CONTROLS_AND_LAYOUT_NEED_REVIEW'});
}
export function createApprovedLegacyHwpExtractor({sourceId,revisionId}){
  if(!ref.test(sourceId)||!ref.test(revisionId))denied();
  return {async extract({content,contentType}){
    if(!/^(?:application\/x-hwp|application\/vnd\.hancom\.hwp|application\/haansofthwp)(?:;|$)/i.test(contentType))denied();
    return parseApprovedLegacyHwpDraft({content,sourceId,revisionId}).paragraphs;
  }};
}
