import {z} from 'zod';
import {ActivityRecordSchema,type ActivityForecast,type ActivityRecord} from '@hufs-one/contracts';
import {ACTIVITY_FORECAST_MODEL_VERSION,currentActivityRecords,forecastActivity,publishedDayKst} from '../campus-assist/activities.js';

export const ACTIVITY_EVALUATOR_VERSION='activity-rolling-origin-v1';
const Id=z.string().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/),Iso=z.iso.datetime({offset:true});
const Year=z.number().int().min(2000).max(2200);
const Subject=z.strictObject({organizationId:Id,seriesId:Id});
const Outcome=z.strictObject({outcomeId:Id,revisionId:Id,organizationId:Id,seriesId:Id,targetYear:Year,
  outcome:z.enum(['HELD','CANCELLED','UNKNOWN']),eventDate:z.iso.date().optional(),verifiedAt:Iso,
  rights:z.enum(['APPROVED','REVOKED','BLOCKED']),review:z.enum(['HUMAN_VERIFIED','PENDING']),
  provenance:z.enum(['SYNTHETIC','REAL_APPROVED']),
}).superRefine((g,ctx)=>{
  if((g.outcome==='HELD'&&!g.eventDate)||(g.eventDate&&Number(g.eventDate.slice(0,4))!==g.targetYear)
    ||(g.outcome==='HELD'&&g.eventDate&&Date.parse(g.verifiedAt)<Date.parse(g.eventDate+'T00:00:00+09:00')))
    ctx.addIssue({code:'custom',message:'Outcome needs a consistent, already observed event date'});
});
export type ActivityOutcome=z.infer<typeof Outcome>;
export const ActivityEvaluationInputSchema=z.strictObject({datasetKind:z.enum(['SYNTHETIC','REAL_APPROVED']),truthAsOf:Iso,
  subjects:z.array(Subject).min(1).max(200),records:z.array(ActivityRecordSchema).max(10000),
  origins:z.array(z.strictObject({asOf:Iso,targetYear:Year})).min(1).max(16),outcomes:z.array(Outcome).max(10000),
});
export type ActivityEvaluationInput=z.infer<typeof ActivityEvaluationInputSchema>;
type Window={from:string;to:string};
type PreviousYear={state:'PREDICTED';date:string;evidenceRefs:string[]}|{state:'ABSTAIN';evidenceRefs:[]};
type Method='OUTLOOK'|'PREVIOUS_YEAR';
/** Raw counts and error sums; abstentions are separate from misses. No accuracy or release claim. */
export interface ActivityMethodScore{
  answered:number;abstained:number;held:number;heldAnswered:number;heldCovered:number;heldMissed:number;
  cancelled:number;cancelledWindows:number;totalIntervalDays:number;totalDistanceDays:number;totalMidpointAbsoluteErrorDays:number;
}
interface Tally{
  targets:number;alreadyKnown:number;truthUnavailable:number;truthConflicting:number;scored:number;
  methods:Record<Method,ActivityMethodScore>;
  paired:{items:number;methods:Record<Method,ActivityMethodScore>};
}
interface Case{
  organizationId:string;seriesId:string;category:'SCORED'|'ALREADY_KNOWN'|'TRUTH_UNAVAILABLE'|'TRUTH_CONFLICTING';
  outlook:Pick<ActivityForecast,'state'|'confidence'|'observedYears'|'evidenceRefs'|'from'|'to'>;previousYear:PreviousYear;
  truth?:{outcome:'HELD'|'CANCELLED';eventDate?:string;goldRefs:string[]};
}
const key=(s:{organizationId:string;seriesId:string})=>JSON.stringify([s.organizationId,s.seriesId]);
const targetKey=(s:{organizationId:string;seriesId:string;targetYear:number})=>JSON.stringify([s.organizationId,s.seriesId,s.targetYear]);
const canonical=(g:ActivityOutcome)=>JSON.stringify(Object.keys(g).sort().map(k=>[k,g[k as keyof ActivityOutcome]]));
const epoch=(s:string)=>Date.parse(s),day=(s:string)=>epoch(s+'T00:00:00Z')/86_400_000;
const emptyScore=():ActivityMethodScore=>({answered:0,abstained:0,held:0,heldAnswered:0,heldCovered:0,heldMissed:0,
  cancelled:0,cancelledWindows:0,totalIntervalDays:0,totalDistanceDays:0,totalMidpointAbsoluteErrorDays:0});
