import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {SourceBrowserResourceSchema,type SourceBrowserResource} from './source-browser-evidence.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),Actor=z.string().regex(/^[A-Za-z0-9_.:@-]{1,128}$/);
const Time=z.preprocess(v=>v instanceof Date?v.toISOString():v,z.iso.datetime({offset:true}));
const Registration=SourceBrowserResourceSchema.pick({sourceId:true,permissionRef:true,canonicalUrl:true,kind:true})
  .extend({contentType:z.string().min(1).max(100)}).strict();
export type SourceBrowserResourceRegistration=z.infer<typeof Registration>;
export interface CapturedSourceBrowserResource {
  manifest:SourceBrowserResource;contentType:string;bytes:Uint8Array;
}
export interface SourceBrowserResources {
  load(input:{actorRef:string}):Promise<{resources:CapturedSourceBrowserResource[];revalidate:()=>Promise<void>}>;
}
const Row=z.object({source_id:Ref,permission_ref:Ref,revision_id:Ref,head_revision_id:Ref,
  original_sha256:z.string().regex(/^[a-f0-9]{64}$/),original_bytes:z.instanceof(Uint8Array),
  fetched_at:Time,status:z.enum(['ACTIVE','NEEDS_REVIEW']),change_kind:z.enum(['NEW','CORRECTED','EXTENDED']),
  receipt_id:Ref,actor_id:Actor,reviewed_by:Actor,canonical_url:z.string(),
  purposes:z.array(z.enum(['COLLECT','STORE','SEARCH','EXTERNAL_TRANSFER'])).min(3).max(4),
  policy_version:Ref,reviewed_at:Time,starts_at:Time,expires_at:Time,revoked_at:z.null(),database_now:Time});
const MIME={SCRIPT:['text/javascript','application/javascript'],STYLE:['text/css'],
  JSON:['application/json'],IMAGE:['image/png','image/jpeg','image/gif','image/webp']} as const;
const sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
function denied():never{throw new Error('Approved browser resources unavailable');}
function registration(raw:unknown):SourceBrowserResourceRegistration{
  const r=Registration.parse(raw),u=new URL(r.canonicalUrl);
  if(isIP(u.hostname)!==0||u.hostname.includes(':')||!u.hostname.includes('.')
    ||u.hostname.endsWith('.')||/\.(?:local|localhost|internal)$/.test(u.hostname)
    ||!(MIME[r.kind] as readonly string[]).includes(r.contentType.split(';')[0]!)
    ||!/^[a-z]+\/[a-z]+(?:; charset=(?:utf-8|euc-kr))?$/.test(r.contentType)
    ||(r.kind==='IMAGE'&&r.contentType.includes(';')))denied();
  return r;
}

/** Read-only private capture store. It never fetches, discovers, approves or
 * updates a source. Registrations come from the independently reviewed operator
 * factory; page code cannot choose SQL identifiers or request arbitrary URLs.
 * The SQL role must read private originals and exact actor rights separately
 * from the public retrieval/head-reader roles. */
export function createPostgresSourceBrowserResources(options:{pool:ReviewerSqlPool;actorRef:string;
  registrations:readonly SourceBrowserResourceRegistration[];now?:()=>string}):SourceBrowserResources{
  const actor=Actor.parse(options.actorRef),entries=options.registrations.map(registration),now=options.now??(()=>new Date().toISOString());
  if(entries.length>16||new Set(entries.map(r=>r.canonicalUrl)).size!==entries.length
    ||typeof options.pool?.connect!=='function')denied();
  async function capture(actorRef:string){
    if(actorRef!==actor)denied();
    const at=Time.parse(now()),resources:CapturedSourceBrowserResource[]=[],fingerprints:string[]=[];
    let total=0;
    for(const entry of entries){
      const c=await options.pool.connect();
      try{
        const result=await c.query(`SELECT r.source_id,r.permission_ref,r.revision_id,r.original_sha256,
          CASE WHEN octet_length(o.original_bytes) BETWEEN 1 AND 262144 THEN o.original_bytes ELSE NULL END AS original_bytes,
          r.fetched_at,r.status,r.change_kind,h.revision_id AS head_revision_id,
          p.receipt_id,p.actor_id,p.reviewed_by,p.canonical_url,p.purposes,p.policy_version,
          p.reviewed_at,p.starts_at,p.expires_at,v.revoked_at,clock_timestamp() AS database_now
          FROM source_ingest_heads h JOIN source_revisions_vnext r ON r.revision_id=h.revision_id
          JOIN source_originals_vnext o ON o.revision_id=r.revision_id AND o.original_sha256=r.original_sha256
          CROSS JOIN LATERAL (SELECT * FROM source_rights_receipts
            WHERE actor_id=$1 AND source_id=$2 AND permission_ref=$3
            ORDER BY reviewed_at DESC,receipt_id DESC LIMIT 1) p
          LEFT JOIN source_rights_revocations v ON v.receipt_id=p.receipt_id
          WHERE h.source_id=$2 AND r.source_id=$2 AND r.permission_ref=$3 LIMIT 2`,
          [actor,entry.sourceId,entry.permissionRef]);
        if(result.rows.length!==1)denied();
        const r=Row.parse(result.rows[0]),after=Time.parse(now());
        const earliest=Math.min(Date.parse(at),Date.parse(after),Date.parse(r.database_now));
        const latest=Math.max(Date.parse(at),Date.parse(after),Date.parse(r.database_now));
        if(r.source_id!==entry.sourceId||r.permission_ref!==entry.permissionRef||r.actor_id!==actor
          ||r.canonical_url!==entry.canonicalUrl||r.reviewed_by===actor||r.revision_id!==r.head_revision_id
          ||Date.parse(r.reviewed_at)>Date.parse(r.starts_at)||Date.parse(r.reviewed_at)>earliest
          ||Date.parse(r.starts_at)>earliest||Date.parse(r.expires_at)<=latest||Date.parse(r.fetched_at)>earliest
          ||!['COLLECT','STORE','SEARCH'].every(p=>r.purposes.includes(p as typeof r.purposes[number]))
          ||new Set(r.purposes).size!==r.purposes.length)denied();
        const bytes=Buffer.from(r.original_bytes);total+=bytes.length;
        if(!bytes.length||bytes.length>256*1024||total>1024*1024||sha(bytes)!==r.original_sha256)denied();
        const manifest=SourceBrowserResourceSchema.parse({sourceId:r.source_id,revisionId:r.revision_id,
          permissionRef:r.permission_ref,canonicalUrl:entry.canonicalUrl,kind:entry.kind,
          rightsReceiptId:r.receipt_id,originalSha256:r.original_sha256,byteLength:bytes.length});
        resources.push({manifest,bytes,contentType:entry.contentType});
        // Bind receipt facts too, even if a malformed storage implementation
        // returns different data under the same supposedly immutable ID.
        fingerprints.push(JSON.stringify({...r,original_bytes:undefined,database_now:undefined}));
      }finally{c.release();}
    }
    return {resources,fingerprint:JSON.stringify(fingerprints)};
  }
  return {async load({actorRef}){
    try{
      const captured=await capture(actorRef),baseline=captured.fingerprint;
      return {resources:captured.resources,revalidate:async()=>{
        try{if((await capture(actorRef)).fingerprint!==baseline)denied();}catch{denied();}
      }};
    }catch{denied();}
  }};
}
