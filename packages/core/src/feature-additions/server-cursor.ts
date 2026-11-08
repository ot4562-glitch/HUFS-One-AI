/**
 * Server-only, HMAC-authenticated opaque cursor transport for #348.
 * This module MUST NOT be imported into browser bundles; the signing key is
 * server-injected and must never be committed, logged, or returned.
 *
 * Caller still revalidates actor, consent, source rights and catalog head
 * on every page. HMAC alone is not a current-authorization receipt.
 */
import {createHmac, timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {catalogFilterKey, type CatalogInternalCursor} from './catalog-v2.js';

const Id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const Envelope=z.strictObject({
  v:z.literal(1),
  keyId:Id,
  issuedAt:z.number().int().nonnegative(),
  expiresAt:z.number().int().positive(),
  actorId:Id,
  consentVersion:Id,
  catalogRevision:Id,
  scopeKey:z.string().min(1).max(512),
  filterKey:z.string().min(1).max(512),
  lastId:Id,
  lastSortValue:z.string().max(1024),
});
type Envelope=z.infer<typeof Envelope>;
export type CursorRequestContext={
  /** Stable, authenticated actor principal; never a client-supplied ID. */
  actorId:string;
  /** Current owner consent/grant version, not the user's raw consent content. */
  consentVersion:string;
  /** Stable hashed/opaque data scope resolved from an authorized repository. */
  scopeKey:string;
  catalogRevision:string;
  query:C.OpportunityQuery;
  /** Trusted server clock from a request, not a client clock. */
  nowMs:number;
};
export class CatalogCursorError extends Error {
  constructor(readonly code:'INVALID_CURSOR'|'EXPIRED_CURSOR'|'STALE_CURSOR'|'MISCONFIGURED_CURSOR') {
    super(code);
    this.name='CatalogCursorError';
  }
}
const checkId=(value:string):boolean=>Id.safeParse(value).success;
const checkContext=(context:CursorRequestContext):void=>{
  if(!checkId(context.actorId)||!checkId(context.consentVersion)
    ||!checkId(context.catalogRevision)
    ||!context.scopeKey||context.scopeKey.length>512
    ||!Number.isSafeInteger(context.nowMs)||context.nowMs<0
    ||!C.OpportunityQuerySchema.safeParse(context.query).success)
    throw new CatalogCursorError('MISCONFIGURED_CURSOR');
};
export type CatalogCursorSigner={
  sign:(cursor:CatalogInternalCursor,context:CursorRequestContext)=>string;
  verify:(token:string,context:CursorRequestContext)=>CatalogInternalCursor;
};
/**
 * Only a freshly injected keyset is supported. Secrets must be at least 256
 * bits, and signing is capped at 15 minutes of validity.
 */
export function createCatalogCursorSigner(config:{
  activeKeyId:string;
  keys:ReadonlyMap<string,Uint8Array>;
  ttlMs?:number;
}):CatalogCursorSigner {
  const ttlMs=config.ttlMs??15*60_000;
  if(!checkId(config.activeKeyId)
    || !Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>15*60_000
    ||!config.keys.has(config.activeKeyId)
    ||[...config.keys].some(([id,key])=>!checkId(id)||key.byteLength<32))
    throw new CatalogCursorError('MISCONFIGURED_CURSOR');
  const keys=new Map<string,Buffer>();
  for(const [id,key] of config.keys) keys.set(id,Buffer.from(key));
  const signature=(key:Buffer,data:string):Buffer=>
    createHmac('sha256',key).update(data,'ascii').digest();
  const build=(value:Envelope):string=>Buffer.from(JSON.stringify(value),'utf8').toString('base64url');
  const sign=(cursor:CatalogInternalCursor,context:CursorRequestContext):string=>{
    checkContext(context);
    const filterKey=catalogFilterKey(context.query);
    if(cursor.scopeKey!==context.scopeKey||cursor.catalogRevision!==context.catalogRevision
      ||cursor.filterKey!==filterKey
      ||!checkId(cursor.lastId)||cursor.lastSortValue.length>1024)
      throw new CatalogCursorError('STALE_CURSOR');
    const payload:Envelope={
      v:1,keyId:config.activeKeyId,issuedAt:context.nowMs,
      expiresAt:context.nowMs+ttlMs,
      actorId:context.actorId,consentVersion:context.consentVersion,
      catalogRevision:context.catalogRevision,scopeKey:context.scopeKey,
      filterKey,lastId:cursor.lastId,lastSortValue:cursor.lastSortValue,
    };
    const encoded=build(payload);
    const mac=signature(keys.get(config.activeKeyId)!,encoded).toString('base64url');
    const output=encoded+'.'+mac;
    if(output.length>2048) throw new CatalogCursorError('MISCONFIGURED_CURSOR');
    return output;
  };
  const verify=(token:string,context:CursorRequestContext):CatalogInternalCursor=>{
    checkContext(context);
    if(typeof token!=='string'||token.length<16||token.length>2048
      ||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
      throw new CatalogCursorError('INVALID_CURSOR');
    const [encoded,mac]=token.split('.',2) as [string,string];
    let untrusted:unknown;
    try {
      untrusted=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
    }catch{throw new CatalogCursorError('INVALID_CURSOR');}
    const result=Envelope.safeParse(untrusted);
    if(!result.success) throw new CatalogCursorError('INVALID_CURSOR');
    const payload=result.data;
    const key=keys.get(payload.keyId);
    if(!key) throw new CatalogCursorError('INVALID_CURSOR');
    const expected=signature(key,encoded);
    const supplied=Buffer.from(mac,'base64url');
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))
      throw new CatalogCursorError('INVALID_CURSOR');
    if(payload.expiresAt-payload.issuedAt>ttlMs
      ||payload.expiresAt<=payload.issuedAt
      ||payload.issuedAt>context.nowMs
      ||payload.issuedAt<0) throw new CatalogCursorError('INVALID_CURSOR');
    if(context.nowMs>=payload.expiresAt)
      throw new CatalogCursorError('EXPIRED_CURSOR');
    if(payload.actorId!==context.actorId
      ||payload.consentVersion!==context.consentVersion
      ||payload.catalogRevision!==context.catalogRevision
      ||payload.scopeKey!==context.scopeKey
      ||payload.filterKey!==catalogFilterKey(context.query))
      throw new CatalogCursorError('STALE_CURSOR');
    return {
      scopeKey:payload.scopeKey,catalogRevision:payload.catalogRevision,
      filterKey:payload.filterKey,lastId:payload.lastId,lastSortValue:payload.lastSortValue,
    };
  };
  return {sign,verify};
}
