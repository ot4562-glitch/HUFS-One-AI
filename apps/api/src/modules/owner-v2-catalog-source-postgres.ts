/** #447: owner V2 catalog over the *existing* source/rights/consent verified
 * PostgreSQL projection reader. No data seeding, activation or synthetic
 * fallback. The private operator must independently review V2_CATALOG rows.
 */
import {z} from 'zod';
import {FeatureAdditions as V} from '@hufs-one/contracts';
import type {ReviewerSqlConnection} from './auth/reviewer-postgres.js';
import {PostgresApprovedOwnerReader} from './opportunities/owner-catalog-postgres.js';
import type {ApprovedOwnerProjection} from './opportunities/owner-catalog-postgres.js';
import type {TrustedOwnerV2CatalogSource,ApprovedV2CatalogSnapshot} from './owner-v2-catalog-http.js';

const Time=z.iso.datetime({offset:true});
const Canonical=z.strictObject({
  source_id:z.string().min(1).max(128),
  permission_ref:z.string().min(1).max(128),
  canonical_url:z.string().min(9).max(2048),
});
const pair=(sourceId:string,permissionRef:string)=>JSON.stringify([sourceId,permissionRef]);
const fail=():never=>{throw new Error('Approved V2 catalog unavailable');};
type Query={actorId:string;asOf:string;kind:'V2_CATALOG'};
type Ticket={query:Query;fingerprint:string;expires:number};

/** No direct SQL outside the existing PostgreSQL authorization reader.
 * Its repeatable-read transaction already verifies current actor consent,
 * exact SEARCH rights pairs, active source HEAD, original/review hashes,
 * independent review, RLS and current revocation records.
 * V2 adds payload/evidence binding and exact canonical URL confirmation.
 */
export class PostgresOwnerV2CatalogSource implements TrustedOwnerV2CatalogSource{
  private readonly tickets=new Map<string,Ticket>();
  constructor(private readonly reader:PostgresApprovedOwnerReader,
    private readonly clock:()=>string=()=>new Date().toISOString()){}

  private async canonicalProofs(connection:ReviewerSqlConnection,
    projections:readonly ApprovedOwnerProjection[],actorId:string,now:string){
    const refs=new Map<string,{source_id:string;permission_ref:string}>();
    for(const projection of projections)for(const ref of projection.sources_json)
      refs.set(pair(ref.sourceId,ref.permissionRef),{
        source_id:ref.sourceId,permission_ref:ref.permissionRef,
      });
    if(!refs.size)return [];
    // Renewed receipts may overlap, but different canonical URLs for
    // the *same pair* are ambiguous. Collapse only agreeing URLs.
    // A conflicting pair is omitted by HAVING and fails the pair count
    // below. All rows here were independently current/rights checked.
    const result=await connection.query(`SELECT r.source_id,r.permission_ref,
        MIN(r.canonical_url) AS canonical_url
      FROM jsonb_to_recordset($1::jsonb)
        AS p(source_id text,permission_ref text)
      JOIN source_rights_receipts r
        ON r.source_id=p.source_id AND r.permission_ref=p.permission_ref
      WHERE r.actor_id=$2 AND 'SEARCH'=ANY(r.purposes)
        AND r.reviewed_by<>r.actor_id
        AND r.reviewed_at<=LEAST($3::timestamptz,clock_timestamp())
        AND r.starts_at<=LEAST($3::timestamptz,clock_timestamp())
        AND r.expires_at>GREATEST($3::timestamptz,clock_timestamp())
        AND NOT EXISTS(SELECT 1 FROM source_rights_revocations revoked
          WHERE revoked.receipt_id=r.receipt_id)
      GROUP BY r.source_id,r.permission_ref
      HAVING COUNT(DISTINCT r.canonical_url)=1
      ORDER BY r.source_id,r.permission_ref`,
    [JSON.stringify([...refs.values()]),actorId,now]);
    // Ambiguous/missing canonical URLs fail the entire owner response,
    // even when an item lacks sourceUrl: no partial approved results.
    if(result.rows.length!==refs.size)fail();
    const rows=result.rows.map(value=>Canonical.parse(value));
    if(new Set(rows.map(v=>pair(v.source_id,v.permission_ref))).size!==refs.size)fail();
    for(const value of rows)
      if(!refs.has(pair(value.source_id,value.permission_ref)))fail();
    return rows;
  }

