import {describe,it,expect} from 'vitest';
import {FeedResultSchema,NoticeResultSchema,OpportunitySchema,EvidenceSpanSchema,EligibilityConditionSchema,RECOMMENDATION_SCORE_DISCLAIMER,TOPIC_CODES} from '@hufs-one/contracts';
import {fixture} from './helpers.js';
const original=fixture<{feed:{featured:any[];compact:any[];totalCandidates:number};notices:{items:any[];pinnedIds:string[]}}> ('synthetic/demo-snapshot.json');
describe('A04/A05/A07 recommendation/notice wire shape',()=>{
  it('accepts complete featured/compact feed',()=>{
    expect(FeedResultSchema.safeParse(original.feed).success).toBe(true);
  });
  it('caps featured at 3, compact at 6',()=>{
    expect(FeedResultSchema.safeParse({...original.feed,featured:Array(4).fill(original.feed.featured[0])}).success).toBe(false);
    expect(FeedResultSchema.safeParse({...original.feed,compact:Array(7).fill(original.feed.compact[0])}).success).toBe(false);
  });
  it('denies same opportunity appearing twice and mismatched mode',()=>{
    const duplicate={...original.feed,compact:[{...original.feed.compact[0],opportunityId:original.feed.featured[0].opportunityId}]};
    expect(FeedResultSchema.safeParse(duplicate).success).toBe(false);
    const wrong={...original.feed,featured:[{...original.feed.featured[0],displayMode:'COMPACT_LIST'}]};
    expect(FeedResultSchema.safeParse(wrong).success).toBe(false);
  });

  it('accepts an optional deterministic explanation bound to the correct feed card',()=>{
    const base=original.feed.featured[0];
    const weights=[35,25,15,10,5,10];
    const points=[35,25,15,0,0,5];
    const breakdown=(['J','I','S','L','M','F'] as const).map((key,i)=>({
      key,label:key,points:points[i],max:weights[i],
    }));
    const explanation={
      opportunityId:base.opportunityId,
      relevance:{score:80,level:'HIGH',label:'관련 높음',breakdown,disclaimer:RECOMMENDATION_SCORE_DISCLAIMER},
      reasons:[{code:'JOB_MATCH',text:'등록된 관심 주제와 일치합니다.',topics:base.topics.slice(0,1)}],
      eligibility:{state:base.eligibility,text:'공식 지원 조건은 별도 확인하세요.',fields:[],evidenceRefs:[]},
      deadline:{kind:'UNKNOWN',text:'원문 마감 확인 필요'},
      prioritySelectionCount:0,provenance:'CODE_RULES',rankConfigVersion:'rank-v1.0',
    };
    const card={...base,score:80,explanation};
    const feed={...original.feed,featured:[card,...original.feed.featured.slice(1)]};
    const result=FeedResultSchema.parse(feed);
    expect(result.featured[0]?.explanation?.relevance.score).toBe(80);
    // Old feed cards without explanations still parse.
    expect(FeedResultSchema.safeParse(original.feed).success).toBe(true);
    const invalid=(explanationPatch:Record<string,unknown>)=>{
      const altered={...explanation,...explanationPatch};
      return FeedResultSchema.safeParse({...feed,featured:[{...card,explanation:altered}]}).success;
    };
    expect(invalid({opportunityId:'DIFFERENT-CARD'})).toBe(false);
    expect(invalid({provenance:'MODEL_CONFIDENCE'})).toBe(false);
    expect(invalid({relevance:{...explanation.relevance,score:101}})).toBe(false);
    expect(invalid({relevance:{...explanation.relevance,score:0.7}})).toBe(false);
    expect(invalid({relevance:{...explanation.relevance,disclaimer:'취업 확률 80%'}})).toBe(false);
    expect(invalid({relevance:{...explanation.relevance,breakdown:breakdown.slice(0,5)}})).toBe(false);
    expect(invalid({reasons:[{...explanation.reasons[0],topics:[TOPIC_CODES.find(t=>!base.topics.includes(t))!]}]})).toBe(false);
    expect(invalid({deadline:{kind:'CONFIRMED',text:'검증됨'}})).toBe(false);
    expect(invalid({deadline:{kind:'EVENT_ONLY',text:'행사 기간',iso:'2026-11-10T09:00:00.000Z'}})).toBe(false);
    expect(FeedResultSchema.safeParse({...feed,featured:[{...card,score:54}]}).success).toBe(false);
  });
  it('accepts Notices with actual applicability/priority and max 2 pinned',()=>{
    expect(NoticeResultSchema.safeParse(original.notices).success).toBe(true);
    expect(NoticeResultSchema.safeParse({...original.notices,pinnedIds:['A','B','C']}).success).toBe(false);
    expect(NoticeResultSchema.safeParse({...original.notices,pinnedIds:['UNKNOWN']}).success).toBe(false);
  });
  it('rejects unsafe eligibility predicate field and invalid evidence offsets',()=>{
    expect(EligibilityConditionSchema.safeParse({field:'customJs',operator:'EQ',value:'x',evidenceId:'EV-1'}).success).toBe(false);
    expect(EvidenceSpanSchema.safeParse({evidenceId:'EV-1',sourceId:'SRC-1',snapshotVersion:'v1',paragraphId:'p1',quote:'test',startCodePoint:4,endCodePoint:2}).success).toBe(false);
  });
  it('rejects grade or raw transcript data appended to an Opportunity',()=>{
    const object={id:'SYN-OPP',version:'v1',sourceSnapshotId:'SYN-SRC',title:'가상 신청',organization:'시연용 기관',kind:'CONTEST',
      topicCodes:['DATA_ANALYTICS'],languageCodes:[],eventSessions:[],actualApplicationRoute:'DEMO_DISABLED',conditions:[],
      roleSteps:[],prioritySelection:[],completionRules:[],dataMode:'SYNTHETIC',dataQuality:'COMPLETE'};
    expect(OpportunitySchema.safeParse(object).success).toBe(true);
    expect(OpportunitySchema.safeParse({...object,privateStudentName:'SYN-PRIVATE'}).success).toBe(false);
    // Optional classification carries evidence only; no default is invented for old rows.
    expect(OpportunitySchema.safeParse({...object,kind:'EXTRACURRICULAR',programScope:'ON_CAMPUS',deadlineKind:'ROLLING'}).success).toBe(true);
    expect(OpportunitySchema.safeParse({...object,programScope:'SCHOOL_ASSUMED'}).success).toBe(false);
    expect(OpportunitySchema.safeParse({...object,deadlineKind:'PROBABLE'}).success).toBe(false);
  });
});
