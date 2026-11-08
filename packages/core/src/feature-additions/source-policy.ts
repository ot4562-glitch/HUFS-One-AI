/**
 * Source/time/permission and evidence matching shared by #343–#352.
 *
 * Shape validation is in @hufs-one/contracts.FeatureAdditions. These functions
 * do not fetch authoritative data, verify signatures, obtain student consent,
 * or replace server-side SourceRevision/rights revalidation.
 */
import type {FeatureAdditions as C} from '@hufs-one/contracts';

export type FeatureMode = 'LIVE' | 'SYNTHETIC';
export type EvidenceState = 'MET' | 'NOT_MET' | 'UNKNOWN';
export type SourceCheck = {usable: boolean; reason:
  'VERIFIED'|'SYNTHETIC'|'UNAPPROVED'|'REVOKED'|'OUT_OF_PERIOD'|'FUTURE_VERIFICATION'|'INVALID_TIME'};
export type ProofCheck = {state: EvidenceState; reason: string; factKey: string; evidence: readonly string[]};

export function parseAsOf(asOf: string): number {
  const parsed = Date.parse(asOf);
  if (!Number.isFinite(parsed) || !/(?:Z|[+-]\d\d:\d\d)$/i.test(asOf)) throw new RangeError('invalid asOf');
  return parsed;
}
export function verifySource(
  s: C.FeatureSource, asOf: string, mode: FeatureMode = 'LIVE',
): SourceCheck {
  const date = parseAsOf(asOf);
  const start = Date.parse(s.effectiveFrom);
  const end = s.effectiveUntil ? Date.parse(s.effectiveUntil) : Infinity;
  if (!Number.isFinite(start) || Number.isNaN(end) || end <= start)
    return {usable:false,reason:'INVALID_TIME'};
  if (date < start || date >= end) return {usable:false,reason:'OUT_OF_PERIOD'};
  if (s.status === 'REVOKED') return {usable:false,reason:'REVOKED'};
  if (s.rights !== 'CLEARED') return {usable:false,reason:'UNAPPROVED'};
  if (s.status === 'SYNTHETIC' && mode === 'SYNTHETIC')
    return {usable:true,reason:'SYNTHETIC'};
  if (s.status !== 'VERIFIED' || !s.verifiedAt || !s.evidenceSpanIds.length)
    return {usable:false,reason:'UNAPPROVED'};
  if (!Number.isFinite(Date.parse(s.verifiedAt)) || Date.parse(s.verifiedAt) > date)
    return {usable:false,reason:'FUTURE_VERIFICATION'};
  return {usable:true,reason:'VERIFIED'};
}
export function aggregateAnd(values: readonly EvidenceState[]): EvidenceState {
  if (!values.length) return 'UNKNOWN';
  if (values.includes('NOT_MET')) return 'NOT_MET';
  return values.every(v => v === 'MET') ? 'MET' : 'UNKNOWN';
}
export function aggregateOr(values: readonly EvidenceState[]): EvidenceState {
  if (!values.length) return 'UNKNOWN';
  if (values.includes('MET')) return 'MET';
  return values.every(v => v === 'NOT_MET') ? 'NOT_MET' : 'UNKNOWN';
}
export function safeIntersection(lhs: readonly string[], rhs: readonly string[]): string[] {
  const right=new Set(rhs);
  return [...new Set(lhs)].filter(x=>right.has(x)).sort((a,b)=>a.localeCompare(b,'en'));
}
export function jaccard(lhs: readonly string[], rhs: readonly string[]): number {
  const l=new Set(lhs), r=new Set(rhs);
  if (!l.size || !r.size) return 0;
  let shared=0;
  for (const value of l) if (r.has(value)) shared++;
  return shared/new Set([...l,...r]).size;
}
export function evaluateVerifiedCondition(
  rule: C.FeatureCondition,
  facts: readonly C.FeatureVerifiedFact[],
  asOf: string,
  allowedFactRevisions: ReadonlySet<string>,
): ProofCheck {
  const checked=()=>({state:'UNKNOWN' as const,reason:'CONDITION_UNCHECKED',
    factKey:rule.factKey,evidence:[rule.sourceSpanId]});
  const at=parseAsOf(asOf);
  const hits=facts.filter(f=>f.key===rule.factKey && parseAsOf(f.observedAt)<=at
    && f.provenance==='SOURCE_VERIFIED' && f.sourceRevisionId
    && allowedFactRevisions.has(f.sourceRevisionId));
  if (!hits.length) return {...checked(),reason:'FACT_NOT_VERIFIED_OR_AVAILABLE'};
  // Use the newest *authorized* observation. Conflicts at the same instant abstain.
  const newest=Math.max(...hits.map(f=>parseAsOf(f.observedAt)));
  const latest=hits.filter(f=>parseAsOf(f.observedAt)===newest);
  if (new Set(latest.map(f=>JSON.stringify(f.value))).size!==1)
    return {...checked(),reason:'CONFLICTING_FACTS'};
  const f=latest[0]!;
  let pass: boolean|undefined;
  if (rule.op==='NUM_GTE' && typeof f.value==='number' && typeof rule.expected==='number')
    pass=f.value>=rule.expected;
  if (rule.op==='NUM_LTE' && typeof f.value==='number' && typeof rule.expected==='number')
    pass=f.value<=rule.expected;
  if (rule.op==='TEXT_EQ' && typeof f.value==='string' && typeof rule.expected==='string')
    pass=f.value===rule.expected;
  if (rule.op==='TEXT_IN' && typeof f.value==='string' && Array.isArray(rule.expected))
    pass=rule.expected.includes(f.value);
  if (rule.op==='BOOL_EQ' && typeof f.value==='boolean' && typeof rule.expected==='boolean')
    pass=f.value===rule.expected;
  if (rule.op==='DOCUMENT_PRESENT' && typeof f.value==='boolean' && rule.expected===true)
    pass=f.value===true;
  if (pass===undefined) return {...checked(),reason:'TYPE_OR_OPERATOR_MISMATCH'};
  return {state:pass?'MET':'NOT_MET',reason:pass?'VERIFIED_MATCH':'VERIFIED_MISMATCH',
    factKey:rule.factKey,evidence:[rule.sourceSpanId]};
}
/** Model proposals cannot introduce a new candidate or claim uncited evidence. */
export function verifySemanticProposals(
  candidateEvidence: ReadonlyMap<string, readonly string[]>,
  proposals: readonly C.SemanticProposal[],
  expectedInputDigest: string,
  options?:{requireCompleteSet?:boolean},
): ReadonlyMap<string,{score:number; evidenceCodes:readonly string[]}> {
  const output=new Map<string,{score:number;evidenceCodes:readonly string[]}>();
  const strict=options?.requireCompleteSet===true;
  let malformed=false;
  const versions=new Set<string>();
  for (const p of proposals) {
    const allowed=candidateEvidence.get(p.candidateId);
    if (!allowed || output.has(p.candidateId) || p.inputDigest!==expectedInputDigest
      || !p.modelVersion?.trim()
      || !Number.isFinite(p.score) || p.score<0 || p.score>1
      || !p.evidenceCodes.length || p.evidenceCodes.some(id=>!allowed.includes(id))) {
      malformed=true;
      continue;
    }
    versions.add(p.modelVersion);
    output.set(p.candidateId,{score:p.score,evidenceCodes:[...new Set(p.evidenceCodes)].sort()});
  }
  // Rankings require the entire preapproved candidate set. Reject even one
  // hallucinated extra ID, duplicate, missing ID or mixed model version;
  // partial filtering would accidentally allow a poisoned reranking.
  if(strict && (malformed || versions.size!==1 || proposals.length!==candidateEvidence.size
    || output.size!==candidateEvidence.size)) return new Map();
  return output;
}
