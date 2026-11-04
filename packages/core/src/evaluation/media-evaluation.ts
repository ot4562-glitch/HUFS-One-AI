import {z} from 'zod';
import {selectCurrentRevisions} from '../normalization/revisions.js';
import {canonicalJson} from './canonical.js';
import {validateMediaFixturePack,type MediaFixtureManifest,type PosterFixture,type MediaFieldKey} from './media-fixtures.js';
import {ratio,distribution} from './recommendation-report.js';
import {inspectReviewLedger,type ReviewerAuthority} from './review-ledger.js';
import {validateMediaReviewPackage,type MediaReviewPackage} from './media-review-package.js';

const Sha=z.string().regex(/^[a-f0-9]{64}$/),Id=z.string().regex(/^[A-Za-z0-9_.:@-]{1,160}$/);
const Key=z.enum(['TITLE','APPLY_DEADLINE','EVENT_DATE','APPLY_MODE','ENROLLMENT','CAMPUS','COHORT_MIN','PRIORITY','COMPLETION']);
const Bbox=z.tuple([z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1)])
  .refine(b=>b[0]<b[2]&&b[1]<b[3]);
export const MediaPredictionSchema=z.strictObject({key:Key,value:z.string().max(200).nullable(),quote:z.string().max(500),
  source:z.enum(['IMAGE','HTML']),bboxNorm:Bbox.nullable(),paragraphId:Id.nullable()});
const RecordSchema=z.strictObject({posterId:Id,imageSha256:Sha,htmlSha256:Sha,
  latencyMs:z.number().finite().min(0),inputTokens:z.number().int().min(0).nullable(),outputTokens:z.number().int().min(0).nullable(),
  billedKrw:z.number().finite().min(0).nullable(),error:z.string().min(1).max(200).nullable(),
  fields:z.array(MediaPredictionSchema).max(20),retrievedEvidenceIds:z.array(Id).max(20)});
export const MediaObservationSchema=z.strictObject({schemaVersion:z.literal('media-observation-v1'),manifestSha256:Sha,
  observationId:Id,mode:z.enum(['HTML_GENERAL_OCR','HTML_GENERAL_OCR_HCX']),
  provenance:z.enum(['SYNTHETIC_PROTOCOL','IMPORTED_UNVERIFIED']),records:z.array(RecordSchema).length(20)});
