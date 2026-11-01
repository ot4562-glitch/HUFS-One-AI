import {z} from 'zod';
import {
  OpportunityExplanationRequestSchema,OpportunityExplanationReasonSchema,
  OpportunityExplanationResponseSchema,
} from '@hufs-one/contracts';
import type {
  OpportunityExplanationRequest,OpportunityExplanationResponse,
} from '@hufs-one/contracts';

const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Binding=OpportunityExplanationRequestSchema.extend({opportunityId:Ref});
export type OpportunityExplanationBinding=OpportunityExplanationRequest&{opportunityId:string};

/** Provider-neutral shape of an existing code report. This does not import,
 * implement, activate, or approve the unmerged recommendation engine.
 * Unrelated candidates are never projected or semantically inspected.
 */
const Report=z.strictObject({
  asOf:z.iso.datetime({offset:true}),rankConfigVersion:Ref,
  provenance:z.literal('CODE_RULES'),
  featuredIds:z.array(Ref).max(500),items:z.array(z.unknown()).max(500),
});
const Selected=z.strictObject({
  opportunityId:Ref,reason:OpportunityExplanationReasonSchema,
  notes:z.array(z.enum(['ELIGIBILITY_UNKNOWN','NOT_EVALUATED'])).max(1),
  evidenceRefs:z.array(Ref).max(30),
  // The internal report may include these fields. Never copy them into wire
  // output or derive a new decision from private fields/free-form wording.
  text:z.unknown().optional(),fields:z.unknown().optional(),placement:z.unknown().optional(),
});

/** Select exactly one already-permitted candidate for the private HTTP gate.
 * The caller must bind the report to a trusted receipt/source revision and
 * current scoped feed inputs. This structural mapper grants NO authorization:
 * independent rights and reviewed-core approval are still required by HTTP.
 * Absent/mismatched/ambiguous reports return null rather than a guessed reason.
 */
export function projectOpportunityExplanation(
  report:unknown,binding:OpportunityExplanationBinding,
):OpportunityExplanationResponse|null{
  const scope=Binding.safeParse(binding),parsed=Report.safeParse(report);
  if(!scope.success||!parsed.success)return null;
  const input=scope.data,raw=parsed.data;
  if(raw.rankConfigVersion!==input.rankConfigVersion
    ||Date.parse(raw.asOf)!==Date.parse(input.asOf))return null;
  const featured=raw.featuredIds.filter(id=>id===input.opportunityId).length;
  const selected=raw.items.filter(item=>item!==null&&typeof item==='object'
    &&!Array.isArray(item)&&'opportunityId' in item
    &&item.opportunityId===input.opportunityId);
  // Even a consistent-looking duplicate must not silently win by array order.
  if(featured>1||selected.length>1||featured&&selected.length)return null;
  if(featured===1){
    return OpportunityExplanationResponseSchema.parse({
      ...input,state:'FEATURED',evidenceRefs:[],provenance:'CODE_RULES',
    });
  }
  if(selected.length!==1)return null;
  const decision=Selected.safeParse(selected[0]);
  if(!decision.success)return null;
  const item=decision.data;
  const unevaluated=item.reason==='HIDDEN_BY_USER'||item.reason==='NOT_EVALUATED';
  const result=OpportunityExplanationResponseSchema.safeParse({
    ...input,state:'NOT_FEATURED',reason:item.reason,
    notes:unevaluated?[]:item.notes,evidenceRefs:unevaluated?[]:item.evidenceRefs,
    provenance:'CODE_RULES',
  });
  return result.success?result.data:null;
}
