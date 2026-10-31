import {describe,it,expect} from 'vitest';
import {FeedResultSchema,NoticeResultSchema,OpportunitySchema,EvidenceSpanSchema,EligibilityConditionSchema} from '@hufs-one/contracts';
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
  it('accepts Notices with actual applicability/priority and max 2 pinned',()=>{
    expect(NoticeResultSchema.safeParse(original.notices).success).toBe(true);
    expect(NoticeResultSchema.safeParse({...original.notices,pinnedIds:['A','B','C']}).success).toBe(false);
    expect(NoticeResultSchema.safeParse({...original.notices,pinnedIds:['UNKNOWN']}).success).toBe(false);
  });
  it('preserves optional overdue boolean through the strict notice wire without breaking legacy payloads',()=>{
    expect(NoticeResultSchema.safeParse(original.notices).success).toBe(true);
    const candidate={...original.notices,items:original.notices.items.map((item:any)=>({...item,overdue:true}))};
    const parsed=NoticeResultSchema.parse(candidate);
    expect(parsed.items[0]?.overdue).toBe(true);
    expect(NoticeResultSchema.safeParse({...candidate,items:[{...candidate.items[0],overdue:'true'}]}).success).toBe(false);
    expect(NoticeResultSchema.safeParse({...candidate,items:[{...candidate.items[0],overdue:null}]}).success).toBe(false);
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
  });
});
