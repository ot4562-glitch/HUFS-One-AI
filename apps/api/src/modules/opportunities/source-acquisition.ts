import {discardUnreadSourceBody,readApprovedSourceBody} from './source-response-body.js';

/** Trusted server plugin. The only network capability performs the caller's
 * already approved exact GET; it accepts no URL, headers or credentials. */
export interface ApprovedSourceAcquisition {
  acquire(input:{canonicalUrl:string;request:()=>Promise<Response>}):Promise<void>;
}
function failed():never{throw new Error('Approved source acquisition failed');}

export async function acquireApprovedSourceResponse(input:{
  canonicalUrl:string;request:(signal?:AbortSignal)=>Promise<Response>;acquisition?:ApprovedSourceAcquisition;
}):Promise<Response>{
  if(!input.acquisition)return input.request();
  const stop=new AbortController();
  let sealed=false,attempts=0,retained:Response|undefined;
  const request=():Promise<Response>=>{
    const operation=(async()=>{
      if(sealed||++attempts!==1)failed();
      const original=await input.request(stop.signal);
      try{
        if(sealed||original.redirected||(original.url&&original.url!==input.canonicalUrl)
          ||!([200,304] as number[]).includes(original.status))failed();
        const bytes=original.status===304?null:await readApprovedSourceBody(original);
        if(sealed)failed();
        // Snapshot raw bytes before any crawler/parser reads or modifies its
        // separate response. Rendering/normalization can never replace origin SHA.
        const init={status:original.status,statusText:original.statusText,headers:original.headers};
        retained=new Response(bytes===null?null:new Uint8Array(bytes).buffer,init);
        return new Response(bytes===null?null:new Uint8Array(bytes).buffer,init);
      }finally{discardUnreadSourceBody(original);}
    })();
    // Observe errors from a broken plugin that starts but does not await a call.
    // The caller still receives the original rejecting promise.
    void operation.catch(()=>{});
    return operation;
  };
  try{
    await input.acquisition.acquire({canonicalUrl:input.canonicalUrl,request});
    if(attempts!==1||!retained)failed();
    return retained;
  }catch{
    if(retained)discardUnreadSourceBody(retained);
    return failed();
  }finally{sealed=true;stop.abort();}
}
