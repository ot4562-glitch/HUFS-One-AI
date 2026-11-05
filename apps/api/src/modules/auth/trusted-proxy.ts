import {BlockList,isIP} from 'node:net';

/** Explicit server configuration only. No hostnames, CIDRs, hop counts, or
 * blanket trust: a reviewed ingress must overwrite X-Forwarded-For with its
 * single observed peer address and prevent direct public access to the API. */
export function createTrustedProxyPolicy(addresses:readonly string[]|undefined){
  const trusted=new BlockList(),unspecified=new BlockList();
  unspecified.addAddress('0.0.0.0','ipv4');
  unspecified.addAddress('::','ipv6');
  unspecified.addSubnet('224.0.0.0',4,'ipv4');
  unspecified.addSubnet('ff00::',8,'ipv6');
  const family=(value:string)=>isIP(value)===4?'ipv4' as const:'ipv6' as const;
  if(addresses!==undefined){
    if(!Array.isArray(addresses)||addresses.length<1||addresses.length>16)
      throw new TypeError('Expected one to sixteen explicit trusted proxy IP addresses');
    for(const address of addresses){
      if(typeof address!=='string'||address.includes('%')||!isIP(address)
        ||unspecified.check(address,family(address)))
        throw new TypeError('Trusted proxy must be an explicit unicast IP address');
      trusted.addAddress(address,family(address));
    }
  }
  const matches=(address:string|undefined)=>typeof address==='string'&&!address.includes('%')
    &&isIP(address)!==0&&trusted.check(address,family(address));
  return {
    /** Fastify/proxy-addr may ask about additional hops. Never trust those. */
    trust:addresses===undefined?false as const:(address:string,hop:number)=>hop===0&&matches(address),
    accepts(remoteAddress:string|undefined,forwarded:unknown,rawHeaders:readonly string[]):boolean{
      if(!matches(remoteAddress))return true; // Direct callers cannot grant header authority.
      if(typeof forwarded!=='string'||forwarded.includes('%')||!isIP(forwarded))return false;
      let count=0;
      for(let i=0;i<rawHeaders.length;i+=2)
        if(rawHeaders[i]?.toLowerCase()==='x-forwarded-for')count++;
      return count===1; // Reject duplicate fields as well as comma-separated chains.
    },
  };
}
