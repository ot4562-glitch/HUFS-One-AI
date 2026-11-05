import {randomBytes} from 'node:crypto';
import {OwnerReceipts,ReceiptAdmissionError} from '../auth/owner-receipts.js';
import {z} from 'zod';
import {OwnerDoubleMajorAuditSchema} from '../../../../../packages/contracts/src/academics/double-major.js';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {PostgresApprovedOwnerReader,canonicalProjectionHash} from '../opportunities/owner-catalog-postgres.js';
import type {OwnerCatalogAuthority} from '../opportunities/owner-catalog-postgres.js';
import {policyFingerprint} from '../opportunities/temporal-gateway.js';
import {createTrustedOwnerDoubleMajorSource,ownerDoubleMajorInputRefs,ownerRulePackDocumentSources,validateOwnerDoubleMajorInput} from './owner-double-major-source.js';
import type {OwnerDoubleMajorSnapshot,TrustedOwnerDoubleMajorSnapshots} from './owner-double-major-source.js';
import type {TrustedOwnerDoubleMajorRights} from './owner-double-major-http.js';

const Actor=z.string().regex(/^[A-Za-z0-9_.:@-]{1,200}$/);
const Time=z.iso.datetime({offset:true});
const instant=(value:unknown)=>Time.parse(value instanceof Date?value.toISOString():value);
type ReadInput={actorId:string;now:string};
type Ticket={input:ReadInput;fingerprint:string;issued:number;expires:number};
type RightsTicket={actorId:string;sourceReceipt:string;fingerprint:string;expires:number};

/** Durable SELECT-only adapter. All current profile/transcript/role pack/catalog
 * heads are one reviewed PLAN_INPUT projection. There is no approval writer or
 * browser RulePack path, and existing single-pack plan projections are rejected.
 */
