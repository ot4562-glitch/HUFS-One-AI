import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {OwnerMajorWhatIfScenarioSchema} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {OwnerReceipts} from '../auth/owner-receipts.js';
import {PostgresApprovedOwnerReader,canonicalProjectionHash} from '../opportunities/owner-catalog-postgres.js';
import type {OwnerCatalogAuthority} from '../opportunities/owner-catalog-postgres.js';
import {policyFingerprint} from '../opportunities/temporal-gateway.js';
import {ApprovedOwnerMajorWhatIfInputSchema} from './owner-major-what-if-source.js';
import {ownerRulePackDocumentSources} from './owner-double-major-source.js';
import type {TrustedOwnerMajorWhatIfLoader,OwnerMajorWhatIfSnapshot} from './owner-major-what-if-source.js';

const Actor=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/);
const Version=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Time=z.iso.datetime({offset:true});
const Query=z.strictObject({actorId:Actor,scenario:OwnerMajorWhatIfScenarioSchema,
  now:Time,expectedCurrentVersion:Version.optional()});
type Query=z.infer<typeof Query>;
type Ticket={actorId:string;scenario:Query['scenario'];asOf:string;currentVersion:string;
  fingerprint:string;issued:number;expires:number};

/** Read-only current approved owner What-if input, never user-provided RulePacks.
 * Current source revisions, SEARCH rights, consent and FORCE RLS are all
 * checked by PostgresApprovedOwnerReader. Independently supplied HTTP rights
 * and academic activation still gate the calculated output. */
