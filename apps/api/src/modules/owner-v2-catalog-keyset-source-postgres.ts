/**
 * #447 Correctness-first, bounded DB-to-HTTP catalog source.
 * All actor-scoped projection rows are verified through PostgreSQL keysets.
 * A complete global epoch (NOT a per-page fingerprint) backs HMAC cursors.
 * JS core remains responsible for Korean filter/count/sort equivalence.
 * Hard bound: 5,000 verified rows. No NCP, data or right activation.
 */
import {z} from 'zod';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import type {ReviewerSqlConnection} from './auth/reviewer-postgres.js';
import {PostgresApprovedOwnerReader,canonicalProjectionHash}
  from './opportunities/owner-catalog-postgres.js';
import type {ApprovedOwnerProjection} from './opportunities/owner-catalog-postgres.js';
import type {TrustedOwnerV2CatalogSource,ApprovedV2CatalogSnapshot}
  from './owner-v2-catalog-http.js';
import {MAX_VERIFIED_V2_CATALOG_ROWS,VERIFIED_V2_KEYSET_PAGE_SIZE}
  from './owner-v2-catalog-limits.js';

const ISO=z.iso.datetime({offset:true});
const Id=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const ActorId=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/);
const Canonical=z.strictObject({source_id:Id,permission_ref:Id,
  canonical_url:z.string().url().max(2048)});
const SHA=/^[0-9a-f]{64}$/;
const BATCH_SIZE=VERIFIED_V2_KEYSET_PAGE_SIZE;
type Query={actorId:string;asOf:string};
type Ticket={actorId:string;asOf:string;fingerprint:string;expires:number};
const key=(a:string,b:string)=>JSON.stringify([a,b]);
function deny():never{throw new Error('V2_CATALOG_EPOCH_UNAVAILABLE');}

/** The page + its lookahead row must have approved canonical rights receipts
 * from the SAME read-only PostgreSQL transaction as the projection proofs. */
async function canonicalPageProof(connection:ReviewerSqlConnection,
  rows:readonly ApprovedOwnerProjection[],actorId:string,now:string){
  const refs=new Map<string,{source_id:string;permission_ref:string}>();
  for(const projection of rows)for(const ref of projection.sources_json)
    refs.set(key(ref.sourceId,ref.permissionRef),
      {source_id:ref.sourceId,permission_ref:ref.permissionRef});
  if(!refs.size)return [];
  const sql=[
    'SELECT r.source_id,r.permission_ref,r.canonical_url',
    'FROM jsonb_to_recordset($1::jsonb)',
    'AS x(source_id text,permission_ref text)',
    'JOIN source_rights_receipts r',
    'ON r.source_id=x.source_id AND r.permission_ref=x.permission_ref',
    "WHERE r.actor_id=$2 AND 'SEARCH'=ANY(r.purposes)",
    'AND r.reviewed_by<>r.actor_id',
    'AND r.reviewed_at<=LEAST($3::timestamptz,clock_timestamp())',
    'AND r.starts_at<=LEAST($3::timestamptz,clock_timestamp())',
    'AND r.expires_at>GREATEST($3::timestamptz,clock_timestamp())',
    'AND NOT EXISTS (SELECT 1 FROM source_rights_revocations v',
    'WHERE v.receipt_id=r.receipt_id)',
    'ORDER BY r.source_id,r.permission_ref,r.canonical_url',
  ].join(' ');
  const result=await connection.query(sql,
    [JSON.stringify([...refs.values()]),actorId,now]);
  if(result.rows.length!==refs.size)deny();
  const parsed=Canonical.array().max(BATCH_SIZE*101).parse(result.rows);
  if(new Set(parsed.map(x=>key(x.source_id,x.permission_ref))).size!==refs.size
    ||parsed.some(x=>!refs.has(key(x.source_id,x.permission_ref))))deny();
  return parsed;
}
function approvedItem(row:ApprovedOwnerProjection,actorId:string,asOf:string,
  canonical:ReadonlyMap<string,string>):C.OpportunityCatalogItem{
  const item=V.OpportunityCatalogItemSchema.parse(row.payload_json);
  if(row.kind!=='V2_CATALOG'||row.actor_id!==actorId||row.entity_id!==item.id
    ||!item.permitted||item.source.status!=='VERIFIED'
    ||item.source.rights!=='CLEARED'||!item.source.verifiedAt
    ||Date.parse(item.source.verifiedAt)>Date.parse(asOf)||!item.sourceUrl)
    deny();
  let bound=false;
  for(const ref of row.sources_json){
    const url=canonical.get(key(ref.sourceId,ref.permissionRef));
    if(!url)deny();
    if(ref.sourceId===item.source.sourceId
      &&ref.revisionId===item.source.revisionId){
      if(url!==item.sourceUrl)deny();
      bound=true;
    }
  }
  if(!bound)deny();
  return item;
}

export class PostgresOwnerV2StableKeysetSource implements TrustedOwnerV2CatalogSource{
  private readonly tickets=new Map<string,Ticket>();
  constructor(private readonly reader:PostgresApprovedOwnerReader,
    private readonly clock:()=>string=()=>new Date().toISOString()){}

