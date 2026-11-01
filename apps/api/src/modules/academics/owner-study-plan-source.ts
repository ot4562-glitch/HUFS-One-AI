import {z} from 'zod';
import {
  OwnerPlanCheckApprovalReceiptSchema,
  OwnerStudyPlanCheckRequestSchema,
  OwnerStudyPlanCheckResponseSchema,
} from '@hufs-one/contracts';
import type {OwnerStudyPlanCheckResponse} from '@hufs-one/contracts';
import {simulateStudyPlan} from '../../../../../packages/core/src/academics/study-plan.js';
import type {StudyPlanCheckRequest} from '../../../../../packages/core/src/academics/study-plan.js';
import type {TrustedOwnerStudyPlanSource} from '../profiles/owner-study-plan-check-http.js';

type InspectInput=Parameters<TrustedOwnerStudyPlanSource['inspect']>[0];
type RevalidateInput=Parameters<TrustedOwnerStudyPlanSource['revalidate']>[0];
type Approval=NonNullable<OwnerStudyPlanCheckResponse['approval']>;
const Ref=z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const Utc=z.iso.datetime({offset:true});
const Receipt=z.string().min(8).max(256);

/** Server-only atomic read. The loader must resolve approved owner records and
 * effective cohort/term rules at asOf; browser input is never a snapshot source.
 * APPROVED is a required storage state, not an independent approval authority.
 */
export interface ApprovedOwnerStudyPlanSnapshot {
  actorId:string;
  term:string;
  asOf:string;
  receipt:string;
  transcript:{
    version:string;state:'APPROVED';attempts:StudyPlanCheckRequest['attempts'];
  };
  plan:{version:string;items:StudyPlanCheckRequest['studyPlan']};
  catalog:{
    version:string;
    courseCreditUnits:StudyPlanCheckRequest['courseCreditUnits'];
    sections?:NonNullable<StudyPlanCheckRequest['sections']>;
  };
  rulePack:{
    version:string;state:'APPROVED';termRules:StudyPlanCheckRequest['termRules'];
  };
  approval:Approval;
  /** Already rights-scoped links, never raw source content or signed secrets. */
  evidenceLinks:OwnerStudyPlanCheckResponse['evidenceLinks'];
  visibility:{
    mode:OwnerStudyPlanCheckResponse['disclosure']['mode'];
    allowedCourseRefs:string[];
    grantVersion?:string;
  };
}

export interface TrustedOwnerStudyPlanSnapshotLoader {
  /** Must be atomic: the receipt binds actor, term, asOf, every loaded head,
   * cohort/term applicability, consent/rights and approval versions. Return null
   * for missing approved input; never synthesize an approved RulePack or ledger.
   * expectedPlanVersion is a hint: return the current head on mismatch so the
   * HTTP boundary can report VERSION_CONFLICT rather than provider failure.
   */
  load(input:InspectInput):Promise<ApprovedOwnerStudyPlanSnapshot|null>;
  /** Resolve the opaque receipt server-side and reject actor/receipt replay,
   * changed plan/catalog/transcript/rule heads, expired/withdrawn source rights,
   * cohort applicability, revoked approval or owner consent. No cached grants.
   */
  revalidate(input:RevalidateInput):Promise<boolean>;
}

/** Provider-neutral bridge to the merged #91/#116 pure core. This factory supplies
 * no live data, rights authority or default approval. Register it together with
 * independent TrustedOwnerStudyPlanRights and ApprovedStudyPlanGate; those gates
 * must check current permissions before reads and after all awaited work. The
 * source's approval receipt is evidence to check, never permission by itself.
 */