export class PostgresOwnerMajorWhatIfSnapshotLoader implements TrustedOwnerMajorWhatIfLoader {
  private readonly reader:PostgresApprovedOwnerReader;
  private readonly tickets=new OwnerReceipts<Ticket>(ticket=>ticket.actorId);
  constructor(pool:ReviewerSqlPool,private readonly authority:OwnerCatalogAuthority,
    private readonly clock:()=>string=()=>new Date().toISOString()){
    this.reader=new PostgresApprovedOwnerReader(pool,authority,clock);
  }
  private async read(input:Query,readNow=input.now):Promise<
    {snapshot:Omit<OwnerMajorWhatIfSnapshot,'receipt'>;fingerprint:string;validUntil:string}|null>{
    const query=Query.parse(input),current=Time.parse(readNow),now=Time.parse(this.clock());
    if(Date.parse(query.now)>Math.min(Date.parse(current),Date.parse(now)))return null;
    const grants=await this.authority.resolve({actorId:query.actorId,now:current});
    if(!grants?.permissionRefs.size)return null;
    const policy=policyFingerprint(grants);
    const read=await this.reader.read({
      actorId:query.actorId,kind:'PLAN_INPUT',entityId:'CURRENT_MAJOR_WHAT_IF',asOf:query.now,
    },current,async(connection,rows)=>{
      if(rows.length!==1)return null;
      const projection=rows[0]!,data=ApprovedOwnerMajorWhatIfInputSchema.parse(projection.payload_json);
      if(Buffer.byteLength(JSON.stringify(data))>250_000)throw new Error('Academic input exceeds bound');
      const sources=[
        data.profile.source,data.transcript.source,
        ...[data.current,data.hypothetical].flatMap(bundle=>[
          bundle.primary.source,bundle.primary.catalogSource,
          ...(bundle.secondary?[bundle.secondary.source,bundle.secondary.catalogSource]:[]),
          ...(bundle.overlapRule?[bundle.overlapRule.source]:[]),
          ...(bundle.primary.documentSources??[]).map(d=>d.source),
          ...(bundle.secondary?.documentSources??[]).map(d=>d.source),
        ]),
      ];
      const manifest=new Set(projection.sources_json.map(ref=>canonicalProjectionHash(ref)));
      if(sources.some(ref=>!manifest.has(canonicalProjectionHash(ref))))
        throw new Error('What-if source outside approved manifest');
      const proofs:string[]=[];
      for(const bundle of [data.current,data.hypothetical]){
        for(const binding of [bundle.primary,bundle.secondary]){
          if(!binding)continue;
          for(const doc of ownerRulePackDocumentSources(binding)){
            const ref=doc.source;
            const checked=await connection.query('SELECT original_sha256 FROM source_effective_revisions_vnext '+
              'WHERE source_id=$1 AND revision_id=$2 AND permission_ref=$3',
              [ref.sourceId,ref.revisionId,ref.permissionRef]);
            if(checked.rows.length!==1||checked.rows[0]?.original_sha256!==doc.sha256)
              throw new Error('What-if original RulePack document unavailable');
            proofs.push(canonicalProjectionHash({ref,originalSha256:doc.sha256}));
          }
        }
      }
      return proofs.sort();
    });
    if(!read||read.rows.length!==1||!Array.isArray(read.extra))return null;
    const projection=read.rows[0]!,data=ApprovedOwnerMajorWhatIfInputSchema.parse(projection.payload_json);
    const after=await this.authority.resolve({actorId:query.actorId,now:Time.parse(this.clock())});
    const completed=Time.parse(this.clock());
    if(!after||policyFingerprint(after)!==policy||Date.parse(completed)>=Date.parse(read.validUntil))return null;
    return {snapshot:{actorId:query.actorId,asOf:query.now,
      currentVersion:Version.parse(projection.version),scenario:structuredClone(query.scenario),input:data},
      fingerprint:read.fingerprint,validUntil:read.validUntil};
  }
  private prune(now:number){
    for(const [token,item] of this.tickets)if(item.expires<=now)this.tickets.delete(token);
  }
  async load(raw:Parameters<TrustedOwnerMajorWhatIfLoader['load']>[0]):Promise<OwnerMajorWhatIfSnapshot|null>{
    const input=Query.parse(raw),read=await this.read(input);
    if(!read)return null;
    const issued=Date.parse(Time.parse(this.clock()));
    const expires=Math.min(issued+30_000,Date.parse(read.validUntil));
    if(!(issued<expires))return null;
    this.prune(issued);
    const receipt=randomBytes(32).toString('hex');
    this.tickets.set(receipt,{actorId:input.actorId,scenario:structuredClone(input.scenario),
      asOf:input.now,currentVersion:read.snapshot.currentVersion,
      fingerprint:read.fingerprint,issued,expires});
    return structuredClone({...read.snapshot,receipt});
  }
  async revalidate(raw:Parameters<TrustedOwnerMajorWhatIfLoader['revalidate']>[0]):Promise<boolean>{
    try{
      const data=z.strictObject({actorId:Actor,scenario:OwnerMajorWhatIfScenarioSchema,
        now:Time,asOf:Time,sourceReceipt:z.string().length(64).regex(/^[a-f0-9]+$/),
        currentVersion:Version}).parse(raw);
      const ticket=this.tickets.get(data.sourceReceipt);
      const initial=Date.parse(Time.parse(this.clock()));
      if(!ticket||ticket.actorId!==data.actorId||!isDeepStrictEqual(ticket.scenario,data.scenario)
        ||ticket.asOf!==data.asOf||ticket.currentVersion!==data.currentVersion
        ||initial<ticket.issued||initial>=ticket.expires||Date.parse(data.now)<Date.parse(data.asOf)
        ||Date.parse(data.now)>initial)return false;
      const read=await this.read({actorId:ticket.actorId,scenario:ticket.scenario,now:ticket.asOf},data.now);
      const completed=Date.parse(Time.parse(this.clock()));
      return !!read&&read.fingerprint===ticket.fingerprint
        &&read.snapshot.currentVersion===ticket.currentVersion
        &&completed>=initial&&completed<ticket.expires&&completed<Date.parse(read.validUntil);
    }catch{return false;}
  }
}