const methods=()=>({OUTLOOK:emptyScore(),PREVIOUS_YEAR:emptyScore()});
const tally=():Tally=>({targets:0,alreadyKnown:0,truthUnavailable:0,truthConflicting:0,scored:0,methods:methods(),paired:{items:0,methods:methods()}});
function addScore(score:ActivityMethodScore,truth:NonNullable<Case['truth']>,window:Window|undefined){
  if(window){score.answered++;score.totalIntervalDays+=day(window.to)-day(window.from)+1;}else score.abstained++;
  if(truth.outcome==='CANCELLED'){score.cancelled++;if(window)score.cancelledWindows++;return;}
  score.held++;if(!window)return;
  score.heldAnswered++;const actual=day(truth.eventDate!),from=day(window.from),to=day(window.to);
  if(actual>=from&&actual<=to)score.heldCovered++;else score.heldMissed++;
  score.totalDistanceDays+=Math.max(from-actual,actual-to,0);
  score.totalMidpointAbsoluteErrorDays+=Math.abs((from+to)/2-actual);
}
/** Gold revisions are selected before filtering rights/review. Conflicting latest
 * copies are quarantined, including disagreement across independent outcome IDs. */
function truthsAt(outcomes:ActivityOutcome[],asOf:string){
  const groups=new Map<string,ActivityOutcome[]>();
  for(const g of outcomes){if(epoch(g.verifiedAt)>epoch(asOf))continue;
    const old=groups.get(g.outcomeId),prior=old?.[0];
    if(!prior||epoch(g.verifiedAt)>epoch(prior.verifiedAt))groups.set(g.outcomeId,[g]);
    else if(epoch(g.verifiedAt)===epoch(prior.verifiedAt))old!.push(g);
  }
  const byTarget=new Map<string,{conflict:boolean;rows:ActivityOutcome[]}>();
  for(const copies of groups.values()){
    const head=copies[0]!,k=targetKey(head),group=byTarget.get(k)??{conflict:false,rows:[]};
    if(new Set(copies.map(canonical)).size!==1)group.conflict=true;
    else if(head.rights==='APPROVED'&&head.review==='HUMAN_VERIFIED'&&head.outcome!=='UNKNOWN')group.rows.push(head);
    byTarget.set(k,group);
  }
  for(const group of byTarget.values()){
    group.rows.sort((a,b)=>a.outcomeId.localeCompare(b.outcomeId,'en'));
    if(new Set(group.rows.map(g=>JSON.stringify([g.outcome,g.eventDate??null]))).size>1)group.conflict=true;
  }
  return byTarget;
}
function previousYear(records:ActivityRecord[],asOf:string,targetYear:number):PreviousYear{
  const prior=records.find(r=>r.status==='CONFIRMED'&&r.eventDate&&Number(r.eventDate.slice(0,4))===targetYear-1
    &&epoch(r.eventDate+'T00:00:00Z')<=epoch(asOf));
  if(!prior?.eventDate)return {state:'ABSTAIN',evidenceRefs:[]};
  const monthDay=prior.eventDate.slice(5),leap=new Date(Date.UTC(targetYear,1,29)).getUTCMonth()===1;
  return {state:'PREDICTED',date:targetYear+'-'+(monthDay==='02-29'&&!leap?'02-28':monthDay),evidenceRefs:[prior.revisionId]};
}
function merge(total:Tally,part:Tally){
  for(const field of ['targets','alreadyKnown','truthUnavailable','truthConflicting','scored'] as const)total[field]+=part[field];
  total.paired.items+=part.paired.items;
  for(const method of ['OUTLOOK','PREVIOUS_YEAR'] as const)for(const field of Object.keys(total.methods[method]) as (keyof ActivityMethodScore)[]){
    total.methods[method][field]+=part.methods[method][field];
    total.paired.methods[method][field]+=part.paired.methods[method][field];
  }
}
/** Pure offline evaluation. The input is an operator-authorized snapshot, not an
 * authorization grant. A declared HUMAN_VERIFIED flag cannot prove independence. */
