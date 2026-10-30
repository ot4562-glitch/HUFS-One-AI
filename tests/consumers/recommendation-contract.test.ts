import {describe,it,expect} from 'vitest';
import {FeedResultSchema,NoticeResultSchema,TopicCodeSchema,TOPIC_ALIASES_V1,OpportunitySchema,SafeLlmPacketSchema} from '@hufs-one/contracts';
import {fixture} from '../contracts/helpers.js';
const snapshot=fixture<{feed:any;notices:any}>('synthetic/demo-snapshot.json');

describe('Consumer 2: personalized recommendation and notices',()=>{
  it('consumes the same feed and notice wire objects as UI',()=>{
    const feed=FeedResultSchema.parse(snapshot.feed);
    const notices=NoticeResultSchema.parse(snapshot.notices);
    expect(feed.featured.length).toBeLessThanOrEqual(3);
    expect(feed.compact.length).toBeLessThanOrEqual(6);
    expect(notices.items[0]?.appliesTo).toBe('UNKNOWN');
  });
  it('uses the shared 24 TopicCode and explicit aliases, not guessed topics',()=>{
    expect(TopicCodeSchema.parse(TOPIC_ALIASES_V1['데이터분석'])).toBe('DATA_ANALYTICS');
    expect(TopicCodeSchema.safeParse('PREDICTED_SKILL').success).toBe(false);
  });
  it('keeps ELIGIBLE vs UNKNOWN separate even for high ranking',()=>{
    const feed=FeedResultSchema.parse(snapshot.feed);
    expect(feed.featured.find(x=>x.eligibility==='UNKNOWN')).toBeTruthy();
    expect(feed.featured[0]?.evidenceRefs.length).toBeGreaterThan(0);
    expect(FeedResultSchema.safeParse({...feed,featured:[{...feed.featured[0],eligibility:'AUTO_ACCEPTED'}]}).success).toBe(false);
  });
  it('does not make the AI result into a new eligibility or deadline source',()=>{
    const packet=fixture<Record<string,unknown>>('synthetic/safe-llm-packet.json');
    expect(SafeLlmPacketSchema.safeParse(packet).success).toBe(true);
    expect(SafeLlmPacketSchema.safeParse({...packet,task:'direct_offer_grant'}).success).toBe(false);
  });
  it('keeps notice student deadline different from admin report deadline',()=>{
    const r=NoticeResultSchema.parse(snapshot.notices);
    expect(r.items[0]?.studentDeadline).toBeUndefined();
    expect(r.items[0]?.adminReportDeadline).toBeUndefined();
    expect(NoticeResultSchema.safeParse({...r,pinnedIds:['NONEXISTENT']}).success).toBe(false);
  });
});
