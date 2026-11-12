/** #343 — versioned scholarship eligibility and actionable missing requirements. */
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {aggregateAnd,aggregateOr,evaluateVerifiedCondition,parseAsOf,verifySource,
  type EvidenceState,type FeatureMode} from './source-policy.js';

export type ScholarshipConditionResult = {
  id: string;
  state: EvidenceState;
  reason: string;
  factKey: string;
  evidenceSpanId: string;
  required: boolean;
};
export type ScholarshipReport = {
  scholarshipId: string;
  ruleRevisionId: string;
  mode: 'SIMULATION'|'VERIFIED_FACT_CHECK'|'NOT_AVAILABLE';
  overall: EvidenceState;
  applicationWindow: 'BEFORE_OPEN'|'OPEN'|'CLOSED'|'UNKNOWN';
  groups: readonly {id:string;join:'ALL'|'ANY';state:EvidenceState;
    conditions:readonly ScholarshipConditionResult[]}[];
  missingFactKeys: readonly string[];
  sourceReason: string;
  /** Never an institutional admissions / funding result. */
  officialDecision: null;
};

export function checkScholarship(
  input: {
    policy:C.ScholarshipPolicy;
    verifiedFacts:readonly C.FeatureVerifiedFact[];
    authorizedFactRevisions: ReadonlySet<string>;
    asOf:string;
    mode?:FeatureMode;
  },
):ScholarshipReport {
  const {policy,verifiedFacts,authorizedFactRevisions,asOf}=input;
  const at=parseAsOf(asOf),mode=input.mode??'LIVE';
  const source=verifySource(policy.source,asOf,mode);
  const blank={scholarshipId:policy.id,ruleRevisionId:policy.source.revisionId,
    officialDecision:null,sourceReason:source.reason};
  const opens=policy.opensAt?Date.parse(policy.opensAt):undefined;
  const closes=policy.closesAt?Date.parse(policy.closesAt):undefined;
  const window:ScholarshipReport['applicationWindow']=
    opens!==undefined&&!Number.isFinite(opens) || closes!==undefined&&!Number.isFinite(closes)
      ? 'UNKNOWN' : opens!==undefined && at<opens ? 'BEFORE_OPEN'
        : closes!==undefined&&at>closes ? 'CLOSED'
        : opens===undefined&&closes===undefined ? 'UNKNOWN' : 'OPEN';
  if (!source.usable) {
    // An unapproved, expired or revoked policy may contain stale open/close
    // dates. Never expose an "OPEN" status derived from a blocked source.
    return {...blank,mode:'NOT_AVAILABLE',overall:'UNKNOWN',applicationWindow:'UNKNOWN' as const,
      groups:[],missingFactKeys:policy.groups.flatMap(g=>g.conditions.map(c=>c.factKey))
        .filter((v,i,all)=>all.indexOf(v)===i).sort()};
  }
  const ids=new Set<string>();
  const groups=policy.groups.map(g=>{
    const conditions=g.conditions.map(c=>{
      let state:EvidenceState='UNKNOWN',reason='SOURCE_SPAN_NOT_APPROVED';
      if (ids.has(c.id)) reason='DUPLICATE_CONDITION_ID';
      else if (policy.source.evidenceSpanIds.includes(c.sourceSpanId)) {
        const check=evaluateVerifiedCondition(c,verifiedFacts,asOf,authorizedFactRevisions);
        state=check.state;reason=check.reason;
      }
      ids.add(c.id);
      return {id:c.id,state,reason,factKey:c.factKey,evidenceSpanId:c.sourceSpanId,required:c.required};
    });
    const required=conditions.filter(c=>c.required).map(c=>c.state);
    return {id:g.id,join:g.join,state:g.join==='ALL'?aggregateAnd(required):aggregateOr(required),conditions};
  });
  // Missing coverage is NOT a passing requirement, even if an optional condition passes.
  const overall=aggregateAnd(groups.map(g=>g.state));
  const missingFactKeys=[...new Set(groups.flatMap(g=>g.conditions)
    .filter(c=>c.required&&c.state==='UNKNOWN').map(c=>c.factKey))].sort();
  return {...blank,applicationWindow:window,mode:mode==='SYNTHETIC'?'SIMULATION':'VERIFIED_FACT_CHECK',
    overall,groups,missingFactKeys};
}
