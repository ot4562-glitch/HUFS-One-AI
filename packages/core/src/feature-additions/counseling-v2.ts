/** #345 — purpose-aware routing to verified institutional help. */
import type {FeatureAdditions as C} from '@hufs-one/contracts';
import {safeIntersection,verifySource,type FeatureMode} from './source-policy.js';

export type CounselingMatch={
  serviceId:string; score:number; exactPurposes:readonly string[];
  relatedPurposes:readonly string[];
  audienceState:'CONFIRMED'|'UNKNOWN';
  campusState:'CONFIRMED'|'UNKNOWN';
  languageState:'CONFIRMED'|'UNKNOWN';
  officialApplicationUrl:string|null;
  sourceRevisionId:string;
};
export type CounselingGuide={matches:readonly CounselingMatch[];excluded:number;
  status:'MATCHES'|'NO_MATCH'|'NO_PURPOSE';};
export function routeCounselingV2(input:{
  purposes:readonly string[];
  campus?:string;
  language?:string;
  audienceCodes?:readonly string[];
  services:readonly C.CounselingService[];
  asOf:string;
  mode?:FeatureMode;
}):CounselingGuide{
  if (!input.purposes.length) return {matches:[],excluded:0,status:'NO_PURPOSE'};
  let excluded=0;
  const seen=new Set<string>();
  const matches=input.services.flatMap(s=>{
    if (seen.has(s.id)) {excluded++;return [];}
    seen.add(s.id);
    if (!s.active || !verifySource(s.source,input.asOf,input.mode).usable
      || (input.campus && s.campuses.length>0 && !s.campuses.includes(input.campus))
      || (input.language && s.languages.length>0 && !s.languages.includes(input.language))
      || (input.audienceCodes?.length && s.audienceCodes.length>0
        && safeIntersection(input.audienceCodes,s.audienceCodes).length===0)) {
      excluded++;return [];
    }
    const exact=safeIntersection(input.purposes,s.purposeCodes);
    const related=safeIntersection(input.purposes,s.relatedPurposeCodes).filter(x=>!exact.includes(x));
    if (!exact.length&&!related.length) return [];
    // Unknown audience/campus/language is not evidence of universal availability.
    const audienceKnown=input.audienceCodes?.length
      ? !!safeIntersection(input.audienceCodes,s.audienceCodes).length : s.audienceCodes.length===0;
    const audienceState=audienceKnown?'CONFIRMED' as const:'UNKNOWN' as const;
    const campusState=input.campus&&s.campuses.includes(input.campus)
      ?'CONFIRMED' as const:'UNKNOWN' as const;
    const languageState=input.language&&s.languages.includes(input.language)
      ?'CONFIRMED' as const:'UNKNOWN' as const;
    const campus=campusState==='CONFIRMED'?1:0;
    const language=languageState==='CONFIRMED'?1:0;
    const score=3*exact.length+related.length+campus+language;
    let officialApplicationUrl:string|null=null;
    try {
      if (s.officialUrl) {
        const url=new URL(s.officialUrl);
        if (url.protocol==='https:' && !url.username && !url.password
          && url.hostname!=='localhost' && !url.hostname.endsWith('.local'))
          officialApplicationUrl=url.href;
      }
    } catch { /* untrusted URL is not a valid application destination */ }
    return [{serviceId:s.id,score,exactPurposes:exact,relatedPurposes:related,
      audienceState,campusState,languageState,officialApplicationUrl,
      sourceRevisionId:s.source.revisionId}];
  });
  matches.sort((a,b)=>b.score-a.score||a.serviceId.localeCompare(b.serviceId,'en'));
  return {matches:matches.slice(0,3),excluded,status:matches.length?'MATCHES':'NO_MATCH'};
}
