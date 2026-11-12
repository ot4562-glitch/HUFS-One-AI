/** #351 — verified aggregate statistics and grounded display facts. */
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {conflictingIds,verifySource,type FeatureMode} from './source-policy.js';
export type EmploymentValue={
  id:string;year:number;metricId:string;groupId:string;populationId:string;
  status:'PERCENT'|'OBSERVED_ZERO'|'NO_DATA'|'SUPPRESSED'|'INVALID'|'UNVERIFIED';
  numerator?:number;denominator?:number;percent?:number;
  sourceRevisionId:string;
};
export function evaluatePublishedStat(
  row:C.EmploymentAggregate,asOf:string,mode?:FeatureMode,
):EmploymentValue {
  const base={id:row.id,year:row.year,metricId:row.metricId,groupId:row.groupId,
    populationId:row.populationId,sourceRevisionId:row.source.revisionId};
  if(!verifySource(row.source,asOf,mode).usable || !row.publicApproved)
    return {...base,status:'UNVERIFIED'};
  const {numerator:n,denominator:d}=row;
  if(n===undefined || d===undefined) return {...base,status:'NO_DATA'};
  if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||n<0||d<=0||n>d)
    return {...base,status:'INVALID'};
  const {minimumPositiveCell:threshold,allowPublishedZero}=row.publicationPolicy;
  if(threshold===undefined || !Number.isSafeInteger(threshold) || threshold<1)
    return {...base,status:'SUPPRESSED'};
  // Conservative suppression of both positive and complementary cells.
  if(n===0){
    if(!allowPublishedZero || d<threshold) return {...base,status:'SUPPRESSED'};
    return {...base,status:'OBSERVED_ZERO',numerator:n,denominator:d,percent:0};
  }
  if(n<threshold || d-n<threshold)
    return {...base,status:'SUPPRESSED'};
  return {...base,status:'PERCENT',numerator:n,denominator:d,percent:n/d*100};
}
export type EmploymentCompareResult={
  rows:readonly EmploymentValue[];
  comparable:boolean;
  reason:'COMPATIBLE'|'EMPTY'|'DIFFERENT_SOURCE'|'DIFFERENT_DEFINITION'|'UNPUBLISHABLE';
};
/** Comparison only: never silently sums overlapping departments or populations. */
export function comparePublishedStats(
  records:readonly C.EmploymentAggregate[],asOf:string,mode?:FeatureMode,
):EmploymentCompareResult {
  if(!records.length) return {rows:[],comparable:false,reason:'EMPTY'};
  // #376: a repeated stat ID can have conflicting rights or numerators.
  // Quarantine *all* copies; never leak numeric cells in comparison output.
  const conflicts=conflictingIds(records);
  const rows=records.map(r=>conflicts.has(r.id)
    ? {id:r.id,year:r.year,metricId:r.metricId,groupId:r.groupId,
        populationId:r.populationId,sourceRevisionId:r.source.revisionId,
        status:'UNVERIFIED' as const}
    : evaluatePublishedStat(r,asOf,mode));
  if (rows.some(x=>x.status!=='PERCENT'&&x.status!=='OBSERVED_ZERO'))
    return {rows,comparable:false,reason:'UNPUBLISHABLE'};
  const sameSource=records.every(r=>r.source.sourceId===records[0]!.source.sourceId
    && r.source.revisionId===records[0]!.source.revisionId);
  if(!sameSource) return {rows,comparable:false,reason:'DIFFERENT_SOURCE'};
  const firstPolicy=records[0]!.publicationPolicy;
  const sameMetric=records.every(r=>r.metricId===records[0]!.metricId
    && r.populationId===records[0]!.populationId
    && r.year===records[0]!.year
    // A source revision must not silently combine incompatible publication/
    // small-cell rules in an apparently comparable group.
    && r.publicationPolicy.minimumPositiveCell===firstPolicy.minimumPositiveCell
    && r.publicationPolicy.allowPublishedZero===firstPolicy.allowPublishedZero
    && r.publicationPolicy.aggregationAllowed===firstPolicy.aggregationAllowed);
  return {rows,comparable:sameMetric,
    reason:sameMetric?'COMPATIBLE':'DIFFERENT_DEFINITION'};
}
export type EmploymentStatement={
  id:string;statId:string;year:number;numerator:number;denominator:number;
  percentage:number;
};
export type VerifiedStatement={statementId:string;
  outcome:'ACCEPTED'|'REJECTED';reason:string;safeText?:string};
/** Approved structured claims -> deterministic Korean sentences. No LLM prose is trusted. */
export function validateEmploymentStatements(
  rows:readonly C.EmploymentAggregate[],
  claims:readonly EmploymentStatement[],asOf:string,mode?:FeatureMode,
):VerifiedStatement[] {
  const conflicts=conflictingIds(rows);
  const byId=new Map(rows.filter(row=>!conflicts.has(row.id))
    .map(row=>[row.id,evaluatePublishedStat(row,asOf,mode)]));
  const seen=new Set<string>();
  return claims.map(c=>{
    const rejection=(reason:string):VerifiedStatement=>({statementId:c.id,outcome:'REJECTED',reason});
    if(seen.has(c.id)) return rejection('DUPLICATE_STATEMENT');
    seen.add(c.id);
    if(conflicts.has(c.statId))return rejection('AMBIGUOUS_SOURCE_ID');
    const row=byId.get(c.statId);
    if(!row || (row.status!=='PERCENT'&&row.status!=='OBSERVED_ZERO'))
      return rejection('SOURCE_NOT_PUBLISHABLE');
    if(row.year!==c.year || row.numerator!==c.numerator || row.denominator!==c.denominator
      || !Number.isFinite(c.percentage) || Math.abs(row.percent!-c.percentage)>0.005)
      return rejection('NUMERIC_MISMATCH');
    return {statementId:c.id,outcome:'ACCEPTED',reason:'MATCHED_APPROVED_AGGREGATE',
      safeText:String(c.year)+'년 해당 조사집단 '+row.groupId+'의 '+row.metricId+
        ' 관측 비율은 '+row.percent!.toFixed(2)+'% ('
        +row.numerator+'/'+row.denominator+')입니다.'};
  });
}
