import {z} from 'zod';
import {SourceClassSchema,TopicCodeSchema} from '../topics/index.js';
import {SafeLlmPacketSchema} from '../ai/index.js';

// TASK-18: additive vNext contracts. The existing v0.1.0 wire shapes are unchanged.
// These schemas validate types, causal timestamps and evidence shapes. Only a
// separate trusted server may decide permission, reviewer authority, truth or
// whether an original page is actually available.
const Iso=z.iso.datetime({offset:true});
const Sha256=z.string().regex(/^[a-f0-9]{64}$/);
const Token=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const StringText=z.string().trim().min(1).max(20000);
const PageIndex=z.number().int().min(0).max(199);
const CoPoint=z.number().finite().min(0).max(1);
const Cohort=z.number().int().min(1950).max(2200);
const MajorRole=z.enum(['PRIMARY','DOUBLE','MINOR']);
const GraduationTerm=z.string().regex(/^(19|20|21|22)\d{2}-[12]$/);
const ScopeSchema=z.strictObject({
  campuses:z.array(Token).min(1).max(8).optional(),
  colleges:z.array(Token).min(1).max(32).optional(),
  majorCodes:z.array(Token).min(1).max(32).optional(),
  /** Role restriction applies to the SAME major as majorCodes, not any unrelated major. */
  majorRoles:z.array(MajorRole).min(1).max(3).optional(),
  enrollmentStates:z.array(Token).min(1).max(12).optional(),
  admissionTypes:z.array(Token).min(1).max(16).optional(),
  /** Requires a verified official graduation candidate term; self-report is UNKNOWN. */
  graduationTermScope:z.array(GraduationTerm).min(1).max(24).optional(),
  /** Legacy closed interval. New one-ended restrictions use cohortMin/cohortMax. */
  cohortRange:z.tuple([Cohort,Cohort]).optional(),
  cohortMin:Cohort.optional(),
  cohortMax:Cohort.optional(),
}).superRefine((v,ctx)=>{
  if(v.cohortRange&&v.cohortRange[1]<v.cohortRange[0])
    ctx.addIssue({code:'custom',path:['cohortRange'],message:'Reversed cohort range'});
  if(v.cohortRange&&(v.cohortMin!==undefined||v.cohortMax!==undefined))
    ctx.addIssue({code:'custom',path:['cohortRange'],message:'Conflicting cohort representations'});
  if(v.cohortMin!==undefined&&v.cohortMax!==undefined&&v.cohortMin>v.cohortMax)
    ctx.addIssue({code:'custom',path:['cohortMin'],message:'Reversed one-ended cohort range'});
  for(const key of ['campuses','colleges','majorCodes','majorRoles',
    'enrollmentStates','admissionTypes','graduationTermScope'] as const){
    const list=v[key]??[];
    if(new Set(list).size!==list.length)
      ctx.addIssue({code:'custom',path:[key],message:'Duplicate scope'});
  }
});
export type EvidenceScope=z.infer<typeof ScopeSchema>;
export const EvidenceScopeSchema=ScopeSchema;
export interface EvidenceActorScope {
  // Explicit undefined is accepted at this server-only boundary to represent
  // unverified/withheld facts; the matcher treats them as missing, never YES.
  campus?:string|undefined;
  college?:string|undefined;
  enrollmentState?:string|undefined;
  admissionType?:string|undefined;
  majorCode?:string|undefined; // legacy single official major, only without a role restriction
  majors?:readonly {code:string;role:'PRIMARY'|'DOUBLE'|'MINOR'}[]|undefined;
  cohort?:number|undefined;
  graduationTerm?:string|undefined;
  graduationTermVerified?:boolean|undefined;
}

/** Permission is independent. This checks ONLY trusted, reviewed academic scope.
 * Unknown/missing verified actor facts fail closed. No browser data is authoritative.
 */
