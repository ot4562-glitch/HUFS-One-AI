import type {Opportunity} from '@hufs-one/contracts';
import {DEMO_AS_OF,DEMO_CORPUS_VERSION,DEMO_OPPORTUNITIES,DEMO_OPPORTUNITY_NOTES,DEMO_PUBLISHED_AT,DEMO_SPLIT} from '../opportunities/demo-corpus.js';
import {DEMO_LABELS,DEMO_LABEL_REVIEW,DEMO_STUDENTS} from '../opportunities/demo-profiles.js';
import {DEMO_NOTICES} from '../notices/demo-notices.js';
import {canonicalJson,hashBytes,hashCanonical,ZERO_HEAD} from './canonical.js';

export interface ReviewEvidence {
  evidenceId:string;sourceId:string;sourceRevisionId:string;originalSha256:string;
  span:{kind:'TEXT';sourceRevisionId:string;paragraphId:string;start:number;end:number;quote:string};
}
export interface ReviewSource {
  sourceId:string;sourceRevisionId:string;version:string;provenance:'SYNTHETIC_DERIVED_CANONICAL';
  text:string;originalSha256:string;paragraphs:Array<{id:string;text:string}>;
}
export interface RecommendationReviewCase {
  caseId:string;kind:'RECOMMENDATION';profileId:string;opportunityId:string;split:'TUNING'|'REPORT';
  sourceId:string;sourceRevisionId:string;originalSha256:string;profileSha256:string;caseSha256:string;
  draft:{relevance:0|1|2;reviewerRole:string;status:string};
  conditions:Opportunity['conditions'];evidence:ReviewEvidence[];
}
export interface ReviewPackage {
  schemaVersion:'independent-review-package-v1';gateId:'D01';datasetId:string;datasetKind:'RECOMMENDATION';
  demoAsOf:string;targetCommit:string;creatorRefs:string[];corpusSha256:string;packageSha256:string;
  sourceKind:'SYNTHETIC';independentGoldReview:'PENDING';
  sources:ReviewSource[];
  profiles:Array<{profileId:string;label:string;profileSha256:string;student:typeof DEMO_STUDENTS[number]}>;
  cases:RecommendationReviewCase[];
}
function sourceFor(o:Opportunity):ReviewSource{
  const paragraphs=[
    {id:'title',text:o.title},{id:'organization',text:o.organization},{id:'kind',text:o.kind},
    {id:'declared-topics',text:'Draft topic features: '+o.topicCodes.join(', ')},
    {id:'application-route',text:'Application route: '+o.actualApplicationRoute},
    {id:'apply-open',text:'Apply opens: '+(o.applyOpensAt??'UNKNOWN')},
    {id:'apply-deadline',text:'Apply deadline: '+(o.applyClosesAt??'UNKNOWN')},
    {id:'events',text:'Event sessions (not application deadlines): '+canonicalJson(o.eventSessions)},
    ...o.conditions.map((c,i)=>({id:'condition-'+(i+1),text:c.field+' '+c.operator+' '+canonicalJson(c.value)+' ['+c.evidenceId+']'})),
    {id:'priority',text:'Priority selection (not eligibility): '+canonicalJson(o.prioritySelection)},
    {id:'completion',text:'Completion rules (not eligibility): '+canonicalJson(o.completionRules)},
    {id:'quality',text:'Data quality: '+o.dataQuality},
  ];
  const text='SYNTHETIC CANONICAL REVIEW SOURCE v1\n'+o.sourceSnapshotId+'\n'+
    paragraphs.map(p=>p.id+'\t'+p.text).join('\n')+'\n';
  return {sourceId:o.sourceSnapshotId,sourceRevisionId:o.sourceSnapshotId,version:o.version,
    provenance:'SYNTHETIC_DERIVED_CANONICAL',text,originalSha256:hashBytes(text),paragraphs};
}
export function canonicalCorpusHash():string{
  return hashCanonical({version:DEMO_CORPUS_VERSION,asOf:DEMO_AS_OF,opportunities:DEMO_OPPORTUNITIES,
    profiles:DEMO_STUDENTS,notices:DEMO_NOTICES,split:DEMO_SPLIT,publishedAt:DEMO_PUBLISHED_AT,
    draftLabels:DEMO_LABELS,draftReview:DEMO_LABEL_REVIEW,notes:DEMO_OPPORTUNITY_NOTES});
}
/** One source of truth: no replacement of legacy demo-snapshot or extra ranking corpus. */
export function buildReviewPackage(input:{targetCommit:string}):ReviewPackage{
  if(!/^[a-f0-9]{40}$/.test(input.targetCommit))throw new Error('Exact target commit required');
  const opportunities=[...DEMO_OPPORTUNITIES].sort((a,b)=>a.id<b.id?-1:1);
  const students=[...DEMO_STUDENTS].sort((a,b)=>a.subject<b.subject?-1:1);
  if(opportunities.length!==40||students.length!==5
    ||opportunities.filter(o=>DEMO_SPLIT[o.id]==='TUNING').length!==20
    ||opportunities.filter(o=>DEMO_SPLIT[o.id]==='REPORT').length!==20)throw new Error('Canonical corpus shape changed');
  const sources=opportunities.map(sourceFor);
  const profiles=students.map(student=>({profileId:student.subject,label:student.label,
    profileSha256:hashCanonical(student),student:structuredClone(student)}));
  const cases:RecommendationReviewCase[]=profiles.flatMap(p=>opportunities.map((o,index)=>{
    const s=sources[index]!,review=DEMO_LABEL_REVIEW[p.student.subject];
    const evidence:ReviewEvidence[]=s.paragraphs.map(paragraph=>({
      evidenceId:s.sourceId+':'+paragraph.id,sourceId:s.sourceId,sourceRevisionId:s.sourceRevisionId,
      originalSha256:s.originalSha256,span:{kind:'TEXT',sourceRevisionId:s.sourceRevisionId,
        paragraphId:paragraph.id,start:0,end:paragraph.text.length,quote:paragraph.text},
    }));
    const value={caseId:p.profileId+':'+o.id,kind:'RECOMMENDATION' as const,profileId:p.profileId,
      opportunityId:o.id,split:DEMO_SPLIT[o.id]!,sourceId:s.sourceId,sourceRevisionId:s.sourceRevisionId,
      originalSha256:s.originalSha256,profileSha256:p.profileSha256,
      draft:{relevance:DEMO_LABELS[p.student.subject][o.id]!,reviewerRole:review.reviewerRole,status:review.status},
      conditions:structuredClone(o.conditions),evidence};
    return {...value,caseSha256:hashCanonical(value)};
  }));
  const result={schemaVersion:'independent-review-package-v1' as const,gateId:'D01' as const,
    datasetId:DEMO_CORPUS_VERSION,datasetKind:'RECOMMENDATION' as const,demoAsOf:DEMO_AS_OF,targetCommit:input.targetCommit,
    creatorRefs:['github:qamarrchae','SYSTEM:RECOMMENDATION_DRAFT'],corpusSha256:canonicalCorpusHash(),
    sourceKind:'SYNTHETIC' as const,independentGoldReview:'PENDING' as const,sources,profiles,cases};
  return {...result,packageSha256:hashCanonical(result)};
}
/** Reject edited source/profile/split/draft bytes even if their local hashes were recomputed. */
export function validateReviewPackage(raw:unknown):ReviewPackage{
  const value=raw as Partial<ReviewPackage>;
  if(!value||typeof value.targetCommit!=='string')throw new Error('Invalid review package');
  const expected=buildReviewPackage({targetCommit:value.targetCommit});
  if(canonicalJson(raw)!==canonicalJson(expected))throw new Error('Stale or modified review package');
  return expected;
}
export function emptyReviewTemplate(packet:ReviewPackage){
  const p=validateReviewPackage(packet);
  return {schemaVersion:'review-submission-v1',gateId:'D01',submissionId:null,signatureId:null,
    packageSha256:p.packageSha256,targetCommit:p.targetCommit,reviewerId:null,signedAt:null,expectedLedgerHead:ZERO_HEAD,
    reviews:p.cases.map(c=>({reviewId:null,caseId:c.caseId,caseSha256:c.caseSha256,reviewedAt:null,
      decision:'NOT_RUN',assessment:null,rationale:'',unknownReason:null,evidence:[],reviewEvidenceId:null,
      amendsReviewId:null,correctionReason:null,anchor:{selected:false,reason:null}})),
  };
}