  private async scan(input:Query,now:string){
    ActorId.parse(input.actorId);ISO.parse(input.asOf);ISO.parse(now);
    const items:C.OpportunityCatalogItem[]=[];
    const pageDigests:{first:string|null;last:string|null;fingerprint:string}[]=[];
    let consentVersion:string|null=null,validUntil='9999-12-31T23:59:59.999Z';
    let lastId:string|undefined;
    for(let pageNo=0;pageNo<=MAX_VERIFIED_V2_CATALOG_ROWS/BATCH_SIZE;pageNo++){
      if(pageNo===MAX_VERIFIED_V2_CATALOG_ROWS/BATCH_SIZE)deny();
      const page=await this.reader.readV2KeysetPage({
        actorId:input.actorId,asOf:input.asOf,pageSize:BATCH_SIZE,
        ...(lastId?{afterEntityId:lastId}:{}),
      },now,(connection,rows)=>canonicalPageProof(connection,rows,input.actorId,now));
      if(!page)return null;
      if(!SHA.test(page.fingerprint)||!Id.safeParse(page.consentVersion).success
        ||!Array.isArray(page.rows)||page.rows.length>BATCH_SIZE
        ||page.hasMore&&page.rows.length!==BATCH_SIZE
        ||!Array.isArray(page.extra))deny();
      if(consentVersion!==null&&consentVersion!==page.consentVersion)deny();
      consentVersion=page.consentVersion;
      const currentCanonical=Canonical.array().parse(page.extra);
      const proofByPair=new Map(currentCanonical.map(proof=>[
        key(proof.source_id,proof.permission_ref),proof.canonical_url,
      ]));
      if(proofByPair.size!==currentCanonical.length)deny();
      for(const row of page.rows){
        if(lastId!==undefined&&row.entity_id<=lastId)deny();
        items.push(approvedItem(row,input.actorId,input.asOf,proofByPair));
        lastId=row.entity_id;
      }
      if(items.length>MAX_VERIFIED_V2_CATALOG_ROWS)deny();
      if(!ISO.safeParse(page.validUntil).success)deny();
      if(Date.parse(page.validUntil)<Date.parse(validUntil))
        validUntil=page.validUntil;
      pageDigests.push({first:page.rows[0]?.entity_id??null,
        last:page.rows.at(-1)?.entity_id??null,fingerprint:page.fingerprint});
      if(!page.hasMore){
        if(page.nextAfterEntityId!==null)deny();
        if(new Set(items.map(item=>item.id)).size!==items.length)deny();
        if(!consentVersion||Date.parse(validUntil)<=Date.parse(now))deny();
        const fingerprint=canonicalProjectionHash({
          type:'V2_VERIFIED_GLOBAL_EPOCH_V1',
          actorId:input.actorId,asOf:input.asOf,consentVersion,
          count:items.length,pageDigests,
        });
        return {items,consentVersion,fingerprint,validUntil};
      }
      if(!lastId||page.nextAfterEntityId!==lastId)deny();
    }
    return deny();
  }

  async read(input:Query):Promise<ApprovedV2CatalogSnapshot|null>{
    const now=ISO.parse(this.clock());
    const result=await this.scan(input,now);
    if(!result)return null;
    const current=Date.parse(ISO.parse(this.clock()));
    const expires=Math.min(current+30_000,Date.parse(result.validUntil));
    if(!Number.isSafeInteger(expires)||expires<=current)deny();
    for(const [name,ticket] of this.tickets)
      if(ticket.expires<=current)this.tickets.delete(name);
    if(this.tickets.size>=128&&!this.tickets.has(result.fingerprint))deny();
    this.tickets.set(result.fingerprint,{
      actorId:input.actorId,asOf:input.asOf,
      fingerprint:result.fingerprint,expires,
    });
    return {items:result.items,scopeKey:result.fingerprint,
      catalogRevision:result.fingerprint,
      consentVersion:result.consentVersion,
      receipt:{actorId:input.actorId,sourceVersion:result.fingerprint,
        expiresAt:new Date(expires).toISOString()}};
  }

  async revalidate(input:Parameters<TrustedOwnerV2CatalogSource['revalidate']>[0]){
    try{
      const now=ISO.parse(input.now),current=Date.parse(ISO.parse(this.clock()));
      const ticket=this.tickets.get(input.receipt.sourceVersion);
      if(!ticket||ticket.actorId!==input.actorId
        ||input.receipt.actorId!==input.actorId
        ||ticket.fingerprint!==input.receipt.sourceVersion
        ||ticket.expires!==Date.parse(input.receipt.expiresAt)
        ||Math.max(Date.parse(now),current)>=ticket.expires)return false;
      const fresh=await this.scan({actorId:ticket.actorId,asOf:ticket.asOf},now);
      return fresh!==null&&fresh.fingerprint===ticket.fingerprint
        &&Math.max(Date.parse(ISO.parse(this.clock())),Date.parse(now))<ticket.expires;
    }catch{return false;}
  }
}