export function evaluateActivityOrigins(raw:ActivityEvaluationInput){
  const request=ActivityEvaluationInputSchema.parse(raw),subjects=new Set(request.subjects.map(key));
  if(subjects.size!==request.subjects.length)throw new RangeError('Duplicate activity subject');
  const origins=new Set<string>(),outcomeSubjects=new Map<string,string>();
  for(const origin of request.origins){
    const id=epoch(origin.asOf)+':'+origin.targetYear;
    if(origins.has(id)||epoch(origin.asOf)>epoch(request.truthAsOf)||origin.targetYear<Number(publishedDayKst(origin.asOf).slice(0,4)))
      throw new RangeError('Duplicate or invalid evaluation origin');
    origins.add(id);
  }
  for(const r of request.records){
    if(r.provenance!==request.datasetKind||!subjects.has(key(r))||epoch(r.verifiedAt)<epoch(r.publishedAt))
      throw new RangeError('Activity provenance, subject or verification mismatch');
  }
  for(const g of request.outcomes){
    const prior=outcomeSubjects.get(g.outcomeId),k=targetKey(g);
    if(g.provenance!==request.datasetKind||!subjects.has(key(g))||(prior!==undefined&&prior!==k))
      throw new RangeError('Outcome provenance or identity mismatch');
    outcomeSubjects.set(g.outcomeId,k);
  }
  const truths=truthsAt(request.outcomes,request.truthAsOf),total=tally();
  const reports=[...request.origins].sort((a,b)=>epoch(a.asOf)-epoch(b.asOf)||a.targetYear-b.targetYear).map(origin=>{
    const report={...origin,...tally(),cases:[] as Case[]};
    const knownAtOrigin=truthsAt(request.outcomes,origin.asOf);
    // Slice once through the same head/dedup/rights rules used by the product.
    const visible=currentActivityRecords(request.records,origin.asOf);
    for(const subject of [...request.subjects].sort((a,b)=>key(a).localeCompare(key(b),'en'))){
      report.targets++;
      const predicted=forecastActivity(request.records,origin.asOf,origin.targetYear,subject.organizationId,subject.seriesId);
      const {state,confidence,observedYears,evidenceRefs,from,to}=predicted;
      const baseline=previousYear(visible.filter(r=>key(r)===key(subject)),origin.asOf,origin.targetYear);
      const item:Case={...subject,category:'TRUTH_UNAVAILABLE',outlook:{state,confidence,observedYears,evidenceRefs,
        ...(from?{from}:{}),...(to?{to}:{})},previousYear:baseline};report.cases.push(item);
      const target=targetKey({...subject,targetYear:origin.targetYear}),gold=truths.get(target),known=knownAtOrigin.get(target);
      if(state==='CONFIRMED'||state==='CANCELLED'){report.alreadyKnown++;item.category='ALREADY_KNOWN';continue;}
      if(known?.conflict){report.truthConflicting++;item.category='TRUTH_CONFLICTING';continue;}
      // A later Gold correction must not erase that this target already had an
      // declared reviewed outcome at the historical evaluation origin.
      if(known?.rows.length){report.alreadyKnown++;item.category='ALREADY_KNOWN';continue;}
      if(gold?.conflict){report.truthConflicting++;item.category='TRUTH_CONFLICTING';continue;}
      const answer=gold?.rows[0];
      if(!answer){report.truthUnavailable++;continue;}
      if(gold!.rows.some(g=>epoch(g.verifiedAt)<=epoch(origin.asOf))
        ||(answer.outcome==='HELD'&&epoch(answer.eventDate!+'T00:00:00+09:00')<=epoch(origin.asOf))){
        report.alreadyKnown++;item.category='ALREADY_KNOWN';continue;
      }
      item.category='SCORED';report.scored++;
      const truth:NonNullable<Case['truth']>={outcome:answer.outcome as 'HELD'|'CANCELLED',
        ...(answer.eventDate?{eventDate:answer.eventDate}:{}),goldRefs:gold!.rows.map(g=>g.outcomeId+':'+g.revisionId)};
      item.truth=truth;
      const windows={OUTLOOK:state==='PREDICTED'&&from&&to?{from,to}:undefined,
        PREVIOUS_YEAR:baseline.state==='PREDICTED'?{from:baseline.date,to:baseline.date}:undefined};
      for(const method of ['OUTLOOK','PREVIOUS_YEAR'] as const)addScore(report.methods[method],truth,windows[method]);
      if(windows.OUTLOOK&&windows.PREVIOUS_YEAR){report.paired.items++;
        for(const method of ['OUTLOOK','PREVIOUS_YEAR'] as const)addScore(report.paired.methods[method],truth,windows[method]);}
    }
    merge(total,report);return report;
  });
  return {evaluatorVersion:ACTIVITY_EVALUATOR_VERSION,modelVersion:ACTIVITY_FORECAST_MODEL_VERSION,datasetKind:request.datasetKind,
    truthAsOf:request.truthAsOf,reviewAssurance:'DECLARED_REVIEW_ONLY' as const,independentAcceptance:'NOT_RUN' as const,releaseEligible:false as const,
    status:new Set(reports.filter(r=>r.scored>0).map(r=>epoch(r.asOf))).size>=2?'READY' as const:'INSUFFICIENT_DATA' as const,
    origins:reports,total};
}
