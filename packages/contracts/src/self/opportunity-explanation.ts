import {z} from 'zod';

const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Utc=z.iso.datetime({offset:true});
/** Single already-visible candidate only. Browser input never grants access. */
export const OpportunityExplanationRequestSchema=z.strictObject({
  asOf:Utc,sourceRevisionId:Ref,rankConfigVersion:Ref,
});
export const OpportunityExplanationReasonSchema=z.enum([
  'HIDDEN_BY_USER','DEADLINE_PASSED','ELIGIBILITY_NOT_MET','SOURCE_NEEDS_REVIEW',
  'LOW_RELEVANCE','OUTRANKED','NOT_EVALUATED',
]);
const Base={opportunityId:Ref,...OpportunityExplanationRequestSchema.shape,
  provenance:z.literal('CODE_RULES')};
export const OpportunityExplanationResponseSchema=z.discriminatedUnion('state',[
  z.strictObject({...Base,state:z.literal('FEATURED'),evidenceRefs:z.array(Ref).max(30)}),
  z.strictObject({...Base,state:z.literal('NOT_FEATURED'),
    reason:OpportunityExplanationReasonSchema,
    notes:z.array(z.enum(['ELIGIBILITY_UNKNOWN','NOT_EVALUATED'])).max(1),
    evidenceRefs:z.array(Ref).max(30),
  }),
]).superRefine((v,ctx)=>{
  if(new Set(v.evidenceRefs).size!==v.evidenceRefs.length)
    ctx.addIssue({code:'custom',path:['evidenceRefs'],message:'Duplicate evidence'});
  if(v.state==='NOT_FEATURED'){
    // A hidden or unevaluated item must not reveal any evaluation or hidden
    // student section. Unknown is never an assertion of ineligibility.
    if(['HIDDEN_BY_USER','NOT_EVALUATED'].includes(v.reason)
      &&(v.notes.length||v.evidenceRefs.length))
      ctx.addIssue({code:'custom',message:'No evaluation attached to hidden or unevaluated candidate'});
    if(v.reason==='ELIGIBILITY_NOT_MET'&&v.notes.length)
      ctx.addIssue({code:'custom',path:['notes'],message:'Unknown is not a failed qualification'});
  }
});
export type OpportunityExplanationRequest=z.infer<typeof OpportunityExplanationRequestSchema>;
export type OpportunityExplanationResponse=z.infer<typeof OpportunityExplanationResponseSchema>;