export function matchesEvidenceScope(scope:EvidenceScope|undefined,actor:EvidenceActorScope|undefined):boolean {
  if(scope===undefined)return true;
  const checked=EvidenceScopeSchema.safeParse(scope);
  if(!checked.success)return false;
  const s=checked.data;
  const member=(list:readonly string[]|undefined,actual:string|undefined)=>
    !list?.length || (actual!==undefined&&list.includes(actual));
  if(!member(s.campuses,actor?.campus)
    ||!member(s.colleges,actor?.college)
    ||!member(s.enrollmentStates,actor?.enrollmentState)
    ||!member(s.admissionTypes,actor?.admissionType))return false;
  if(s.graduationTermScope?.length
    &&(actor?.graduationTermVerified!==true
      ||!member(s.graduationTermScope,actor.graduationTerm)))return false;
  const majorCodes=s.majorCodes??[],roles=s.majorRoles??[];
  if(majorCodes.length||roles.length){
    const majors=actor?.majors??(actor?.majorCode&&roles.length===0
      ?[{code:actor.majorCode,role:'PRIMARY' as const}]:[]);
    if(!majors.some(m=>(!majorCodes.length||majorCodes.includes(m.code))
      &&(!roles.length||roles.includes(m.role))))return false;
  }
  if(s.cohortRange||s.cohortMin!==undefined||s.cohortMax!==undefined){
    if(!Number.isInteger(actor?.cohort))return false;
    const year=actor!.cohort!;
    if(s.cohortRange&&(year<s.cohortRange[0]||year>s.cohortRange[1]))return false;
    if(s.cohortMin!==undefined&&year<s.cohortMin)return false;
    if(s.cohortMax!==undefined&&year>s.cohortMax)return false;
  }
  return true;
}

export const SourceRevisionVNextSchema=z.strictObject({
  revisionId:Token,
  sourceId:Token,
  supersedes:Token.optional(),
  mediaKind:z.enum(['HTML','IMAGE','PDF','TEXT']),
  originalSha256:Sha256,
  contentSha256:Sha256,
  sourceClass:SourceClassSchema,
  permissionRef:Token,
  provenance:z.enum(['REAL_APPROVED','SYNTHETIC','RESEARCH_ONLY']),
  status:z.enum(['ACTIVE','NEEDS_REVIEW','STALE','RETRACTED','BLOCKED_RIGHTS']),
  changeKind:z.enum(['NEW','CORRECTED','EXTENDED','CANCELLED','UNKNOWN']),
  publishedAt:Iso.optional(),
  fetchedAt:Iso,
  lastCheckedAt:Iso,
  lastVerifiedAt:Iso.optional(),
  validFrom:Iso.optional(),
  validUntil:Iso.optional(),
  applicableScope:ScopeSchema.optional(),
  topicCodes:z.array(TopicCodeSchema).max(5).default([]),
}).superRefine((v,ctx)=>{
  const epoch=(s:string)=>Date.parse(s);
  if(v.supersedes===v.revisionId)ctx.addIssue({
    code:'custom',path:['supersedes'],message:'Self-supersession'});
  if(v.changeKind==='NEW'&&v.supersedes)ctx.addIssue({
    code:'custom',path:['changeKind'],message:'NEW cannot supersede another revision'});
  if(v.changeKind!=='NEW'&&!v.supersedes)ctx.addIssue({
    code:'custom',path:['supersedes'],message:'Change requires a previous revision'});
  if(epoch(v.lastCheckedAt)<epoch(v.fetchedAt))ctx.addIssue({
    code:'custom',path:['lastCheckedAt'],message:'Check predates fetch'});
  if(v.lastVerifiedAt&&epoch(v.lastVerifiedAt)<epoch(v.fetchedAt))ctx.addIssue({
    code:'custom',path:['lastVerifiedAt'],message:'Verification predates fetch'});
  if(v.status==='ACTIVE'&&!v.lastVerifiedAt)ctx.addIssue({
    code:'custom',path:['lastVerifiedAt'],message:'An active source needs independent verification'});
  if(v.status==='ACTIVE'&&v.sourceClass==='RESEARCH_REFERENCE_ONLY')ctx.addIssue({
    code:'custom',path:['sourceClass'],message:'Research-only source cannot become active'});
  if(v.status==='ACTIVE'&&v.provenance==='RESEARCH_ONLY')ctx.addIssue({
    code:'custom',path:['provenance'],message:'Research-only provenance cannot become active'});
  if(v.status==='ACTIVE'&&v.changeKind==='CANCELLED')ctx.addIssue({
    code:'custom',path:['changeKind'],message:'Cancellation must not be active'});
  if(v.validFrom&&v.validUntil&&epoch(v.validFrom)>=epoch(v.validUntil))ctx.addIssue({
    code:'custom',path:['validUntil'],message:'Invalid effective range'});
  if(new Set(v.topicCodes).size!==v.topicCodes.length)ctx.addIssue({
    code:'custom',path:['topicCodes'],message:'Duplicate topic'});
});
export type SourceRevisionVNext=z.infer<typeof SourceRevisionVNextSchema>;

