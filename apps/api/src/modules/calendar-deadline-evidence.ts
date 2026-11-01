import {z} from 'zod';
import {ISODateTimeSchema,OpportunitySchema} from '@hufs-one/contracts';
import type {Opportunity} from '@hufs-one/contracts';
import type {Notice} from '../../../../packages/core/src/notices/notice.js';
import {resolveDeadlineClaims} from '../../../../packages/core/src/normalization/claims.js';
import type {ClaimRecord,DeadlineField} from '../../../../packages/core/src/normalization/claims.js';

const Ref=z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:@-]+$/);
const QuoteSpan=z.strictObject({
  kind:z.literal('TEXT'),sourceRevisionId:Ref,paragraphId:Ref,
  startCodePoint:z.number().int().nonnegative(),
  endCodePoint:z.number().int().positive(),
  quote:z.string().min(1).max(1500),
});
const DateClaim=z.strictObject({
  claimId:Ref,sourceRevisionId:Ref,
  field:z.enum(['applyClosesAt','studentDeadline','adminReportDeadline']),
  value:ISODateTimeSchema,
  state:z.enum(['CANDIDATE','NEEDS_REVIEW','VERIFIED','REJECTED','STALE']),
  dateKind:z.enum(['APPLY','STUDENT','ADMIN','EVENT']),
  claimCheckedAt:ISODateTimeSchema,
  reviewerId:Ref,evidence:z.array(QuoteSpan).min(1).max(6),
});
/** Read only from independently approved PostgreSQL input_json and current source scope.
 * Neither an HTTP caller nor a model may submit this as an authorization proof. */
export const CalendarDeadlineProofSchema=z.strictObject({
  kind:z.enum(['OPPORTUNITY','NOTICE']),itemId:Ref,sourceRevisionId:Ref,
  paragraphs:z.array(z.strictObject({revisionId:Ref,paragraphId:Ref,
    text:z.string().min(1).max(4000)})).min(1).max(40),
  claims:z.array(DateClaim).min(1).max(20),
}).superRefine((v,ctx)=>{
  if(new Set(v.claims.map(c=>c.claimId)).size!==v.claims.length)
    ctx.addIssue({code:'custom',message:'Duplicate claimId'});
  if(new Set(v.paragraphs.map(p=>p.paragraphId)).size!==v.paragraphs.length)
    ctx.addIssue({code:'custom',message:'Duplicate paragraphId'});
  if(v.claims.some(c=>c.sourceRevisionId!==v.sourceRevisionId)
    ||v.paragraphs.some(p=>p.revisionId!==v.sourceRevisionId))
    ctx.addIssue({code:'custom',message:'Proof must bind the exact source revision'});
});
export type CalendarDeadlineProof=z.infer<typeof CalendarDeadlineProofSchema>;

export interface CalendarDeadlineVerifiedProjection{
  opportunities:Opportunity[];
  notices:Notice[];
  /** Server-only claim→item audit. Source-projection content and this receipt
   * remain inside a trusted DB transaction and its authorization version. */
  acceptedClaimIdsByOpportunity:Readonly<Record<string,readonly string[]>>;
}

/**
 * Build the effective dates from current-revision, asOf-verified TEXT claims,
 * never merely from cached projection fields. The same function can be called
 * by a trusted approval writer before persisting a new immutable projection.
 *
 * Legacy synthetic demos may retain explicitly fictional dates; real notices
 * and real opportunities are stripped to UNKNOWN until source/rights/claims
 * are independently approved. A conflicting pre-filled REAL date is rejected,
 * rather than silently laundering it through a different verified claim.
 */
