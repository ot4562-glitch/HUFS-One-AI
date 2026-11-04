const MAX_BYTES=256*1024;

/** Stop an unconsumed rejected representation without waiting on an upstream
 * cancellation callback. Cleanup failure must never replace the policy error. */
export function discardUnreadSourceBody(response:Response):void{
  if(!response.body||response.bodyUsed)return;
  try{void response.body.cancel().catch(()=>{});}catch{/* Preserve the rejection. */}
}

/** Shared cap for approved memory and durable source ingestion. Fully consumed
 * successful bodies are left alone; partial/oversized/erroring reads cancel. */
export async function readApprovedSourceBody(response:Response):Promise<Uint8Array>{
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BYTES)){
    discardUnreadSourceBody(response);
    throw new Error('Unbounded source payload');
  }
  if(!response.body)throw new Error('Missing approved source body');
  const reader=response.body.getReader(),parts:Uint8Array[]=[];
  let size=0,complete=false;
  try{
    for(;;){
      const chunk=await reader.read();
      if(chunk.done){complete=true;break;}
      size+=chunk.value.byteLength;
      if(size>MAX_BYTES)throw new Error('Unbounded source payload');
      parts.push(chunk.value);
    }
  }finally{
    if(!complete)try{void reader.cancel().catch(()=>{});}catch{/* Preserve the read error. */}
    reader.releaseLock();
  }
  if(!size)throw new Error('Empty approved source');
  return Buffer.concat(parts);
}