  private async load(query:Query,now:string){
    Time.parse(query.asOf);Time.parse(now);
    const read=await this.reader.read(query,now,(connection,projections)=>
      this.canonicalProofs(connection,projections,query.actorId,now));
    if(!read)return null;
    if(!/^[0-9a-f]{64}$/.test(read.fingerprint)||!read.consentVersion
      ||read.rows.length>500)fail();
    const canonicals=Canonical.array().parse(read.extra);
    const byPair=new Map(canonicals.map(row=>[
      pair(row.source_id,row.permission_ref),row.canonical_url,
    ]));
    const items=read.rows.map(projection=>{
      const item=V.OpportunityCatalogItemSchema.parse(projection.payload_json);
      if(projection.kind!=='V2_CATALOG'||projection.actor_id!==query.actorId
        ||projection.entity_id!==item.id||!item.permitted
        ||item.source.status!=='VERIFIED'||item.source.rights!=='CLEARED'
        ||!item.source.verifiedAt
        ||Date.parse(item.source.verifiedAt)>Date.parse(query.asOf))fail();
      const refs=projection.sources_json.filter(ref=>
        ref.sourceId===item.source.sourceId&&ref.revisionId===item.source.revisionId);
      if(!refs.length)fail();
      // A reviewed payload must point to the *same exact* canonical source
      // page as the independently reviewed rights receipt, not just its host.
      for(const ref of refs)
        if(!byPair.has(pair(ref.sourceId,ref.permissionRef))
          ||item.sourceUrl&&item.sourceUrl!==byPair.get(pair(ref.sourceId,ref.permissionRef)))
          fail();
      return item;
    });
    if(new Set(items.map(item=>item.id)).size!==items.length)fail();
    return {items,read};
  }

  async read(input:{actorId:string;asOf:string}):Promise<ApprovedV2CatalogSnapshot|null>{
    const now=Time.parse(this.clock());
    const query:Query={actorId:input.actorId,asOf:input.asOf,kind:'V2_CATALOG'};
    const result=await this.load(query,now);
    if(!result)return null;
    const nowMs=Date.parse(now),expires=Math.min(nowMs+30_000,Date.parse(result.read.validUntil));
    if(!Number.isFinite(expires)||expires<=nowMs)fail();
    for(const [id,ticket] of this.tickets)if(ticket.expires<=nowMs)this.tickets.delete(id);
    // Bound process memory without denying the 129th *different* user.
    // An evicted ticket can only fail closed on revalidation; it never
    // becomes an authorization substitute for the current PostgreSQL read.
    const id=pair(input.actorId,result.read.fingerprint);
    this.tickets.delete(id); // refresh insertion/LRU order
    if(this.tickets.size>=4096){
      const oldest=this.tickets.keys().next().value;
      if(oldest!==undefined)this.tickets.delete(oldest);
    }
    this.tickets.set(id,{query,fingerprint:result.read.fingerprint,expires});
    return {
      items:result.items,
      scopeKey:result.read.fingerprint,
      catalogRevision:result.read.fingerprint,
      consentVersion:result.read.consentVersion,
      receipt:{actorId:input.actorId,sourceVersion:result.read.fingerprint,
        expiresAt:new Date(expires).toISOString()},
    };
  }

  async revalidate(input:Parameters<TrustedOwnerV2CatalogSource['revalidate']>[0]):Promise<boolean>{
    try{
      const now=Time.parse(input.now),ticket=this.tickets.get(pair(input.actorId,input.receipt.sourceVersion));
      if(!ticket||input.actorId!==ticket.query.actorId
        ||input.receipt.actorId!==input.actorId
        ||Date.parse(input.receipt.expiresAt)!==ticket.expires
        ||Date.parse(now)>=ticket.expires)return false;
      // Fresh authorized source HEAD, consent, rights, canonical URLs and
      // payload fingerprint, not an in-memory authorization cache.
      const current=await this.load(ticket.query,now);
      return current!==null&&current.read.fingerprint===ticket.fingerprint;
    }catch{return false;}
  }
}
