import {randomBytes} from 'node:crypto';
import {OwnerReceipts} from '../auth/owner-receipts.js';
import {z} from 'zod';
import {OwnerPlanCheckApprovalReceiptSchema,OwnerWorkspaceValueSchema} from '@hufs-one/contracts';
import type {ReviewerSqlPool} from '../auth/reviewer-postgres.js';
import {PostgresApprovedOwnerReader,canonicalProjectionHash} from '../opportunities/owner-catalog-postgres.js';
import type {OwnerCatalogAuthority} from '../opportunities/owner-catalog-postgres.js';
import type {ApprovedOwnerStudyPlanSnapshot,TrustedOwnerStudyPlanSnapshotLoader} from './owner-study-plan-source.js';

const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Term=z.string().regex(/^(19|20|21)\d{2}-[12]$/);
const Time=z.iso.datetime({offset:true});
const Units=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Attempt=z.strictObject({attemptToken:Ref,canonicalCourseId:Ref,creditUnits:Units,
  ledger:z.enum(['EARNED','IN_PROGRESS']),areaIds:z.array(Ref).max(100),
  recognition:z.enum(['RECOGNIZED','PENDING','EXCLUDED']),
  term:z.string().regex(/^(19|20|21)\d{2}-[12SW]$/).optional(),
  supersedesAttemptToken:Ref.optional(),retakeApprovalRef:Ref.optional()});
const Prerequisite=z.strictObject({canonicalCourseId:Ref,requiresCourseIds:z.array(Ref).max(100),
  evidenceRefs:z.array(Ref).max(30)});
const Section=z.strictObject({canonicalCourseId:Ref,sectionId:Ref,
  term:z.string().regex(/^(19|20|21)\d{2}-[12SW]$/),
  meetings:z.array(z.strictObject({day:z.enum(['MON','TUE','WED','THU','FRI','SAT','SUN']),
    startMinute:z.number().int().min(0).max(1439),endMinute:z.number().int().min(1).max(1440),
  }).refine(x=>x.startMinute<x.endMinute)).max(30),
  evidenceRefs:z.array(Ref).max(30),verifiedAt:Time});
const Link=z.strictObject({evidenceRef:Ref,href:z.url().refine(value=>{
  const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;
}),verifiedAt:Time});
/** Private operator projection format, never a browser request or approval API.
 * Approval of these fixed inputs does not approve mutable student plan drafts. */
export const ApprovedOwnerPlanInputSchema=z.strictObject({term:Term,
  transcript:z.strictObject({version:Ref,state:z.literal('APPROVED'),attempts:z.array(Attempt).max(2000)}),
  catalog:z.strictObject({version:Ref,courseCreditUnits:z.record(Ref,Units)
    .refine(table=>Object.keys(table).length<=5000),sections:z.array(Section).max(5000).optional()}),
  rulePack:z.strictObject({version:Ref,state:z.literal('APPROVED'),termRules:z.strictObject({
    creditCapUnits:Units,capEvidenceRefs:z.array(Ref).min(1).max(30),
    prerequisites:z.array(Prerequisite).max(5000).optional()})}),
  approval:OwnerPlanCheckApprovalReceiptSchema,evidenceLinks:z.array(Link).max(100),
  visibility:z.strictObject({mode:z.enum(['REDACTED','OWNER_VERIFIED','GRANT_SCOPED']),
    allowedCourseRefs:z.array(Ref).max(5000),grantVersion:Ref.optional()}),
});
type ApprovedInput=Omit<ApprovedOwnerStudyPlanSnapshot,'actorId'|'asOf'|'receipt'|'plan'>;
type Input=Parameters<TrustedOwnerStudyPlanSnapshotLoader['load']>[0];
type Ticket={input:Input;fingerprint:string;expires:number;issued:number};
const integer=z.union([z.number(),z.string().regex(/^[1-9][0-9]*$/)])
  .transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const Row=z.object({actor_id:Ref,kind:z.literal('STUDY_PLAN'),item_id:z.string().regex(/^[A-Za-z0-9_-]{1,90}$/),
  version:integer,value_json:OwnerWorkspaceValueSchema,updated_at:z.unknown()});
const instant=(value:unknown)=>Time.parse(value instanceof Date?value.toISOString():value);

/** SELECT-only snapshot loader. The independent HTTP rights/approval gates are
 * still mandatory. No import, seed, role, source approval or live DB is created. */