export type MediaObservation=z.infer<typeof MediaObservationSchema>;
export type MediaPrediction=z.infer<typeof MediaPredictionSchema>;
type ObservedRecord=z.infer<typeof RecordSchema>;
const CONDITION_KEYS:MediaFieldKey[]=['ENROLLMENT','CAMPUS','COHORT_MIN'];
const FIELD_PREFIXES:ReadonlyArray<[string,MediaFieldKey]>=[
  ['TITLE: ','TITLE'],['APPLY DEADLINE: ','APPLY_DEADLINE'],['EVENT DATE: ','EVENT_DATE'],['APPLY MODE: ','APPLY_MODE'],
  ['ENROLLMENT: ','ENROLLMENT'],['CAMPUS: ','CAMPUS'],['COHORT MIN: ','COHORT_MIN'],
  ['PRIORITY ONLY: ','PRIORITY'],['COMPLETION ONLY: ','COMPLETION'],
];
function htmlRecord(p:PosterFixture,bytes:Uint8Array):ObservedRecord{
  const start=performance.now(),html=new TextDecoder('utf-8',{fatal:true}).decode(bytes),fields:MediaPrediction[]=[];
  // Bounded fixture HTML parser, not a general HTML/source ingestion parser.
  for(const match of html.matchAll(/<p id="(p[1-6])">([^<>]*)<\/p>/g)){
    const prefix=FIELD_PREFIXES.find(([label])=>match[2]!.startsWith(label));if(!prefix)continue;
    const value=match[2]!.slice(prefix[0].length);
    fields.push({key:prefix[1],value:value==='NOT STATED'?null:value,quote:match[2]!,source:'HTML',bboxNorm:null,paragraphId:match[1]!});
  }
  return {posterId:p.id,imageSha256:p.image.originalSha256,htmlSha256:p.html.originalSha256,
    latencyMs:performance.now()-start,inputTokens:0,outputTokens:0,billedKrw:0,error:null,fields,
    retrievedEvidenceIds:fields.filter(f=>CONDITION_KEYS.includes(f.key)).slice(0,3).map(f=>p.id+':'+f.key)};
}
export function bboxIou(a:readonly number[],b:readonly number[]){
  const overlap=Math.max(0,Math.min(a[2]!,b[2]!)-Math.max(a[0]!,b[0]!))*Math.max(0,Math.min(a[3]!,b[3]!)-Math.max(a[1]!,b[1]!));
  const union=(a[2]!-a[0]!)*(a[3]!-a[1]!)+(b[2]!-b[0]!)*(b[3]!-b[1]!)-overlap;
  return union>0?overlap/union:0;
}
function inferredEligibility(fields:readonly MediaPrediction[]){
  const get=(key:MediaFieldKey)=>fields.find(f=>f.key===key)?.value??null;
  const enrollment=get('ENROLLMENT'),campus=get('CAMPUS'),cohort=get('COHORT_MIN');
  const cohortValid=cohort!==null&&/^\d{4}$/.test(cohort);
  if((enrollment!==null&&enrollment!=='ENROLLED')||(campus!==null&&campus!=='SEOUL')||(cohortValid&&Number(cohort)>2023))return'INELIGIBLE';
  if(enrollment===null||campus===null||!cohortValid)return'UNKNOWN';
  return'ELIGIBLE';
}
function supported(p:PosterFixture,f:MediaPrediction){
  const truth=p.fields.find(t=>t.key===f.key);if(!truth||f.quote!==truth.text||f.value!==truth.value)return false;
  return f.source==='IMAGE'?f.paragraphId===null&&f.bboxNorm!==null&&bboxIou(f.bboxNorm,truth.bboxNorm)>=.5:
    f.bboxNorm===null&&truth.htmlSpan!==null&&f.paragraphId===truth.htmlSpan.paragraphId;
}
function summarize(manifest:MediaFixtureManifest,records:ObservedRecord[]){
  let expectedConditions=0,predictedConditions=0,correctConditions=0,citationCount=0,citationSupported=0,retrievalNeeded=0,retrievalFound=0;
  let unknown=0,completed=0;const falseEligible:string[]=[],unsupportedEligible:string[]=[],ious:number[]=[];
  const perPoster=manifest.posters.map(p=>{
    const record=records.find(r=>r.posterId===p.id)!;
    if(record.error===null)completed++;
    const fields=record.error?[]:record.fields;
    for(const truth of p.fields)if(CONDITION_KEYS.includes(truth.key)&&truth.value!==null)expectedConditions++;
    for(const f of fields){
      const truth=p.fields.find(t=>t.key===f.key);
      if(CONDITION_KEYS.includes(f.key)&&f.value!==null){predictedConditions++;if(truth?.value===f.value)correctConditions++;}
      citationCount++;if(supported(p,f))citationSupported++;
      if(f.source==='IMAGE'&&f.bboxNorm&&truth)ious.push(bboxIou(f.bboxNorm,truth.bboxNorm));
    }
    const expected=p.expected.requiredRetrievalKeys.map(k=>p.id+':'+k);
    // A repeated or unsupported returned ID cannot count as retrieved evidence.
    const retrieved=record.retrievedEvidenceIds.slice(0,3).filter(id=>fields.some(f=>p.id+':'+f.key===id&&supported(p,f)));
    retrievalNeeded+=expected.length;retrievalFound+=expected.filter(id=>retrieved.includes(id)).length;
    const predicted=inferredEligibility(fields);if(predicted==='UNKNOWN')unknown++;
    if(predicted==='ELIGIBLE'&&p.expected.eligibility==='INELIGIBLE')falseEligible.push(p.id);
    if(predicted==='ELIGIBLE'&&p.expected.eligibility==='UNKNOWN')unsupportedEligible.push(p.id);
    const deadline=fields.find(f=>f.key==='APPLY_DEADLINE')?.value??null;
    return {posterId:p.id,predictedEligibility:predicted,referenceEligibility:p.expected.eligibility,
      applyDeadlineCorrect:deadline===p.expected.applyDeadline,error:record.error!==null};
  });
  const sumKnown=(name:'inputTokens'|'outputTokens'|'billedKrw')=>records.some(r=>r[name]===null)?null:records.reduce((n,r)=>n+r[name]!,0);
  return {metrics:manifest.posters.length?{conditionPrecision:ratio(correctConditions,predictedConditions),conditionRecall:ratio(correctConditions,expectedConditions),
    citationSupport:ratio(citationSupported,citationCount),retrievalRecallAt3:ratio(retrievalFound,retrievalNeeded),
    bboxIou:{count:ious.length,mean:ious.length?ious.reduce((a,b)=>a+b,0)/ious.length:null},
    falseEligible,unsupportedEligible,unknown,coverage:ratio(completed,manifest.posters.length),
    applicationDeadlineAccuracy:ratio(perPoster.filter(p=>p.applyDeadlineCorrect).length,manifest.posters.length),perPoster}:null,
    measurement:{latency:distribution(records.map(r=>r.latencyMs)),inputTokens:sumKnown('inputTokens'),outputTokens:sumKnown('outputTokens'),
      billedKrw:sumKnown('billedKrw'),errors:records.filter(r=>r.error!==null).length}};
}
export function evaluateTemporalFixtures(manifest:MediaFixtureManifest){
  const cases=manifest.temporalCases.map(c=>{
    const selected=selectCurrentRevisions(c.revisions.map(r=>r.revision),c.asOf);
    const currentRevisionIds=[...selected.current.values()].map(r=>r.revisionId).sort();
    const quarantined=selected.quarantined.map(q=>[q.revisionId,q.reason]).sort();
    const current=c.revisions.filter(r=>currentRevisionIds.includes(r.revision.revisionId)),at=Date.parse(c.asOf);
    const futureLeaks=current.filter(r=>[r.revision.fetchedAt,r.revision.publishedAt,r.revision.lastVerifiedAt].some(t=>t!==undefined&&Date.parse(t)>at));
    return {caseId:c.id,asOf:c.asOf,currentRevisionIds,quarantined,
      citations:current.map(r=>({revisionId:r.revision.revisionId,originalSha256:r.original.sha256,span:r.evidence.span})),
      expectedMatches:canonicalJson(currentRevisionIds)===canonicalJson(c.expected.currentRevisionIds)&&canonicalJson(quarantined)===canonicalJson(c.expected.quarantined),
      futureLeaks:futureLeaks.length};
  });
  return {status:'SYNTHETIC_SELECTOR_EXECUTED',passed:cases.filter(c=>c.expectedMatches&&c.futureLeaks===0).length,total:cases.length,
    futureLeaks:cases.reduce((n,c)=>n+c.futureLeaks,0),cases};
}
export interface MediaReferenceContext {
  packet:MediaReviewPackage;ledger:unknown;authority?:ReviewerAuthority;now:string;reference:'INDEPENDENT'|'SYNTHETIC_TEST';
}
function reviewedReference(manifest:MediaFixtureManifest,context?:MediaReferenceContext){
  if(!context)return {manifest,referenceKind:manifest.referenceKind,review:{independentHumanLabelled:0,
    syntheticSignedCases:0,independentGoldReview:'NOT_RUN',posterGoldCoverage:ratio(20,20),temporalGoldCoverage:ratio(12,12),
    referencePopulation:'AUTHORED_SYNTHETIC_ONLY'}};
  const packet=validateMediaReviewPackage(context.packet);
  if(packet.corpusSha256!==manifest.manifestSha256)throw new Error('Media review scope changed');
  const report=inspectReviewLedger(context.ledger,packet,context);
  const records=context.reference==='INDEPENDENT'?report.verifiedHumanRecords:report.verifiedSyntheticRecords;
  const posters=manifest.posters.flatMap(original=>{
    const record=records.find(r=>r.caseId===original.id);if(!record)return [];
    const assessment=record.assessment;if(assessment.kind!=='POSTER')throw new Error('Wrong media review kind');
    const p=structuredClone(original);p.expected.eligibility=assessment.eligibility;
    for(const field of p.fields){const corrected=assessment.fields.find(f=>f.evidenceId===field.evidenceId)!;
      field.value=corrected.value;field.bboxNorm=[...corrected.bboxNorm];
      if(field.key==='APPLY_DEADLINE')p.expected.applyDeadline=corrected.value;
      if(field.key==='EVENT_DATE')p.expected.eventDate=corrected.value;}
    return [p];
  });
  const temporalCases=manifest.temporalCases.flatMap(original=>{
    const record=records.find(r=>r.caseId===original.id);if(!record)return [];
    const assessment=record.assessment;if(assessment.kind!=='TEMPORAL')throw new Error('Wrong media review kind');
    return [{...structuredClone(original),expected:{currentRevisionIds:[...assessment.currentRevisionIds].sort(),
      quarantined:[...assessment.quarantined].sort()}}];
  });
  const count=posters.length+temporalCases.length;
  return {manifest:{...manifest,posters,temporalCases},
    referenceKind:context.reference==='SYNTHETIC_TEST'?(count?'SYNTHETIC_SIGNED_REFERENCE':'SYNTHETIC_TEST_NOT_RUN'):
      count===0?'INDEPENDENT_NOT_RUN':count===32?'SIGNED_REFERENCE':'PARTIAL_SIGNED_REFERENCE',
    review:{independentHumanLabelled:report.independentHumanLabelled,syntheticSignedCases:report.syntheticSignedCases,
      independentGoldReview:report.independentGoldReview,posterGoldCoverage:ratio(posters.length,20),
      temporalGoldCoverage:ratio(temporalCases.length,12),referencePopulation:context.reference,ledgerHead:report.ledgerHead}};
}
/** Offline observation import only. No network/provider client or right-granting
 * Boolean is provided. Imported measurements do not establish paid/live acceptance. */
