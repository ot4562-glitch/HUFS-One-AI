/**
 * Bounded in-memory OLE2 Compound File Binary (CFB) reader for HWP 5.
 * Reads ONLY the top-level FileHeader and BodyText/Section0..15 streams.
 * No arbitrary extraction, filesystem access, code execution or decryption.
 */
const SIGNATURE=Buffer.from('d0cf11e0a1b11ae1','hex');
const FREE=0xffffffff, END=0xfffffffe, FATSECT=0xfffffffd, DIFSECT=0xfffffffc;
const MAX_BYTES=16*1024*1024,MAX_FAT_SECTORS=128,MAX_DIR_ENTRIES=512;
const decode=new TextDecoder('utf-16le',{fatal:true});
const rejected=()=>{throw new Error('KOREAN_DOCUMENT_REQUIRES_REVIEW');};
const read16=(b,at)=>{if(at<0||at+2>b.length)rejected();return b.readUInt16LE(at);};
const read32=(b,at)=>{if(at<0||at+4>b.length)rejected();return b.readUInt32LE(at);};

/** Refuse ambiguous CFB cross-links, unexpected sector chains and MiniFAT
 * aliases before passing any bytes to the existing HWP record decoder.
 */
export function readBoundedHwpCfbStreams(content){
  if(!(content instanceof Uint8Array)||content.length<1536
    ||content.length>MAX_BYTES)rejected();
  const b=Buffer.from(content);
  if(!b.subarray(0,8).equals(SIGNATURE)||read16(b,28)!==0xfffe
    ||read16(b,32)!==6||read16(b,34)!==0)rejected();
  const major=read16(b,26),shift=read16(b,30);
  if((major!==3||shift!==9)&&(major!==4||shift!==12))rejected();
  const sectorSize=2**shift,miniSize=64;
  if(b.length%sectorSize||read16(b,34)!==0||read32(b,56)!==4096
    ||major===3&&read32(b,40)!==0)rejected();
  const sectors=b.length/sectorSize-1;
  if(sectors<3||sectors>MAX_BYTES/512)rejected();
  const sector=id=>{
    if(!Number.isInteger(id)||id<0||id>=sectors)rejected();
    return b.subarray((id+1)*sectorSize,(id+2)*sectorSize);
  };
  const fatCount=read32(b,44),directoryStart=read32(b,48);
  const miniStart=read32(b,60),miniCount=read32(b,64);
  const difatStart=read32(b,68),difatCount=read32(b,72);
  if(fatCount<1||fatCount>MAX_FAT_SECTORS
    ||miniCount>32||difatCount>16)rejected();
  const difatIds=[],fatIds=[];
  for(let i=0;i<109;i++){
    const id=read32(b,76+i*4);
    if(id!==FREE)fatIds.push(id);
  }
  const visitedDifat=new Set();
  let nextDifat=difatStart;
  for(let i=0;i<difatCount;i++){
    if(nextDifat===FREE||nextDifat===END||visitedDifat.has(nextDifat))rejected();
    visitedDifat.add(nextDifat);difatIds.push(nextDifat);
    const data=sector(nextDifat);
    for(let j=0;j<sectorSize/4-1;j++){
      const id=read32(data,j*4);
      if(id!==FREE)fatIds.push(id);
    }
    nextDifat=read32(data,sectorSize-4);
  }
  if((difatCount===0&&difatStart!==END)
    ||(difatCount>0&&nextDifat!==END)||fatIds.length!==fatCount
    ||new Set(fatIds).size!==fatIds.length
    ||fatIds.some(id=>visitedDifat.has(id)))rejected();
  const fat=[];
  for(const id of fatIds){
    const data=sector(id);
    for(let i=0;i<sectorSize;i+=4)fat.push(read32(data,i));
  }
  if(fat.length<sectors)rejected();
  for(const id of fatIds)if(fat[id]!==FATSECT)rejected();
  for(const id of difatIds)if(fat[id]!==DIFSECT)rejected();
  const used=new Set([...fatIds,...difatIds]);
  const chain=(first,limit,expected)=>{
    if(limit<1||limit>sectors)rejected();
    const ids=[],inChain=new Set();
    let id=first;
    while(id!==END){
      if(id===FREE||id>=sectors||inChain.has(id)||used.has(id)
        ||ids.length>=limit)rejected();
      inChain.add(id);ids.push(id);
      id=fat[id];
      if(id===undefined||id===FATSECT||id===DIFSECT)rejected();
    }
    if(!ids.length||(expected!==undefined&&ids.length!==expected))rejected();
    for(const sectorId of ids)used.add(sectorId);
    return ids;
  };
  const readRegular=(first,byteCount,exact=false)=>{
    if(!Number.isSafeInteger(byteCount)||byteCount<1||byteCount>MAX_BYTES)rejected();
    const count=Math.ceil(byteCount/sectorSize);
    const ids=chain(first,exact?count:Math.min(sectors,MAX_DIR_ENTRIES/4),exact?count:undefined);
    return Buffer.concat(ids.map(id=>sector(id)),ids.length*sectorSize).subarray(0,byteCount);
  };
  // A directory chain does not carry a byte length: walk FAT until ENDOFCHAIN.
  const dirIds=chain(directoryStart,Math.min(sectors,Math.ceil(MAX_DIR_ENTRIES*128/sectorSize)));
  const directories=Buffer.concat(dirIds.map(id=>sector(id)));
  if(directories.length%128||directories.length>MAX_DIR_ENTRIES*128)rejected();
  const entries=[];
  for(let at=0;at<directories.length;at+=128){
    const type=directories[at+66],nameBytes=read16(directories,at+64);
    if(![0,1,2,5].includes(type))rejected();
    if(type===0){entries.push({type,name:'',left:FREE,right:FREE,child:FREE});continue;}
    if(nameBytes<4||nameBytes>64||nameBytes%2||directories[at+nameBytes-2]!==0
      ||directories[at+nameBytes-1]!==0)rejected();
    let name;
    try{name=decode.decode(directories.subarray(at,at+nameBytes-2));}catch{rejected();}
    if(!name||/[\\/\u0000-\u001f]/u.test(name))rejected();
    const hi=read32(directories,at+124),lo=read32(directories,at+120);
    const size=hi*0x100000000+lo;
    if((major===3&&hi!==0)||!Number.isSafeInteger(size)||size>MAX_BYTES)rejected();
    entries.push({type,name,left:read32(directories,at+68),
      right:read32(directories,at+72),child:read32(directories,at+76),
      start:read32(directories,at+116),size});
  }
  const root=entries[0];
  if(!root||root.type!==5||root.name!=='Root Entry')rejected();
  // Traverse the actual storage/sibling tree; directory order alone is not
  // authority that a stream is within BodyText.
  const visited=new Set([0]);
  const childrenOf=parent=>{
    const matches=[],stack=[entries[parent].child];
    while(stack.length){
      const id=stack.pop();
      if(id===FREE)continue;
      if(!Number.isSafeInteger(id)||id<1||id>=entries.length||visited.has(id))rejected();
      const e=entries[id];
      if(!e||![1,2].includes(e.type))rejected();
      visited.add(id);matches.push(e);
      stack.push(e.left,e.right);
    }
    if(new Set(matches.map(e=>e.name.toLowerCase())).size!==matches.length)rejected();
    return matches;
  };
  const toplevel=childrenOf(0);
  const file=toplevel.find(e=>e.name==='FileHeader'&&e.type===2);
  const body=toplevel.find(e=>e.name==='BodyText'&&e.type===1);
  if(!file||!body||file.size!==256)rejected();
  const bodyId=entries.indexOf(body);
  const parts=childrenOf(bodyId);
  const sections=parts.filter(e=>e.type===2&&/^Section(?:0|[1-9]\d?)$/.test(e.name));
  if(!sections.length||sections.length>16||sections.length!==parts.length)rejected();
  sections.sort((x,y)=>
    Number(x.name.slice(7))-Number(y.name.slice(7)));
  for(let i=0;i<sections.length;i++)if(sections[i].name!=='Section'+i)rejected();
  // Other top-level storages (DocInfo/BinData) need not be materialized.
  // But every required section must be an actual child of BodyText.
  if(miniCount===0&&miniStart!==END
    ||miniCount>0&&miniStart===END)rejected();
  const minifatBytes=miniCount?
    readRegular(miniStart,miniCount*sectorSize,true):Buffer.alloc(0);
  const miniFAT=[];
  for(let i=0;i<minifatBytes.length;i+=4)miniFAT.push(read32(minifatBytes,i));
  if(root.size===0||root.size>MAX_BYTES)rejected();
  // Root mini-stream uses ordinary FAT sectors regardless of its byte size.
  const miniStream=readRegular(root.start,root.size,true),usedMini=new Set();
  const readStream=e=>{
    if(e.size<1||e.size>MAX_BYTES)rejected();
    if(e.size>=4096)return readRegular(e.start,e.size,true);
    if(!miniCount)rejected();
    const count=Math.ceil(e.size/miniSize),ids=[],localSeen=new Set();
    let id=e.start;
    for(let i=0;i<count;i++){
      if(!Number.isInteger(id)||id===END||id===FREE
        ||id>=miniFAT.length||localSeen.has(id)||usedMini.has(id)
        ||(id+1)*miniSize>miniStream.length)rejected();
      localSeen.add(id);ids.push(id);
      id=miniFAT[id];
    }
    if(id!==END)rejected();
    for(const x of ids)usedMini.add(x);
    return Buffer.concat(ids.map(x=>miniStream.subarray(x*miniSize,(x+1)*miniSize)))
      .subarray(0,e.size);
  };
  // Source document version, flags and all HWP controls are validated by the
  // downstream section parser. A CFB stream is not yet verified source text.
  return {fileHeader:readStream(file),sectionStreams:sections.map(readStream)};
}