const Bbox=z.tuple([CoPoint,CoPoint,CoPoint,CoPoint]).refine(
  p=>p[0]<p[2]&&p[1]<p[3],{message:'Degenerate or inverted image bbox'},
);
export const SourceSpanVNextSchema=z.discriminatedUnion('kind',[
  z.strictObject({
    kind:z.literal('TEXT'),
    sourceRevisionId:Token,
    paragraphId:Token,
    startCodePoint:z.number().int().nonnegative().max(200000),
    endCodePoint:z.number().int().positive().max(200000),
    quote:StringText,
  }).refine(v=>v.startCodePoint<v.endCodePoint,{
    message:'Invalid Unicode codepoint interval',
  }).refine(v=>Array.from(v.quote).length===v.endCodePoint-v.startCodePoint,{
    message:'Quote length and codepoint interval differ',
  }),
  z.strictObject({
    kind:z.literal('IMAGE'),
    sourceRevisionId:Token,
    assetId:Token,
    originalSha256:Sha256,
    pageIndex:PageIndex,
    bboxNorm:Bbox,
    ocrLineIds:z.array(Token).min(1).max(60),
    quote:StringText,
    extractionEngine:z.enum(['CLOVA_OCR_GENERAL','HCX_005_VISION','HUMAN']),
    transformVersion:Token,
  }).refine(v=>new Set(v.ocrLineIds).size===v.ocrLineIds.length,{
    message:'Duplicate OCR line references',
  }),
]);
export type SourceSpanVNext=z.infer<typeof SourceSpanVNextSchema>;

/** Requires the *actual* trusted source paragraph; invented quotes are rejected. */
export function matchesTextSpan(
  span:SourceSpanVNext,
  paragraph:{revisionId:string;paragraphId:string;text:string},
):boolean{
  if(span.kind!=='TEXT'||span.sourceRevisionId!==paragraph.revisionId
    ||span.paragraphId!==paragraph.paragraphId)return false;
  const codepoints=Array.from(paragraph.text);
  return span.endCodePoint<=codepoints.length
    &&codepoints.slice(span.startCodePoint,span.endCodePoint).join('')===span.quote;
}

/** IMAGE spans need original hash, page/transform and trusted OCR line reference. */
export function matchesImageSpan(
  span:SourceSpanVNext,
  original:{revisionId:string;assetId:string;originalSha256:string;pageCount:number;
    transformVersion:string;ocrLines:readonly {id:string;text:string}[]},
):boolean{
  if(span.kind!=='IMAGE')return false;
  if(original.revisionId!==span.sourceRevisionId
    ||original.assetId!==span.assetId
    ||original.originalSha256!==span.originalSha256
    ||original.transformVersion!==span.transformVersion
    ||span.pageIndex>=original.pageCount)return false;
  const lines=new Map(original.ocrLines.map(line=>[line.id,line.text]));
  if(!span.ocrLineIds.every(id=>lines.has(id)))return false;
  const quoted=span.ocrLineIds.map(id=>lines.get(id)!).join(' ');
  return quoted.includes(span.quote);
}

export const VerifiedClaimVNextSchema=z.strictObject({
  claimId:Token,
  sourceRevisionId:Token,
  field:Token,
  value:z.union([z.string().min(1),z.number().finite(),z.boolean()]),
  evidence:z.array(SourceSpanVNextSchema).min(1).max(12),
  state:z.enum(['CANDIDATE','NEEDS_REVIEW','VERIFIED','REJECTED','STALE']),
  risk:z.enum(['LOW','HIGH']),
  claimCheckedAt:Iso.optional(),
  reviewerId:Token.optional(),
  dateKind:z.enum(['APPLY','STUDENT','ADMIN','EVENT']).optional(),
}).superRefine((v,ctx)=>{
  if(v.evidence.some(span=>span.sourceRevisionId!==v.sourceRevisionId))
    ctx.addIssue({code:'custom',path:['evidence'],message:'Mixed source revisions'});
  if(v.state==='VERIFIED'&&(!v.claimCheckedAt||!v.reviewerId))
    ctx.addIssue({code:'custom',path:['state'],message:'Verification requires a reviewer and timestamp'});
  if(v.dateKind&&typeof v.value!=='string')
    ctx.addIssue({code:'custom',path:['dateKind'],message:'Dates must be explicit ISO strings'});
  if(v.dateKind&&typeof v.value==='string'&&!Iso.safeParse(v.value).success)
    ctx.addIssue({code:'custom',path:['value'],message:'Date value must be zoned ISO'});
});
export type VerifiedClaimVNext=z.infer<typeof VerifiedClaimVNextSchema>;

