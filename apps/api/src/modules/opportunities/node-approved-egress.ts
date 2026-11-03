import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {isIP} from 'node:net';
import {isPublicIngestionIp} from './approved-egress.js';
import type {ApprovedPinnedEgress} from './approved-egress.js';

const MAX_BYTES=256*1024;
function failure():Error{return new Error('Approved source transport unavailable');}
/** Real Node network implementation for createApprovedPinnedTransport.
 * Construction performs no IO and does not start a crawler. The outer transport
 * still enforces an operator-approved exact URL and two consistent DNS answers;
 * this socket connects to that verified IP, with the original TLS name/Host.
 * No proxy, global agent, cookies, auth, redirects or insecure TLS fallback.
 */
export function createNodeApprovedPinnedEgress(options:{timeoutMs?:number}={}):ApprovedPinnedEgress{
  const timeoutMs=options.timeoutMs??5000;
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30_000)throw failure();
  return {
    resolveAddresses:async hostname=>{
      if(!hostname||isIP(hostname)||hostname==='localhost'||hostname.endsWith('.local')
        ||hostname.endsWith('.localhost')||/[\s:/@]/.test(hostname))throw failure();
      try{
        const answers=await lookup(hostname,{all:true,verbatim:true});
        if(!answers.length||answers.length>20||answers.some(x=>!isPublicIngestionIp(x.address)))throw failure();
        return answers.map(x=>x.address);
      }catch{throw failure();}
    },
    requestPinned:async input=>{
      const {url,address,serverName,init}=input;
      if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash
        ||url.hostname!==serverName||isIP(serverName)!==0||!isPublicIngestionIp(address)
        ||init.method!=='GET'||init.redirect!=='error'||init.credentials!=='omit'
        ||init.body!==undefined||init.signal?.aborted)throw failure();
      const safeHeaders:Record<string,string>={host:serverName};
      const headers=new Headers(init.headers);
      headers.forEach((value,key)=>{
        if(!['accept','if-none-match','if-modified-since'].includes(key)
          ||value.length>512||/[^\x20-\x7e]/.test(value))throw failure();
        safeHeaders[key]=value;
      });
      return new Promise<Response>((resolve,reject)=>{
        let settled=false;
        let req:ReturnType<typeof request>|undefined;
        let response:import('node:http').IncomingMessage|undefined;
        const cleanup=()=>{clearTimeout(timer);init.signal?.removeEventListener('abort',abort);};
        const deny=()=>{
          if(settled)return;settled=true;cleanup();response?.destroy();req?.destroy();reject(failure());
        };
        const abort=()=>deny();
        const timer=setTimeout(deny,timeoutMs);
        init.signal?.addEventListener('abort',abort,{once:true});
        try{
          req=request({
            hostname:address,port:443,path:url.pathname+url.search,method:'GET',
            servername:serverName,rejectUnauthorized:true,
            checkServerIdentity:(_host,cert)=>checkServerIdentity(serverName,cert),
            agent:false,headers:safeHeaders,maxHeaderSize:16*1024,
          },res=>{
            response=res;
            if(settled){res.destroy();return;}
            const status=res.statusCode;
            const length=res.headers['content-length'];
            if(!status||(status>=300&&status<400&&status!==304)
              ||(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))){deny();return;}
            const chunks:Buffer[]=[];let total=0;
            res.on('error',deny);res.on('aborted',deny);
            res.on('data',(chunk:Buffer)=>{
              if(settled)return;
              total+=chunk.length;if(total>MAX_BYTES){deny();return;}chunks.push(Buffer.from(chunk));
            });
            res.on('end',()=>{
              if(settled)return;
              try{
                if(!res.complete||init.signal?.aborted)throw failure();
                const responseHeaders=new Headers();
                // Retain only representation/validator metadata; never a cookie,
                // Location, CORS/auth header, or arbitrary upstream diagnostic.
                for(const name of ['content-type','content-length','etag','last-modified']){
                  const value=res.headers[name];
                  if(typeof value==='string')responseHeaders.set(name,value);
                }
                const value=new Response(status===304||status===204?null:Buffer.concat(chunks),{
                  status,headers:responseHeaders,
                });
                settled=true;cleanup();resolve(value);
              }catch{deny();}
            });
          });
          req.on('error',deny);
          if(init.signal?.aborted){deny();return;}
          req.end();
        }catch{deny();}
      });
    },
  };
}