export function createTrustedOwnerStudyPlanSource(options:{
  snapshots:TrustedOwnerStudyPlanSnapshotLoader;
}):TrustedOwnerStudyPlanSource {
  const {snapshots}=options;
  return {
    inspect:async input=>{
      Ref.parse(input.actorId);
      Utc.parse(input.now);
      OwnerStudyPlanCheckRequestSchema.parse({term:input.term,
        ...(input.expectedPlanVersion?{expectedPlanVersion:input.expectedPlanVersion}:{})});
      const loaded=await snapshots.load({...input});
      if(!loaded)throw new Error('Approved academic snapshot unavailable');
      // Detach the complete read before computation. Later provider-side writes
      // cannot change a returned receipt/check while the route awaits authority.
      const snapshot=structuredClone(loaded);
      Receipt.parse(snapshot.receipt);
      Utc.parse(snapshot.asOf);
      if(snapshot.actorId!==input.actorId||snapshot.term!==input.term
        ||Date.parse(snapshot.asOf)>Date.parse(input.now)
        ||snapshot.transcript.state!=='APPROVED'||snapshot.rulePack.state!=='APPROVED')
        throw new Error('Academic snapshot is not bound to this approved owner check');
      const versions={
        rulePack:Ref.parse(snapshot.rulePack.version),
        plan:Ref.parse(snapshot.plan.version),
        catalog:Ref.parse(snapshot.catalog.version),
        transcript:Ref.parse(snapshot.transcript.version),
      };
      const approval=OwnerPlanCheckApprovalReceiptSchema.parse(snapshot.approval);
      if(approval.rulePackVersion!==versions.rulePack
        ||Date.parse(approval.verifiedAt)>Date.parse(snapshot.asOf))
        throw new Error('Academic approval does not match this snapshot');
      const approvedEvidence=new Set(approval.officialEvidenceRefs);
      const ruleEvidence=[...snapshot.rulePack.termRules.capEvidenceRefs,
        ...(snapshot.rulePack.termRules.prerequisites??[]).flatMap(rule=>rule.evidenceRefs)];
      if(ruleEvidence.some(ref=>!approvedEvidence.has(ref)))
        throw new Error('Term rules are outside the approved evidence');
      const core=simulateStudyPlan({
        asOf:snapshot.asOf,term:snapshot.term,
        rulePack:{version:versions.rulePack,state:'APPROVED'},
        attempts:snapshot.transcript.attempts,
        studyPlan:snapshot.plan.items,
        courseCreditUnits:snapshot.catalog.courseCreditUnits,
        termRules:snapshot.rulePack.termRules,
        ...(snapshot.catalog.sections?{sections:snapshot.catalog.sections}:{}),
        versions,
      });
      const permitted=new Set(snapshot.visibility.mode==='REDACTED'
        ?[]:snapshot.visibility.allowedCourseRefs);
      let redacted=false;
      const planIssues=core.planIssues.map(issue=>({
        ...issue,courseRefs:issue.courseRefs.filter(ref=>{
          if(permitted.has(ref))return true;
          redacted=true;return false;
        }),
      }));
      const unchecked=core.unchecked.map(item=>{
        if(permitted.has(item.courseId))return item;
        redacted=true;return {reason:item.reason};
      });
      const visibleCourseRefs=[...new Set([
        ...planIssues.flatMap(issue=>issue.courseRefs),
        ...unchecked.flatMap(item=>'courseId' in item?[item.courseId]:[]),
      ])].sort();
      const usedEvidence=new Set([
        ...approval.officialEvidenceRefs,
        ...planIssues.flatMap(issue=>issue.evidenceRefs),
      ]);
      const check=OwnerStudyPlanCheckResponseSchema.parse({
        ...core,planIssues,unchecked,
        evidenceLinks:snapshot.evidenceLinks.filter(link=>usedEvidence.has(link.evidenceRef)),
        caveats:[...core.caveats,...(redacted?['COURSE_REFS_REDACTED']:[])],
        disclosure:{mode:snapshot.visibility.mode,visibleCourseRefs,
          ...(snapshot.visibility.grantVersion?{grantVersion:snapshot.visibility.grantVersion}:{})},
        approval,
      });
      return {check,receipt:snapshot.receipt};
    },
    revalidate:async input=>{
      if(!Ref.safeParse(input.actorId).success||!Receipt.safeParse(input.receipt).success
        ||!Utc.safeParse(input.now).success)return false;
      return await snapshots.revalidate({...input})===true;
    },
  };
}
