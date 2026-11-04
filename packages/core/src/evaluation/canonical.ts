import {createHash} from 'node:crypto';

/** Stable JSON for signed synthetic review data. No undefined, exotic objects,
 * NaN, implicit toJSON or secret-bearing runtime objects are serialized. */
export function canonicalJson(value:unknown):string{
  const seen=new Set<object>();
  function normalize(v:unknown):unknown{
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('Nonfinite canonical value');return Object.is(v,-0)?0:v;}
    if(typeof v!=='object'||seen.has(v))throw new Error('Invalid canonical value');
    if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)
      throw new Error('Nonplain canonical value');
    seen.add(v);
    const result=Array.isArray(v)?v.map(normalize):Object.fromEntries(Object.keys(v).sort().map(key=>[key,normalize((v as Record<string,unknown>)[key])]));
    seen.delete(v);return result;
  }
  return JSON.stringify(normalize(value));
}
export const hashBytes=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
export const hashCanonical=(value:unknown)=>hashBytes(canonicalJson(value));
export const ZERO_HEAD='0'.repeat(64);