export function verifyCalendarDeadlineProjection(input:{
  opportunities:readonly Opportunity[];
  notices:readonly Notice[];
  asOf:string;
  actorId:string;
  proofs:readonly CalendarDeadlineProof[];
  authorizedRevisionIds:readonly string[];
  revisionProvenance:Readonly<Record<string,'SYNTHETIC'|'REAL_APPROVED'|'RESEARCH_ONLY'>>;
  datasetMode:'SYNTHETIC'|'REAL_CONSENTED'|'MIXED';
}):CalendarDeadlineVerifiedProjection{
  const asOf=ISODateTimeSchema.parse(input.asOf);
  const authorized=new Set(input.authorizedRevisionIds);
  const proofByItem=new Map<string,CalendarDeadlineProof>();
  const claimed=new Set<string>();
  for(const raw of input.proofs){
    const proof=CalendarDeadlineProofSchema.parse(raw);
    const key=proof.kind+'\u0000'+proof.itemId;
    if(proofByItem.has(key))throw new Error('Duplicate approved deadline proof for one item');
    proofByItem.set(key,proof);
    for(const claim of proof.claims){
      if(claimed.has(claim.claimId))throw new Error('Deadline claim reused between records');
      claimed.add(claim.claimId);
    }
  }
  const verify=(kind:'NOTICE'|'OPPORTUNITY',id:string,revisionId:string,field:DeadlineField,
    rawDate?:string):{value?:string;acceptedIds:string[]}=>{
    const provenance=input.revisionProvenance[revisionId];
    if(input.datasetMode==='SYNTHETIC'&&provenance==='SYNTHETIC')
      return {...(rawDate===undefined?{}:{value:rawDate}),acceptedIds:[]};
    if(provenance==='SYNTHETIC'&&input.datasetMode==='MIXED')
      return {...(rawDate===undefined?{}:{value:rawDate}),acceptedIds:[]};
    if(provenance!=='REAL_APPROVED'||!authorized.has(revisionId))
      return {acceptedIds:[]};
    const proof=proofByItem.get(kind+'\u0000'+id);
    if(!proof||proof.sourceRevisionId!==revisionId)return {acceptedIds:[]};
    const checked=proof.claims.filter(c=>c.reviewerId!==input.actorId);
    const resolved=resolveDeadlineClaims(checked as ClaimRecord[],{
      asOf,currentRevisionId:revisionId,paragraphs:proof.paragraphs,
    });
    const value=resolved.dates[field];
    if(!value||resolved.conflicts.includes(field))return {acceptedIds:[]};
    if(rawDate!==undefined&&Date.parse(rawDate)!==Date.parse(value))
      throw new Error('Approved projection deadline does not match verified source claim');
    const acceptedIds=checked.filter(c=>c.field===field&&c.state==='VERIFIED'
      &&Date.parse(c.value)===Date.parse(value)
      &&resolveDeadlineClaims([c] as ClaimRecord[],{
        asOf,currentRevisionId:revisionId,paragraphs:proof.paragraphs,
      }).dates[field]!==undefined).map(c=>c.claimId).sort();
    return {value,acceptedIds};
  };
  const acceptedClaimIdsByOpportunity:Record<string,string[]>={};
  const opportunities=input.opportunities.map(raw=>{
    const o=OpportunitySchema.parse(raw);
    const {applyClosesAt:rawDate,...without}=o;
    const evidence=verify('OPPORTUNITY',o.id,o.sourceSnapshotId,'applyClosesAt',rawDate);
    if(evidence.acceptedIds.length)acceptedClaimIdsByOpportunity[o.id]=evidence.acceptedIds;
    const mayKeep=rawDate===undefined||evidence.value!==undefined;
    return OpportunitySchema.parse({...without,
      ...(evidence.value?{applyClosesAt:evidence.value}:{}),
      ...(mayKeep?{}:{deadlineKind:'UNKNOWN'})});
  });
  const notices=input.notices.map(n=>{
    const {studentDeadline:rawStudent,adminReportDeadline:rawAdmin,...without}=n;
    const student=verify('NOTICE',n.id,n.sourceSnapshotId,'studentDeadline',rawStudent);
    const admin=verify('NOTICE',n.id,n.sourceSnapshotId,'adminReportDeadline',rawAdmin);
    const refs=[...new Set([...n.evidenceRefs,...student.acceptedIds,...admin.acceptedIds])];
    return {...without,evidenceRefs:refs,
      ...(student.value?{studentDeadline:student.value}:{}),
      ...(admin.value?{adminReportDeadline:admin.value}:{})};
  });
  return {opportunities,notices,acceptedClaimIdsByOpportunity};
}
