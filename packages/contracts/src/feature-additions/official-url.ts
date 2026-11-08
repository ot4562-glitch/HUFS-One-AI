/** Official outbound destinations are HTTPS public origins, never script/internal URLs. */
import {z} from 'zod';

/** Input validation is separate from the server's current approved-host allowlist. */
export const OfficialHttpsUrlSchema=z.url().refine(value=>{
  try {
    const url=new URL(value);
    if(url.protocol!=='https:' || !!url.username || !!url.password) return false;
    const host=url.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')
      ||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')
      ||host.startsWith('[')||!host.includes('.')) return false;
    // Reject literal IPv4 and IPv6 addresses (including loopback/private/metadata).
    if(/^\d+(?:\.\d+){3}$/.test(host)) return false;
    if(url.port && url.port!=='443') return false;
    return true;
  } catch { return false; }
},'official link must be a public HTTPS hostname without credentials');