export const RetrievalEnvelopeVNextSchema=z.strictObject({
  queryVersion:Token,
  asOf:Iso,
  sourceRevisionIds:z.array(Token).max(12),
  permissionPolicyVersion:Token,
  retrievalConfigVersion:Token,
  retrievalState:z.enum([
    'READY','NO_EVIDENCE','STALE','CONFLICT','BLOCKED_RIGHTS','UNKNOWN',
  ]),
  evidence:z.array(SourceSpanVNextSchema).max(12),
}).superRefine((v,ctx)=>{
  const references=new Set(v.sourceRevisionIds);
  if(new Set(v.sourceRevisionIds).size!==v.sourceRevisionIds.length)
    ctx.addIssue({code:'custom',path:['sourceRevisionIds'],message:'Duplicate revision'});
  if(v.evidence.some(span=>!references.has(span.sourceRevisionId)))
    ctx.addIssue({code:'custom',path:['evidence'],message:'Evidence from unlisted revision'});
  if(v.retrievalState==='READY'&&(!v.evidence.length||!v.sourceRevisionIds.length))
    ctx.addIssue({code:'custom',path:['retrievalState'],message:'READY needs evidence'});
  if(v.retrievalState!=='READY'&&(v.evidence.length||v.sourceRevisionIds.length))
    ctx.addIssue({code:'custom',path:['retrievalState'],message:'No unverified excerpts in failure envelope'});
});
export type RetrievalEnvelopeVNext=z.infer<typeof RetrievalEnvelopeVNextSchema>;

/** Durable revision event: a content change never silently republishes old claims. */
export const RevisionInvalidationVNextSchema=z.strictObject({
  eventId:Token,
  sourceId:Token,
  previousRevisionId:Token,
  newRevisionId:Token,
  changedAt:Iso,
  reason:z.enum(['CORRECTED','EXTENDED','CANCELLED','RIGHTS_REVOKED','VERIFICATION_STALE']),
  permissionPolicyVersion:Token,
  invalidates:z.array(z.enum(['RETRIEVAL','CLAIMS','FEED','NOTICES','AI_CACHE']))
    .min(1).max(5),
}).superRefine((v,ctx)=>{
  if(v.previousRevisionId===v.newRevisionId)
    ctx.addIssue({code:'custom',path:['newRevisionId'],message:'New revision must be distinct'});
  if(new Set(v.invalidates).size!==v.invalidates.length)
    ctx.addIssue({code:'custom',path:['invalidates'],message:'Duplicate invalidation target'});
  if(v.reason==='CANCELLED'&&!v.invalidates.includes('FEED'))
    ctx.addIssue({code:'custom',path:['invalidates'],message:'Cancellation must invalidate feed'});
  if(!v.invalidates.includes('RETRIEVAL')||!v.invalidates.includes('CLAIMS'))
    ctx.addIssue({code:'custom',path:['invalidates'],message:'Stale evidence caches cannot remain active'});
});
export type RevisionInvalidationVNext=z.infer<typeof RevisionInvalidationVNextSchema>;

export const DecisionAdviceVNextSchema=z.strictObject({
  model:z.literal('laya-multilingual'),
  modelRevision:Token,
  inputHash:Sha256,
  optionsVersion:Token,
  decision:z.enum(['SKIP','OCR_ONLY','ESCALATE_VISION','HUMAN_REVIEW']),
  confidence:z.number().finite().min(0).max(1).optional(),
  policyOverridden:z.boolean(),
});
export type DecisionAdviceVNext=z.infer<typeof DecisionAdviceVNextSchema>;

/** A separate vNext adapter, not a mutation of the existing SafeLlmPacket. */
export const EvidenceBoundPacketVNextSchema=z.strictObject({
  packet:SafeLlmPacketSchema,
  retrieval:RetrievalEnvelopeVNextSchema,
  providerInputPermission:z.enum(['ALLOWED','BLOCKED']),
  sourceVersion:Token,
  permissionVersion:Token,
  mediaExtractorVersion:Token.optional(),
}).superRefine((v,ctx)=>{
  if(v.providerInputPermission!=='ALLOWED'||v.retrieval.retrievalState!=='READY')
    ctx.addIssue({code:'custom',path:['retrieval'],message:'Uncleared evidence cannot be sent to AI'});
  if(!v.retrieval.sourceRevisionIds.includes(v.sourceVersion))
    ctx.addIssue({code:'custom',path:['sourceVersion'],message:'Source revision not in retrieval'});
  if(v.permissionVersion!==v.retrieval.permissionPolicyVersion)
    ctx.addIssue({code:'custom',path:['permissionVersion'],message:'Stale permission version'});
  if(v.retrieval.evidence.some(x=>x.kind==='IMAGE')&&!v.mediaExtractorVersion)
    ctx.addIssue({code:'custom',path:['mediaExtractorVersion'],message:'Image extraction version required'});
});
export type EvidenceBoundPacketVNext=z.infer<typeof EvidenceBoundPacketVNextSchema>;
export * from './source-jobs.js';