export function mediaComparisonReport(raw:MediaFixtureManifest,assets:ReadonlyMap<string,Uint8Array>,observations:readonly unknown[]=[],referenceContext?:MediaReferenceContext){
  const manifest=validateMediaFixturePack(raw,assets),reference=reviewedReference(manifest,referenceContext),seen=new Set<string>();
  const imported=observations.map(value=>{
    const o=MediaObservationSchema.parse(value);if(o.manifestSha256!==manifest.manifestSha256||seen.has(o.mode))throw new Error('Unbound media observation');
    seen.add(o.mode);const ids=new Set<string>();
    for(const r of o.records){const p=manifest.posters.find(p=>p.id===r.posterId);
      if(!p||ids.has(r.posterId)||r.imageSha256!==p.image.originalSha256||r.htmlSha256!==p.html.originalSha256
        ||new Set(r.fields.map(f=>f.key)).size!==r.fields.length)throw new Error('Unbound media record');ids.add(r.posterId);}
    return o;
  });
  const html=summarize(reference.manifest,manifest.posters.map(p=>htmlRecord(p,assets.get(p.html.path)!)));
  const modes=[{mode:'HTML_ONLY',status:'SYNTHETIC_HTML_EXECUTED',...html},
    ...(['HTML_GENERAL_OCR','HTML_GENERAL_OCR_HCX'] as const).map(mode=>{
      const o=imported.find(o=>o.mode===mode);
      return o?{mode,status:o.provenance,...summarize(reference.manifest,o.records)}:
        {mode,status:'NOT_RUN',metrics:null,measurement:null};
    })];
  return {schemaVersion:'media-comparison-report-v1',manifestSha256:manifest.manifestSha256,demoAsOf:manifest.demoAsOf,
    referenceKind:reference.referenceKind,independentHumanReview:reference.review.independentGoldReview,review:reference.review,providerAcceptance:'NOT_ESTABLISHED',
    modes,temporal:{...evaluateTemporalFixtures(reference.manifest),status:reference.manifest.temporalCases.length?'SYNTHETIC_SELECTOR_EXECUTED':'NOT_RUN',
      availableFixtures:12,goldCoverage:reference.review.temporalGoldCoverage},
    limitations:['Authored Latin bitmap text; not real Korean poster/OCR accuracy.','Twenty per-mode samples do not establish a 50-sample latency gate.',
      'No external calls or operational source rights are granted.','Independent bbox/source and human review remain separate.']};
}
