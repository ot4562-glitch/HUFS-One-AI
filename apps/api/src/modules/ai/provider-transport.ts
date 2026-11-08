import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {isPublicIngestionIp} from '../opportunities/approved-egress.js';
import type {ProviderPost} from './provider-runtime.js';

function denied():Error{return new Error('Provider transport unavailable');}
export interface NodeClovaOptions {
  /** Independently approved exact General OCR API Gateway URL. Never a browser input. */
  ocrEndpoint?:string;
  secret:(kind:'OCR'|'STUDIO')=>Promise<string>;
  resolveAddresses?:(hostname:string)=>Promise<readonly string[]>;
  /** Test seam only; deployed service uses the built-in verified TLS implementation. */
  request?:typeof httpsRequest;
  timeoutMs?:number;
}
function ocrUrl(raw:string):URL {
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||u.port
    ||!/^[-a-z0-9]+\.apigw\.ntruss\.com$/.test(u.hostname)
    ||!/^\/custom\/v1\/[^/]+\/[^/]+\/general$/.test(u.pathname))throw denied();return u;
}
const addresses=(v:readonly string[])=>{
  if(!Array.isArray(v)||!v.length||v.length>20||v.some(ip=>!isPublicIngestionIp(ip)))throw denied();
  return [...new Set(v)].sort();
};
/** No socket, DNS or key access on construction. No proxy/cookie/redirect/ambient credentials. */
export function createNodeClovaTransport(options:NodeClovaOptions){
  const ocr=options.ocrEndpoint?ocrUrl(options.ocrEndpoint):undefined;
  const resolve=options.resolveAddresses??(async(hostname:string)=>(await lookup(hostname,{all:true,verbatim:true})).map(r=>r.address));
  const request=options.request??httpsRequest,timeout=options.timeoutMs??20000;
  if(!Number.isInteger(timeout)||timeout<1||timeout>20000)throw denied();
  return {async post(input:ProviderPost):Promise<Response>{
    try{
      if(input.signal.aborted||Buffer.byteLength(input.body)>8*1024*1024||!/^[-0-9a-f]{36}$/.test(input.requestId)
        ||!['TOKENIZE','INFER'].includes(input.stage)||!['OCR_GENERAL','HCX_007'].includes(input.operation))throw denied();
      const image=input.operation==='OCR_GENERAL';
      if(image&&(input.stage!=='INFER'||!ocr))throw denied();
      // The only text model endpoint is HCX-007; image extraction uses OCR_GENERAL.
      const model='HCX-007';
      const url=image?new URL(ocr!.href):new URL(input.stage==='TOKENIZE'?`https://clovastudio.stream.ntruss.com/v3/api-tools/chat-tokenize/${model}`
        :`https://clovastudio.stream.ntruss.com/v3/chat-completions/${model}`);
      const secret=await options.secret(image?'OCR':'STUDIO');
      if(typeof secret!=='string'||!/^[\x21-\x7e]{1,1024}$/.test(secret)||input.signal.aborted)throw denied();
      const first=addresses(await resolve(url.hostname));if(input.signal.aborted)throw denied();
      const second=addresses(await resolve(url.hostname));
      if(first.length!==second.length||first.some((ip,i)=>ip!==second[i])||input.signal.aborted)throw denied();
      await input.beforeSend();if(input.signal.aborted)throw denied();
      // No awaits between final authority check and request creation/body write.
      return await new Promise<Response>((done,fail)=>{
        let settled=false,req:ReturnType<typeof httpsRequest>|undefined,response:import('node:http').IncomingMessage|undefined;
        const cleanup=()=>{clearTimeout(timer);input.signal.removeEventListener('abort',abort);};
        const stop=()=>{if(settled)return;settled=true;cleanup();response?.destroy();req?.destroy();fail(denied());};
        const abort=()=>stop(),timer=setTimeout(stop,timeout);input.signal.addEventListener('abort',abort,{once:true});
        const headers:Record<string,string>={host:url.hostname,'content-type':'application/json',accept:'application/json',
          'accept-encoding':'identity','content-length':String(Buffer.byteLength(input.body)),
          ...(image?{'x-ocr-secret':secret}:{authorization:'Bearer '+secret,'x-ncp-clovastudio-request-id':input.requestId})};
        try{
          req=request({hostname:first[0]!,servername:url.hostname,port:443,path:url.pathname,method:'POST',headers,
            rejectUnauthorized:true,checkServerIdentity:(_host,cert)=>checkServerIdentity(url.hostname,cert),agent:false,maxHeaderSize:16*1024},res=>{
            response=res;if(settled){res.destroy();return;}
            const status=res.statusCode,length=res.headers['content-length'],encoding=res.headers['content-encoding'];
            if(!status||(status>=300&&status<400)||(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>2*1024*1024))
              ||(encoding!==undefined&&encoding!=='identity')){stop();return;}
            const chunks:Buffer[]=[];let size=0;
            res.on('error',stop);res.on('aborted',stop);
            res.on('data',(chunk:Buffer)=>{if(settled)return;size+=chunk.byteLength;if(size>2*1024*1024){stop();return;}chunks.push(Buffer.from(chunk));});
            res.on('end',()=>{
              if(settled)return;
              try{
                if(!res.complete||input.signal.aborted)throw denied();
                const safe=new Headers();for(const key of ['content-type','content-length']){const v=res.headers[key];if(typeof v==='string')safe.set(key,v);}
                const result=new Response([204,304].includes(status)?null:Buffer.concat(chunks),{status,headers:safe});
                settled=true;cleanup();done(result);
              }catch{stop();}
            });
          });
          req.on('error',stop);if(input.signal.aborted){stop();return;}req.end(input.body);
        }catch{stop();}
      });
    }catch{throw denied();}
  }};
}
