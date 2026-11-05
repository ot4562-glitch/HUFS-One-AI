import {createHash} from 'node:crypto';
import {DemoProfileRecordSchema,DemoProfileSaveSchema,DemoProfileResetSchema,DemoProfileResponseSchema,
  DemoProfileWorkspaceSaveSchema,DEMO_PROFILE_NAMESPACE,type DemoProfileRecord,type DemoProfileSave,
  type DemoProfileReset,type DemoProfileWorkspaceSave,type DemoProfileResponse} from '@hufs-one/contracts';
import {blankLocalAccountProfile,recomputeLocalAccount} from '../local-accounts/store.js';
import {composeFeed} from '../../../../../packages/core/src/opportunities/feed.js';
import {explainRecommendation} from '../../../../../packages/core/src/opportunities/explain.js';
import {DEFAULT_RANK_CONFIG} from '../../../../../packages/core/src/opportunities/rank.js';
import {buildCalendar} from '../../../../../packages/core/src/opportunities/calendar.js';
import {DEMO_AS_OF,DEMO_CORPUS_VERSION,DEMO_OPPORTUNITIES,DEMO_PUBLISHED_AT} from '../../../../../packages/core/src/opportunities/demo-corpus.js';
import {composeNotices,type NoticeStudent} from '../../../../../packages/core/src/notices/notice.js';
import {DEMO_NOTICES} from '../../../../../packages/core/src/notices/demo-notices.js';

export class DemoProfileConflict extends Error{constructor(){super('Demo profile version conflict');}}
/** One verified actor and version for both synthetic profile and workspace. */
export interface DemoProfileStore {
  read(actorId:string):Promise<DemoProfileRecord>;
  save(actorId:string,input:DemoProfileSave):Promise<DemoProfileRecord>;
  reset(actorId:string,input:DemoProfileReset):Promise<DemoProfileRecord>;
  saveWorkspace?(actorId:string,input:DemoProfileWorkspaceSave):Promise<DemoProfileRecord>;
}
export interface DemoProfilePort {
  read(actorId:string):Promise<DemoProfileResponse>;
  save(actorId:string,input:DemoProfileSave):Promise<DemoProfileResponse>;
  reset(actorId:string,input:DemoProfileReset):Promise<DemoProfileResponse>;
  saveWorkspace?(actorId:string,input:DemoProfileWorkspaceSave):Promise<DemoProfileResponse>;
}
const corpusHash=createHash('sha256').update(JSON.stringify({version:DEMO_CORPUS_VERSION,
  opportunities:DEMO_OPPORTUNITIES,notices:DEMO_NOTICES})).digest('hex');
/** Pure synthetic projection. Draft tags affect relevance only after explicit simulation;
 * self-reported credits/major/tags never become official eligibility or transcript facts. */
export function recomputeDemoProfile(raw:unknown):DemoProfileResponse {
  const profile=DemoProfileRecordSchema.parse(raw),p=profile.value,w=profile.workspace;
  const localProfile={...blankLocalAccountProfile(),primaryMajor:p.primaryMajor,
    earnedCredits:p.earnedCreditUnits===null?null:p.earnedCreditUnits/2,interestTopics:p.interestTopics,
    doubleMajorStatus:p.doubleMajor===null?'UNSET' as const:p.doubleMajor.kind==='NONE'?'NONE' as const:'SELECTED' as const,
    doubleMajor:p.doubleMajor?.kind==='DOUBLE'?p.doubleMajor.major:null};
  const {experienceOverlay,...localWorkspace}=w;
  const local=recomputeLocalAccount({sessionId:'SYNTHETIC_EMPTY_PROFILE',accountId:'BLANK_DEMO',
    revision:profile.version,profile:localProfile,workspace:localWorkspace});
  const topics=experienceOverlay==='ON'?[...new Set(w.experiences.flatMap(e=>e.topicCodes))].sort():[];
  const feed=composeFeed({interestTopics:p.interestTopics,desiredJobTopics:[],approvedExperienceTopics:topics,
    approvedLanguageCodes:[],officialMajorTopics:[],facts:{}},DEMO_OPPORTUNITIES,
    {asOf:DEMO_AS_OF,publishedAtBySnapshotId:DEMO_PUBLISHED_AT});
  const student:NoticeStudent={openRequirementIds:null,courseIds:w.planCourseIds,interestTopics:p.interestTopics};
  if(p.primaryMajor!==null)student.majors=[{major:p.primaryMajor,role:'PRIMARY'},
    ...(p.doubleMajor?.kind==='DOUBLE'?[{major:p.doubleMajor.major,role:'DOUBLE' as const}]:[])];
  const notices=composeNotices(student,DEMO_NOTICES,{asOf:DEMO_AS_OF});
  const visible=[...feed.all,...feed.ineligible,...feed.closed];
  const catalog=visible.map(r=>r.opportunity);
  const allCards=visible.map(r=>({opportunityId:r.opportunity.id,displayMode:'COMPACT_LIST' as const,
    title:r.opportunity.title,eligibility:r.evaluation.eligibility,lifecycle:r.evaluation.lifecycle,
    topics:r.opportunity.topicCodes,evidenceRefs:r.evaluation.evidenceRefs,score:r.score.total,
    dataMode:'SYNTHETIC' as const,explanation:explainRecommendation(r,DEFAULT_RANK_CONFIG)}));
  return DemoProfileResponseSchema.parse({profile,snapshot:{namespace:DEMO_PROFILE_NAMESPACE,
    dataMode:'SYNTHETIC',verification:'UNVERIFIED_SELF_REPORT',version:profile.version,asOf:DEMO_AS_OF,
    feed:feed.feed,notices:notices.result,clubs:local.clubs,academics:local.academics,forecast:local.forecast,
    workspace:w,calendar:buildCalendar(feed,notices,DEMO_NOTICES,{asOf:DEMO_AS_OF,savedOpportunityIds:w.bookmarks}),
    catalog,allCards,experienceSignals:{mode:experienceOverlay==='ON'?'SYNTHETIC_OVERLAY':'OFF',topics},
    corpus:{version:DEMO_CORPUS_VERSION,opportunities:DEMO_OPPORTUNITIES.length,notices:DEMO_NOTICES.length,profiles:5,sha256:corpusHash}}});
}
export class DemoProfileService implements DemoProfilePort {
  constructor(private readonly store:DemoProfileStore){}
  private async result(actorId:string,record:DemoProfileRecord):Promise<DemoProfileResponse>{
    const response=recomputeDemoProfile(record);
    const current=DemoProfileRecordSchema.parse(await this.store.read(actorId));
    if(JSON.stringify(current)!==JSON.stringify(response.profile))throw new DemoProfileConflict();
    return response;
  }
  async read(actorId:string){return this.result(actorId,await this.store.read(actorId));}
  async save(actorId:string,raw:DemoProfileSave){
    return this.result(actorId,await this.store.save(actorId,DemoProfileSaveSchema.parse(raw)));
  }
  async reset(actorId:string,raw:DemoProfileReset){
    return this.result(actorId,await this.store.reset(actorId,DemoProfileResetSchema.parse(raw)));
  }
  async saveWorkspace(actorId:string,raw:DemoProfileWorkspaceSave){
    const input=DemoProfileWorkspaceSaveSchema.parse(raw);
    if(!this.store.saveWorkspace)throw Error('Synthetic workspace provider unavailable');
    return this.result(actorId,await this.store.saveWorkspace(actorId,input));
  }
}
