import {BlockList,isIP} from 'node:net';

// Compare address bits, not spellings: 2001:0db8:: and 2001:db8:: are
// the same subnet. These local lists perform no DNS or network operations.
const globalV6=new BlockList(),specialV6=new BlockList();
globalV6.addSubnet('2000::',3,'ipv6');
for(const [network,prefix] of [
  ['2001::',32],      // Teredo
  ['2001:2::',48],    // Benchmarking (RFC 5180)
  ['2001:db8::',32],  // Documentation (RFC 3849)
  ['2002::',16],      // 6to4 tunnel
  ['3fff::',20],      // Documentation (RFC 9637)
] as const)specialV6.addSubnet(network,prefix,'ipv6');

/**
 * Safe default: IPv4 special-purpose ranges are denied; IPv6 is allowed only
 * for ordinary 2000::/3 unicast (not mapped, ULA, link-local or documentation).
 * A deployment firewall MUST enforce the same egress restrictions independently.
 */
export function isPublicIngestionIp(address:string):boolean{
  const family=isIP(address);
  if(family===4){
    const [a,b,c]=address.split('.').map(Number);
    if(a===undefined||b===undefined||c===undefined)return false;
    if(a===0||a===10||a===127||a>=224)return false;
    if(a===100&&b>=64&&b<=127)return false; // carrier-grade NAT
    if(a===169&&b===254)return false;
    if(a===172&&b>=16&&b<=31)return false;
    if(a===192&&(b===168||(b===0&&(c===0||c===2))||(b===88&&c===99)))return false;
    if(a===198&&(b===18||b===19||(b===51&&c===100)))return false;
    if(a===203&&b===0&&c===113)return false;
    return true;
  }
  if(family===6){
    if(address.includes('%'))return false;
    return globalV6.check(address,'ipv6')&&!specialV6.check(address,'ipv6');
  }
  return false;
}
export interface ApprovedPinnedEgress {
  /** DNS resolver returns ALL final A/AAAA answers, including CNAME targets. */
  resolveAddresses(hostname:string):Promise<readonly string[]>;
  /**
   * Must connect its socket to the specific verified IP, never look up
   * hostname again; TLS SNI and certificate validation use serverName.
   * Redirect following and ambient credentials are prohibited.
   */
  requestPinned(input:{
    url:URL;address:string;serverName:string;init:RequestInit;
  }):Promise<Response>;
}
export interface ApprovedPinnedEgressPolicy {
  /** One reviewed HTTPS URL, not a wildcard origin or arbitrary user URL. */
  canonicalUrl:string;
  /** Trusted server callback for the current request's purpose-scoped rights.
   * Runs after DNS and immediately before pinned HTTP; never browser input. */
  beforeSend?:()=>Promise<void>;
}
function deny():never{throw new Error('Approved egress policy denied request');}
function canonicalUrl(raw:string):URL {
  let url:URL;
  try{url=new URL(raw);}catch{return deny();}
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port
    ||!url.hostname||url.hostname==='localhost'
    ||url.hostname.endsWith('.localhost')||url.hostname.endsWith('.local')
    ||isIP(url.hostname)!==0||url.hostname.includes(':'))
    deny();
  return url;
}
function checkedAnswers(addresses:readonly string[]):string[]{
  if(!Array.isArray(addresses)||!addresses.length||addresses.length>20
    ||addresses.some(ip=>!isPublicIngestionIp(ip)))deny();
  return [...new Set(addresses)].sort();
}
/**
 * Network-free factory. Every call performs two DNS checks and pins to the
 * exact same public IP set before delegating to an injected, reviewed client.
 * A mismatch fails closed; no HTTP, TLS or DNS activity occurs by default.
 */
export function createApprovedPinnedTransport(
  policy:ApprovedPinnedEgressPolicy,
  egress:ApprovedPinnedEgress,
):typeof fetch {
  const reviewed=canonicalUrl(policy.canonicalUrl),beforeSend=policy.beforeSend;
  if(beforeSend!==undefined&&typeof beforeSend!=='function')deny();
  return (async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(!(input instanceof URL)||input.href!==reviewed.href
      ||init?.method!=='GET'||init.redirect!=='error'
      ||init.credentials!=='omit'||init.body!==undefined)deny();
    const headers=new Headers(init.headers);
    for(const forbidden of [
      'cookie','authorization','proxy-authorization','host',
      'x-forwarded-host','x-forwarded-for','x-real-ip',
    ])if(headers.has(forbidden))deny();
    const signal=init.signal;
    const bounded=async<T>(run:()=>Promise<T>,discard?:(value:T)=>void):Promise<T>=>{
      if(signal?.aborted)deny();
      let abort!:()=>void;
      const stop=new Promise<never>((_resolve,reject)=>{
        abort=()=>reject(new Error('Approved egress policy denied request'));
        signal?.addEventListener('abort',abort,{once:true});
      });
      const operation=Promise.resolve().then(()=>{
        if(signal?.aborted)deny();
        return run();
      });
      try{
        const value=await Promise.race([operation,stop]);
        if(signal?.aborted)deny();
        return value;
      }catch(error){
        // A cancelled wait does not guarantee the injected transport stopped.
        // Observe late errors and dispose of any response still owned by it.
        if(discard)void operation.then(discard).catch(()=>{});
        throw error;
      }finally{signal?.removeEventListener('abort',abort);}
    };
    const first=checkedAnswers(await bounded(()=>egress.resolveAddresses(reviewed.hostname)));
    const second=checkedAnswers(await bounded(()=>egress.resolveAddresses(reviewed.hostname)));
    if(first.length!==second.length||first.some((ip,i)=>ip!==second[i]))deny();
    if(beforeSend)await bounded(beforeSend);
    const response=await bounded(()=>egress.requestPinned({
      url:reviewed,address:first[0]!,serverName:reviewed.hostname,init,
    }),discardUnreadSourceBody);
    if(signal?.aborted||response.redirected
      ||(response.status>=300&&response.status<400&&response.status!==304)
      ||(response.url&&response.url!==reviewed.href)){
      discardUnreadSourceBody(response);deny();
    }
    return response;
  }) as typeof fetch;
}
import {discardUnreadSourceBody} from './source-response-body.js';
