import {
  CareerRoadmapSchema,CareerRoadmapSourceSchema,CareerTimelineEntrySchema,ExperiencePortfolioSchema,TOPIC_CODES,
  type CareerRoadmap,type CareerTimelineEntry,type TopicCode,
} from '@hufs-one/contracts';

const DISCLAIMER='현재 페이지의 본인 승인 경험과 관심/희망 직무로 만든 탐색 안내입니다. 전체 역량 인증, 학점, 취업 적격 또는 합격 가능성이 아닙니다.' as const;

/** A bounded projection. Never infer owner-wide strengths from a paged response. */
export function buildCareerRoadmap(raw:unknown):CareerRoadmap {
  const {profile,portfolio}=CareerRoadmapSourceSchema.parse(raw);
  const own=new Set(portfolio.portfolio.topics.map(t=>t.topicCode));
  const targets=new Set<TopicCode>([
    ...profile.value.desiredJobTopics,...profile.value.interestTopics,
  ]);
  const explorationTopics=TOPIC_CODES.filter(code=>targets.has(code)&&!own.has(code));
  return CareerRoadmapSchema.parse({
    asOf:portfolio.portfolio.asOf,coverage:'PAGE',complete:portfolio.portfolio.complete,
    strengthTopics:portfolio.portfolio.topics.map(x=>({
      topicCode:x.topicCode,experienceIds:x.experienceIds,
    })),
    explorationTopics,
    nextSteps:explorationTopics.map(code=>({
      topicCode:code,kind:'EXPLORE_ACTIVITIES',
      explanation:'희망 분야의 활동·프로젝트를 직접 탐색하고 근거가 있는 경험만 본인이 기록·승인해 주세요.',
    })),
    disclaimer:DISCLAIMER,
  });
}

/**
 * Current own-account items only; synthetic items never carry approved owner
 * evidence even if a malicious caller labels an approval ACTIVE.
 * Student-provided content is not an institution-certified qualification.
 */
export function buildCareerTimeline(raw:unknown):CareerTimelineEntry[] {
  const page=ExperiencePortfolioSchema.parse(raw);
  const rows=page.items.map((record,index)=>{
    if(record.value.kind!=='EXPERIENCE')throw new Error('Non-experience in portfolio');
    const a=page.portfolio.evidence[index]!.approval;
    const active=a.state==='ACTIVE'
      &&a.contentVersion===record.version
      &&a.consentVersion===page.portfolio.consentVersion
      &&record.value.dataMode==='OWNER_CONSENTED';
    const evidence=active
      ? {state:'OWNER_APPROVED_TOPIC' as const,topicCodes:a.topics,
          experienceId:record.itemId,contentVersion:record.version}
      : {state:'NOT_CERTIFIED' as const};
    return CareerTimelineEntrySchema.parse({
      itemId:record.itemId,title:record.value.title,summary:record.value.summary,
      ...(record.value.role?{role:record.value.role}:{}),
      category:record.value.category??'OTHER',
      ...(record.value.startedOn?{startedOn:record.value.startedOn}:{}),
      ...(record.value.endedOn?{endedOn:record.value.endedOn}:{}),
      ...(record.value.sourceOpportunityId?{sourceOpportunityId:record.value.sourceOpportunityId}:{}),
      updatedAt:record.updatedAt,dataMode:record.value.dataMode,evidence,
      certification:'NOT_INSTITUTION_VERIFIED',
    });
  });
  return rows.sort((a,b)=>(
    (b.endedOn??b.startedOn??b.updatedAt).localeCompare(a.endedOn??a.startedOn??a.updatedAt)
    ||a.itemId.localeCompare(b.itemId)));
}
