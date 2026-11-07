import {
  TOPIC_CODES, type TopicCode, type SelfProfile, type SelfConsent,
  type ExperiencePortfolio, type OwnerWorkspaceRecord,
} from '@hufs-one/contracts';

/** A read-only projection over already authorized BETA-owner responses.
 * It never grants access, infers credentials, persists data, or calls an AI.
 * Every page must have been checked by the authenticated owner API first.
 */
export interface CareerExperience {
  readonly id: string;
  readonly version: number;
  readonly state: 'DRAFT'|'SELF_REPORTED';
  readonly sourceOpportunityId: string | null;
  readonly title: string;
  readonly summary: string;
  readonly role: string | null;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
  readonly updatedAt: string;
  readonly selfReported: boolean;
  readonly approvedTopics: readonly TopicCode[];
}
export interface CareerEvidence {
  readonly topicCode: TopicCode;
  readonly experienceIds: readonly string[];
}
export interface CareerBookmark {
  readonly id: string;
  readonly opportunityId: string;
  readonly stage: 'INTERESTED'|'PREPARING'|'SUBMITTED_SELF_REPORTED'|'AWAITING_RESULT'|'RESULT_RECORDED';
}
export interface OwnerCareerSnapshot {
  readonly displayName: string | null;
  readonly profileVersion: number;
  readonly asOf: string | null;
  /** A bounded cursor view is never silently called an account-wide inventory. */
  readonly complete: boolean;
  readonly consentVersion: number | null;
  readonly interestTopics: readonly TopicCode[];
  readonly desiredJobTopics: readonly TopicCode[];
  readonly approvedEvidence: readonly CareerEvidence[];
  /** Exploration prompts, not proficiency scores, qualification or hiring forecasts. */
  readonly exploreTopics: readonly TopicCode[];
  readonly experiences: readonly CareerExperience[];
  readonly bookmarks: readonly CareerBookmark[];
}
export interface OwnerCareerInputs {
  readonly profile: SelfProfile | null;
  readonly consents: SelfConsent | null;
  readonly pages: readonly ExperiencePortfolio[];
  readonly bookmarks: readonly OwnerWorkspaceRecord[];
  readonly bookmarksComplete: boolean;
}
function empty():OwnerCareerSnapshot {
  return {
    displayName:null,profileVersion:0,asOf:null,complete:false,consentVersion:null,
    interestTopics:[],desiredJobTopics:[],approvedEvidence:[],
    exploreTopics:[],experiences:[],bookmarks:[],
  };
}
const topicOrder=(items:ReadonlySet<TopicCode>):TopicCode[]=>
  TOPIC_CODES.filter(code=>items.has(code));

/** Missing or revoked personal storage consent makes the whole view empty.
 * Synthetic and stale approvals never become an owner skill signal.
 */
export function buildOwnerCareerSnapshot(input:OwnerCareerInputs):OwnerCareerSnapshot {
  const consent=input.consents;
  if(!consent?.choices.personalStorage)return empty();
  const pages=input.pages;
  if(pages.some(p=>p.portfolio.consentVersion!==consent.version))
    throw new Error('Career portfolio consent changed while reading');
  const ids=new Set<string>();
  const evidence=new Map<TopicCode,Set<string>>();
  const experiences:CareerExperience[]=[];
  for(const page of pages){
    for(const [index,record] of page.items.entries()){
      if(ids.has(record.itemId))throw new Error('Duplicate career portfolio item across cursor pages');
      ids.add(record.itemId);
      if(record.value.kind!=='EXPERIENCE')throw new Error('Non-experience portfolio item');
      // Synthetic records may be useful to a separate demo, but never belong in an actual BETA owner's career history.
      if(record.value.dataMode!=='OWNER_CONSENTED')continue;
      const approval=page.portfolio.evidence[index]?.approval;
      if(!approval)throw new Error('Portfolio evidence missing');
      const approved=approval.state==='ACTIVE'
        &&approval.contentVersion===record.version
        &&approval.consentVersion===consent.version;
      const topics=approved ? approval.topics : [];
      for(const topic of topics){
        const set=evidence.get(topic)??new Set<string>();set.add(record.itemId);evidence.set(topic,set);
      }
      experiences.push({
        id:record.itemId,version:record.version,state:record.value.state,
        sourceOpportunityId:record.value.sourceOpportunityId??null,
        title:record.value.title,summary:record.value.summary,
        role:record.value.role??null,startedOn:record.value.startedOn??null,
        endedOn:record.value.endedOn??null,updatedAt:record.updatedAt,
        selfReported:record.value.state==='SELF_REPORTED',approvedTopics:topics,
      });
    }
  }
  const bookmarkIds=new Set<string>();
  const bookmarks:CareerBookmark[]=[];
  for(const item of input.bookmarks){
    if(bookmarkIds.has(item.itemId))throw new Error('Duplicate saved item across cursor pages');
    bookmarkIds.add(item.itemId);
    if(item.value.kind!=='BOOKMARK')throw new Error('Non-bookmark item');
    if(item.value.dataMode!=='OWNER_CONSENTED')continue;
    bookmarks.push({
      id:item.itemId,opportunityId:item.value.opportunityId,
      stage:item.value.stage??'INTERESTED',
    });
  }
  experiences.sort((a,b)=>(b.startedOn??b.updatedAt).localeCompare(a.startedOn??a.updatedAt)
    ||a.id.localeCompare(b.id));
  bookmarks.sort((a,b)=>a.id.localeCompare(b.id));
  const approvedTopics=new Set(evidence.keys());
  const goals=input.profile?.value.desiredJobTopics??[];
  const interests=input.profile?.value.interestTopics??[];
  const explore=new Set([...goals,...interests].filter(t=>!approvedTopics.has(t)));
  return {
    displayName:input.profile?.value.displayName??null,
    profileVersion:input.profile?.version??0,
    asOf:pages[0]?.portfolio.asOf??null,
    complete:pages.length>0&&pages[pages.length-1]?.portfolio.complete===true&&input.bookmarksComplete,
    consentVersion:consent.version,
    interestTopics:interests,desiredJobTopics:goals,
    approvedEvidence:topicOrder(approvedTopics).map(topicCode=>({
      topicCode,experienceIds:[...(evidence.get(topicCode)??[])].sort(),
    })),
    exploreTopics:topicOrder(explore),experiences,bookmarks,
  };
}
