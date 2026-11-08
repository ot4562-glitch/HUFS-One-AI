/** #352 — reviewed locale selection and owner-only checklist reconciliation. */
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {parseAsOf,verifySource,type FeatureMode} from './source-policy.js';
export type GuideLocale='ko'|'en'|'zh';
export type GuideStep={id:string;order:number;documentCodes:readonly string[];
  officeCode?:string|undefined;sourceSpanId:string};
export type GuideResponse={
  guideId:string;sourceRevisionId:string;
  status:'READY'|'KOREAN_FALLBACK'|'UNKNOWN_SOURCE'|'NOT_APPLICABLE'
    |'APPLICABILITY_UNKNOWN'|'TRANSLATION_UNAVAILABLE';
  locale:GuideLocale;body?:string;
  steps:readonly GuideStep[];
  officialAdministrationComplete:false;
};
export function resolveInternationalGuide(input:{
  guide:C.InternationalGuide;
  locale:GuideLocale;topicCode:string;campus?:string;term?:string;
  audienceCodes?:readonly string[];
  asOf:string;mode?:FeatureMode;
}):GuideResponse {
  const {guide}=input;
  parseAsOf(input.asOf);
  const base={guideId:guide.id,sourceRevisionId:guide.source.revisionId,
    officialAdministrationComplete:false as const};
  const blank=(status:GuideResponse['status']):GuideResponse=>
    ({...base,status,locale:input.locale,steps:[]});
  if(!verifySource(guide.source,input.asOf,input.mode).usable) return blank('UNKNOWN_SOURCE');
  if(guide.topicCode!==input.topicCode) return blank('NOT_APPLICABLE');
  if(input.campus && guide.campuses.length && !guide.campuses.includes(input.campus))
    return blank('NOT_APPLICABLE');
  if(input.term && guide.terms.length && !guide.terms.includes(input.term))
    return blank('NOT_APPLICABLE');
  if(input.audienceCodes?.length && guide.audienceCodes.length
    && !input.audienceCodes.some(a=>guide.audienceCodes.includes(a)))
    return blank('NOT_APPLICABLE');
  if((!input.campus&&guide.campuses.length) || (!input.term&&guide.terms.length)
    || (!input.audienceCodes?.length&&guide.audienceCodes.length))
    return blank('APPLICABILITY_UNKNOWN');
  const validatedSteps=guide.steps.filter(s=>guide.source.evidenceSpanIds.includes(s.sourceSpanId));
  if(validatedSteps.length!==guide.steps.length
    || new Set(validatedSteps.map(s=>s.id)).size!==validatedSteps.length)
    return blank('UNKNOWN_SOURCE');
  const request=guide.translations[input.locale];
  const korean=guide.translations.ko;
  const approved=(t:typeof korean|undefined):t is typeof korean=>!!t
    && t.review==='HUMAN_VERIFIED' && t.text.trim().length>0
    && t.basedOnRevisionId===guide.source.revisionId;
  const steps=validatedSteps.map(s=>({...s,documentCodes:[...s.documentCodes]}))
    .sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id,'en'));
  if(approved(request)) return {...base,status:'READY',locale:input.locale,body:request.text,steps};
  if(approved(korean)) return {...base,status:'KOREAN_FALLBACK',locale:'ko',body:korean.text,steps};
  return blank('TRANSLATION_UNAVAILABLE');
}
export type GuideChecklist={
  guideId:string;guideRevisionId:string;ownerCheckedStepIds:readonly string[];
  expectedVersion:number;
};
export type ChecklistReconciliation={
  state:'READY'|'STALE_GUIDE'|'VERSION_CONFLICT';
  checkedStepIds:readonly string[];
  invalidatedStepIds:readonly string[];
  /** Only the owner checked boxes, not an institution. */
  officialAdministrationComplete:false;
};
export function reconcileGuideChecklist(
  guide:C.InternationalGuide,saved:GuideChecklist,
  requestedExpectedVersion:number,
):ChecklistReconciliation {
  const base={officialAdministrationComplete:false as const};
  if(saved.expectedVersion!==requestedExpectedVersion)
    return {...base,state:'VERSION_CONFLICT',checkedStepIds:[],invalidatedStepIds:[]};
  if(saved.guideId!==guide.id||saved.guideRevisionId!==guide.source.revisionId)
    return {...base,state:'STALE_GUIDE',checkedStepIds:[],
      invalidatedStepIds:[...new Set(saved.ownerCheckedStepIds)].sort()};
  const ids=new Set(guide.steps.map(step=>step.id));
  return {...base,state:'READY',
    checkedStepIds:[...new Set(saved.ownerCheckedStepIds.filter(s=>ids.has(s)))].sort(),
    invalidatedStepIds:[...new Set(saved.ownerCheckedStepIds.filter(s=>!ids.has(s)))].sort()};
}