export class PostgresOwnerStudyPlanSnapshotLoader implements TrustedOwnerStudyPlanSnapshotLoader {
  private readonly reader:PostgresApprovedOwnerReader;
  private readonly tickets=new OwnerReceipts<Ticket>(value=>value.input.actorId);
  constructor(pool:ReviewerSqlPool,authority:OwnerCatalogAuthority,
    private readonly clock:()=>string=()=>new Date().toISOString()){
    this.reader=new PostgresApprovedOwnerReader(pool,authority,clock);
  }
  private async read(input:Input,currentNow=input.now){
    Ref.parse(input.actorId);Term.parse(input.term);Time.parse(input.now);Time.parse(currentNow);
    const read=await this.reader.read({actorId:input.actorId,kind:'PLAN_INPUT',entityId:input.term,asOf:input.now},
      currentNow,async(c,projections)=>{
        if(projections.length!==1)return null; // no private draft read without approved input
        // Include every current draft, even if changed after a prior check's
        // asOf. Filtering updated_at here would hide late additions on replay.
        const result=await c.query(`SELECT actor_id,kind,item_id,version,value_json,updated_at
          FROM api_self_workspace_records WHERE actor_id=$1 AND kind='STUDY_PLAN' AND deleted_at IS NULL
          ORDER BY item_id COLLATE "C" LIMIT 201`,[input.actorId]);
        return result.rows;
      });
    if(!read||read.rows.length!==1)return null;
    const projection=read.rows[0]!;
    if(Buffer.byteLength(JSON.stringify(projection.payload_json))>250_000)
      throw new Error('Approved plan input exceeds bound');
    // JSONB cannot contain undefined. The strict schema validates optional
    // fields before conversion to the existing academic bridge's exact types.
    const payload=ApprovedOwnerPlanInputSchema.parse(projection.payload_json) as ApprovedInput;
    if(payload.term!==input.term||payload.approval.consentVersion!==read.consentVersion
      ||payload.approval.rulePackVersion!==payload.rulePack.version
      ||Date.parse(payload.approval.verifiedAt)>Date.parse(input.now)
      ||payload.evidenceLinks.some(link=>Date.parse(link.verifiedAt)>Date.parse(input.now)))
      throw new Error('Approved plan input scope mismatch');
    if(!Array.isArray(read.extra)||read.extra.length>200)throw new Error('Plan workspace exceeds bound');
    const rows=read.extra.map(raw=>{
      const row=Row.parse(raw),updatedAt=instant(row.updated_at);
      if(row.actor_id!==input.actorId||row.value_json.kind!=='STUDY_PLAN'
        ||Date.parse(updatedAt)>Date.parse(input.now))throw new Error('Plan workspace scope mismatch');
      return {itemId:row.item_id,version:row.version,value:row.value_json,updatedAt};
    }).sort((a,b)=>a.itemId<b.itemId?-1:a.itemId>b.itemId?1:0);
    if(new Set(rows.map(row=>row.itemId)).size!==rows.length)throw new Error('Ambiguous plan workspace');
    const planVersion='plan-'+canonicalProjectionHash({actorId:input.actorId,term:input.term,rows});
    return {fingerprint:read.fingerprint,validUntil:read.validUntil,snapshot:{...payload,actorId:input.actorId,asOf:input.now,
      plan:{version:planVersion,items:rows.map(row=>row.value)}}};
  }
  async load(input:Input):Promise<ApprovedOwnerStudyPlanSnapshot|null>{
    const result=await this.read(input);if(!result)return null;
    const now=Date.parse(instant(this.clock()));
    const expires=Math.min(now+30_000,Date.parse(result.validUntil));
    if(now>=expires)return null;
    for(const [key,ticket] of this.tickets)if(ticket.expires<=now)this.tickets.delete(key);
    const receipt=randomBytes(32).toString('hex');
    this.tickets.set(receipt,{input:{...input},fingerprint:result.fingerprint,issued:now,expires});
    return structuredClone({...result.snapshot,receipt});
  }
  async revalidate(input:Parameters<TrustedOwnerStudyPlanSnapshotLoader['revalidate']>[0]):Promise<boolean>{
    return this.validate(input,true);
  }
  /** Same bounded fresh SQL validation, retained for the HTTP source/rights/core
   * gates that independently validate one disclosure several times. Existing
   * revalidate remains consume-once, including cross-owner attempts. */
  async revalidateCurrent(input:Parameters<TrustedOwnerStudyPlanSnapshotLoader['revalidate']>[0]):Promise<boolean>{
    return this.validate(input,false);
  }
  private async validate(input:Parameters<TrustedOwnerStudyPlanSnapshotLoader['revalidate']>[0],consume:boolean):Promise<boolean>{
    const ticket=this.tickets.get(input.receipt);if(consume)this.tickets.delete(input.receipt);
    try{
      const now=Date.parse(instant(this.clock()));
      Time.parse(input.now);
      if(!ticket||ticket.input.actorId!==input.actorId||now<ticket.issued||now>=ticket.expires
        ||Date.parse(input.now)<Date.parse(ticket.input.now))return false;
      // Preserve the original asOf for temporal inputs; reader's independent
      // clock and live policy still check current expiry/withdrawal. The SQL
      // draft query sees late writes and changes the snapshot fingerprint.
      const current=await this.read(ticket.input,input.now);
      const completed=Date.parse(instant(this.clock()));
      return completed>=now&&completed<ticket.expires&&current?.fingerprint===ticket.fingerprint
        &&completed<Date.parse(current.validUntil);
    }catch{return false;}
  }
}
