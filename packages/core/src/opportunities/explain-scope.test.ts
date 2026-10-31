import {describe, it, expect} from 'vitest';
import {FeedResultSchema, OpportunitySchema} from '@hufs-one/contracts';
import {composeFeed, scopeInputsToGrant, type RecommendationProfile} from './index.js';
import type {NoticeStudent} from '../notices/index.js';

// Synthetic only. Explanations on the FeedCard wire must not reveal sections the grant does not share (#41 review).
const ASOF = '2026-11-20T00:00:00.000Z';
const profile:RecommendationProfile = {
  interestTopics:['AI_ML'], desiredJobTopics:[], approvedExperienceTopics:['DATA_ANALYTICS'],
  approvedLanguageCodes:[], officialMajorTopics:['DATA_ANALYTICS'], facts:{},
};
const student:NoticeStudent = {openRequirementIds:[], courseIds:[], interestTopics:['AI_ML']};
const opp = OpportunitySchema.parse({
  id:'SYN-OPP-D1', version:'v1', sourceSnapshotId:'SNAP-D1', title:'가상 데이터·AI 공모전', organization:'시연가상기관 A', kind:'CONTEST',
  topicCodes:['DATA_ANALYTICS', 'AI_ML'], languageCodes:[], applyClosesAt:'2026-12-01T00:00:00.000Z', eventSessions:[],
  actualApplicationRoute:'DEMO_DISABLED', conditions:[], roleSteps:[], prioritySelection:[], completionRules:[], dataMode:'SYNTHETIC', dataQuality:'COMPLETE',
});
const reasonCodes = (p:RecommendationProfile) => {
  const feed = FeedResultSchema.parse(JSON.parse(JSON.stringify(composeFeed(p, [opp], {asOf:ASOF}).feed)));
  const card = [...feed.featured, ...feed.compact][0]!;
  return {codes:card.explanation!.reasons.map(r => r.code), breakdown:card.explanation!.relevance.breakdown};
};

describe('FeedCard.explanation after scopeInputsToGrant (#41 review, #49)', () => {
  it('with EXPERIENCE and ACADEMICS shared, experience and major reasons are present', () => {
    const s = scopeInputsToGrant(profile, student, ['FEED', 'NOTICES', 'EXPERIENCE', 'ACADEMICS']);
    const {codes, breakdown} = reasonCodes(s.profile!);
    expect(codes).toEqual(expect.arrayContaining(['INTEREST_MATCH', 'EXPERIENCE_MATCH', 'MAJOR_MATCH']));
    expect(breakdown.find(p => p.key === 'S')?.points).toBe(15);
  });

  it('EXPERIENCE / ACADEMICS not shared → no EXPERIENCE_MATCH / MAJOR_MATCH reason and 0 points on the wire', () => {
    const s = scopeInputsToGrant(profile, student, ['FEED', 'NOTICES']);
    const {codes, breakdown} = reasonCodes(s.profile!);
    expect(codes).toEqual(['INTEREST_MATCH']);
    expect(breakdown.find(p => p.key === 'S')?.points).toBe(0);
    expect(breakdown.find(p => p.key === 'M')?.points).toBe(0);
  });
});