export class PostgresOwnerDoubleMajorSnapshotLoader implements TrustedOwnerDoubleMajorSnapshots {
  private readonly reader:PostgresApprovedOwnerReader;
  private readonly tickets=new OwnerReceipts<Ticket>(value=>value.input.actorId);
  private readonly rightsTickets=new OwnerReceipts<RightsTicket>(value=>value.actorId);
  constructor(private readonly pool:ReviewerSqlPool,private readonly authority:OwnerCatalogAuthority,
    private readonly clock:()=>string=()=>new Date().toISOString()){
    this.reader=new PostgresApprovedOwnerReader(pool,authority,clock);
  }
  private async read(input:ReadInput,currentNow=input.now){
    Actor.parse(input.actorId);Time.parse(input.now);Time.parse(currentNow);
    const before=await this.authority.resolve({actorId:input.actorId,now:currentNow});
    if(!before?.permissionRefs.size)return null;
    const policy=policyFingerprint(before);
    const read=await this.reader.read({actorId:input.actorId,kind:'PLAN_INPUT',entityId:'CURRENT_DOUBLE_MAJOR',asOf:input.now},currentNow,
      async(connection,projections)=>{
        if(projections.length!==1)return null;
        const row=projections[0]!;
        if(Buffer.byteLength(JSON.stringify(row.payload_json))>250_000)throw new Error('Academic projection exceeds bound');
        const payload=validateOwnerDoubleMajorInput(row.payload_json,input.now);
        const reviewed=new Set(row.sources_json.map(ref=>canonicalProjectionHash(ref)));
        if(ownerDoubleMajorInputRefs(payload).some(ref=>!reviewed.has(canonicalProjectionHash(ref))))throw new Error('Unbound academic projection source');
        // Reader has already verified these exact current source heads/rights.
        // Bind each RulePack's independently inventoried bytes to that source,
        // rather than accepting an unrelated self-consistent pack hash.
        const proofs=[];
        for(const binding of [payload.primary,payload.doubleMajor]){
          if(!binding)continue;
          for(const document of ownerRulePackDocumentSources(binding)){
            const ref=document.source;
            const result=await connection.query(`SELECT source_id,revision_id,permission_ref,original_sha256
              FROM source_effective_revisions_vnext WHERE source_id=$1 AND revision_id=$2 AND permission_ref=$3`,
            [ref.sourceId,ref.revisionId,ref.permissionRef]);
            const proof=result.rows[0];
            if(result.rows.length!==1||!proof||proof.source_id!==ref.sourceId||proof.revision_id!==ref.revisionId||proof.permission_ref!==ref.permissionRef||
              proof.original_sha256!==document.sha256)throw new Error('RulePack original source mismatch');
            proofs.push({sourceId:ref.sourceId,revisionId:ref.revisionId,permissionRef:ref.permissionRef,originalSha256:proof.original_sha256});
          }
        }
        return proofs;
      });
    if(!read||read.rows.length!==1)return null;
    const projection=read.rows[0]!,payload=validateOwnerDoubleMajorInput(projection.payload_json,input.now);
    if(payload.approval.consentVersion!==read.consentVersion||payload.approval.sourceRightsVersion!==before.policyVersion)throw new Error('Academic consent/policy version mismatch');
    const profile=payload.profile;
    if(profile){
      const scopes=[payload.primary?.pack.scope,payload.doubleMajor?.pack.scope];
      const extended=scopes.some(scope=>scope?.degreePath!==undefined||scope?.track!==undefined)
        ||payload.primary?.pack.sourceDocuments!==undefined||payload.doubleMajor?.pack.sourceDocuments!==undefined
        ||!!payload.sameCourseRules?.length;
      if((extended||before.curriculumVersion!==undefined)&&before.curriculumVersion!==profile.curriculumVersion)
        throw new Error('Academic curriculum differs from current verified actor scope');
      for(const axis of ['degreePath','track'] as const){
        if(profile[axis]===undefined&&!scopes.some(scope=>scope?.[axis]!==undefined))continue;
        const missing=axis==='degreePath'?'UNSELECTED':'UNDECIDED';
        if((profile[axis]??missing)!==(before[axis]??missing))
          throw new Error('Academic pathway differs from current verified actor scope');
      }
      const primaries=before.majors?.filter(major=>major.role==='PRIMARY')??[];
      const doubles=before.majors?.filter(major=>major.role==='DOUBLE')??[];
      if(before.campus!==profile.campus||before.cohort!==profile.cohort||before.admissionType!==profile.admissionType||
        primaries.length!==1||primaries[0]?.code!==profile.primaryMajor||
        (profile.secondaryMajor.status==='SELECTED'?(doubles.length!==1||doubles[0]?.code!==profile.secondaryMajor.majorId):doubles.length!==0))throw new Error('Academic profile differs from current verified actor scope');
    }
    const after=await this.authority.resolve({actorId:input.actorId,now:instant(this.clock())});
    const completed=instant(this.clock());
    if(!after||policyFingerprint(after)!==policy||Date.parse(completed)>=Date.parse(read.validUntil))return null;
    return {fingerprint:read.fingerprint,validUntil:read.validUntil,snapshot:{actorId:input.actorId,asOf:input.now,
      projectionVersion:projection.version,input:payload}};
  }
  private cleanup(now:number){
    for(const [key,ticket] of this.tickets)if(ticket.expires<=now)this.tickets.delete(key);
    for(const [key,ticket] of this.rightsTickets)if(ticket.expires<=now)this.rightsTickets.delete(key);
  }
  async load(input:ReadInput):Promise<OwnerDoubleMajorSnapshot|null>{
    const result=await this.read(input);if(!result)return null;
    const issued=Date.parse(instant(this.clock())),expires=Math.min(issued+30_000,Date.parse(result.validUntil));
    if(issued>=expires)return null;
    this.cleanup(issued);
    const receipt=randomBytes(32).toString('hex');
    this.tickets.set(receipt,{input:{...input},fingerprint:result.fingerprint,issued,expires});
    return structuredClone({...result.snapshot,receipt});
  }
  private async current(input:{actorId:string;receipt:string;now:string}){
    const ticket=this.tickets.get(input.receipt);
    const now=Date.parse(instant(this.clock()));Time.parse(input.now);
    if(!ticket||ticket.input.actorId!==input.actorId||now<ticket.issued||now>=ticket.expires||
      Date.parse(input.now)<Date.parse(ticket.input.now))return null;
    const result=await this.read(ticket.input,input.now),completed=Date.parse(instant(this.clock()));
    if(!result||completed<now||completed>=ticket.expires||completed>=Date.parse(result.validUntil)||result.fingerprint!==ticket.fingerprint)return null;
    return {ticket,result};
  }
  async revalidate(input:{actorId:string;receipt:string;now:string}):Promise<boolean>{
    try{return !!await this.current(input);}catch{return false;}
  }
  /** Independent preauthorization: no private projection/transcript is read here. */
  async mayInspect(input:ReadInput):Promise<boolean>{
    try{
      Actor.parse(input.actorId);Time.parse(input.now);
      const now=instant(this.clock());
      if(Date.parse(input.now)>Date.parse(now))return false;
      const grants=await this.authority.resolve(input);
      if(!grants?.permissionRefs.size)return false;
      const fingerprint=policyFingerprint(grants),connection=await this.pool.connect();let open=false,allowed=false;
      try{
        await connection.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true;
        await connection.query("SET LOCAL statement_timeout='5s'");
        await connection.query("SELECT set_config('hufs.self_actor',$1,true)",[input.actorId]);
        const consent=await connection.query(`SELECT version,choices_json,updated_at FROM api_self_consents WHERE actor_id=$1
          AND choices_json->>'personalStorage'='true' AND updated_at<=LEAST($2::timestamptz,$3::timestamptz,clock_timestamp())`,[input.actorId,input.now,now]);
        allowed=consent.rows.length===1&&!!consent.rows[0]?.choices_json&&typeof consent.rows[0].choices_json==='object'&&
          (consent.rows[0].choices_json as Record<string,unknown>).personalStorage===true;
        await connection.query('COMMIT');open=false;
      }finally{if(open)try{await connection.query('ROLLBACK');}catch{/* deny */}connection.release();}
      const current=await this.authority.resolve({actorId:input.actorId,now:instant(this.clock())});
      return allowed&&!!current&&policyFingerprint(current)===fingerprint;
    }catch{return false;}
  }
  async authorize(input:Parameters<TrustedOwnerDoubleMajorRights['authorize']>[0]):Promise<{allowed:boolean;rightsReceipt?:string}>{
    try{
      const value=OwnerDoubleMajorAuditSchema.parse(input.check);
      const current=await this.current({actorId:input.actorId,receipt:input.sourceReceipt,now:input.now});
      if(!current)return {allowed:false};
      const snapshot={...current.result.snapshot,receipt:input.sourceReceipt};
      const expected=await createTrustedOwnerDoubleMajorSource({snapshots:{load:async()=>snapshot,revalidate:async()=>false}})
        .inspect({actorId:input.actorId,now:current.ticket.input.now});
      const fingerprint=canonicalProjectionHash(value);
      if(fingerprint!==canonicalProjectionHash(expected.check))return {allowed:false};
      const now=Date.parse(instant(this.clock()));
      if(now>=current.ticket.expires)return {allowed:false};
      this.cleanup(now);
      const rightsReceipt=randomBytes(32).toString('hex');
      this.rightsTickets.set(rightsReceipt,{actorId:input.actorId,sourceReceipt:input.sourceReceipt,fingerprint:current.ticket.fingerprint,expires:current.ticket.expires});
      return {allowed:true,rightsReceipt};
    }catch(error){if(error instanceof ReceiptAdmissionError)throw error;return {allowed:false};}
  }
  async revalidateRights(input:Parameters<TrustedOwnerDoubleMajorRights['revalidate']>[0]):Promise<boolean>{
    try{
      const right=this.rightsTickets.get(input.rightsReceipt);
      if(!right||right.actorId!==input.actorId||right.sourceReceipt!==input.sourceReceipt||Date.parse(instant(this.clock()))>=right.expires)return false;
      const current=await this.current({actorId:input.actorId,receipt:input.sourceReceipt,now:input.now});
      return !!current&&current.ticket.fingerprint===right.fingerprint&&Date.parse(instant(this.clock()))<right.expires;
    }catch{return false;}
  }
}
export function createPostgresOwnerDoubleMajorServices(options:{pool:ReviewerSqlPool;authority:OwnerCatalogAuthority;now?:()=>string}){
  const snapshots=new PostgresOwnerDoubleMajorSnapshotLoader(options.pool,options.authority,options.now);
  return {source:createTrustedOwnerDoubleMajorSource({snapshots}),rights:{
    mayInspect:snapshots.mayInspect.bind(snapshots),authorize:snapshots.authorize.bind(snapshots),revalidate:snapshots.revalidateRights.bind(snapshots),
  } satisfies TrustedOwnerDoubleMajorRights};
}
