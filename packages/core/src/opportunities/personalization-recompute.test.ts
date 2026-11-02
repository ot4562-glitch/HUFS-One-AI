import {describe, it, expect} from 'vitest';
import type {TopicCode} from '@hufs-one/contracts';
import {
  DEMO_AS_OF, DEMO_CLUB_POSTS, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT,
  composeClubBoard, composeFeed, explainNotFeatured,
  type ClubActivity, type ClubProfile, type RecommendationProfile,
} from './index.js';
import {DEMO_NOTICES, composeNotices, type NoticeStudent} from '../notices/index.js';

/**
 * #132 (김채윤 · 개인화 검증): an EMPTY demo account → settings A → settings B → reset.
 * Every step recomputes feed, notices and clubs from the saved inputs only; nothing falls back to a stored
 * S01–S05 fixture result, and an empty profile honestly shows "no personal match" / UNKNOWN.
 * Inputs mirror the settings screen: interests (multi), major, double major, campus, activities.
 * 취득 학점 is not a recommendation input (it belongs to the academics track), so it must not change results.
 */
interface Settings {
  interests:TopicCode[];
  majorTopics:TopicCode[];        // official major↔topic mapping of the chosen (double) major
  campus?:'SEOUL'|'GLOBAL';
  activities:ClubActivity[];
  earnedCredits?:number|null;     // carried by the account, never read by the recommendation core
}
const EMPTY:Settings = {interests:[], majorTopics:[], activities:[], earnedCredits:null};
const A:Settings = {interests:['DATA_ANALYTICS', 'AI_ML'], majorTopics:['DATA_ANALYTICS'], campus:'SEOUL', activities:['PROJECT'], earnedCredits:62};
const B:Settings = {interests:['MEDIA_CONTENT', 'MARKETING_BRAND'], majorTopics:['MEDIA_CONTENT'], campus:'SEOUL', activities:['CREATION'], earnedCredits:62};

function recompute(s:Settings) {
  const facts = s.campus ? {campus:s.campus} : {};
  const profile:RecommendationProfile = {
    interestTopics:s.interests, desiredJobTopics:[], approvedExperienceTopics:[], approvedLanguageCodes:[],
    officialMajorTopics:s.majorTopics, facts,
  };
  const student:NoticeStudent = {openRequirementIds:null, courseIds:[], interestTopics:s.interests, ...(s.campus ? {campus:s.campus} : {})};
  const club:ClubProfile = {interestTopics:s.interests, approvedExperienceTopics:[], desiredActivities:s.activities, facts, ...(s.campus ? {campus:s.campus} : {})};
  const opts = {asOf:DEMO_AS_OF, publishedAtBySnapshotId:DEMO_PUBLISHED_AT};
  const feed = composeFeed(profile, DEMO_OPPORTUNITIES, opts);
  return {
    feed,
    notFeatured:explainNotFeatured(profile, DEMO_OPPORTUNITIES, opts),
    notices:composeNotices(student, DEMO_NOTICES, {asOf:DEMO_AS_OF}),
    clubs:composeClubBoard(club, DEMO_CLUB_POSTS, {asOf:DEMO_AS_OF}),
  };
}
const featuredIds = (r:ReturnType<typeof recompute>) => r.feed.feed.featured.map(c => c.opportunityId);
const clubIds = (r:ReturnType<typeof recompute>) => r.clubs.recommended.map(c => c.post.id);
// Interest-linked notices only: scholarship/exchange notices are PERSONAL_OPPORTUNITY for everyone by design (#16).
const personalNotices = (r:ReturnType<typeof recompute>) =>
  r.notices.evaluations.filter(e => e.links.topicCodes.length > 0).map(e => e.noticeId);

describe('#132 empty demo account: honest "settings needed" state, no fixture fallback', () => {
  const r = recompute(EMPTY);
  it('no large cards, no club highlights, no interest-linked notices', () => {
    expect(featuredIds(r)).toEqual([]);
    expect(clubIds(r)).toEqual([]);
    expect(personalNotices(r)).toEqual([]);
  });
  it('lists are kept and every shown item says why: no personal input, not "low relevance"', () => {
    expect(r.feed.feed.compact.length).toBeGreaterThan(0);
    expect(r.clubs.all.length).toBeGreaterThan(0);
    const shown = r.notFeatured.items.filter(i => i.placement === 'COMPACT_LIST' || i.placement === 'MORE_LIST');
    expect(shown.every(i => i.reason === 'NO_PERSONAL_INPUT' || i.reason === 'SOURCE_NEEDS_REVIEW')).toBe(true);
    expect(r.clubs.all.every(c => c.reasons[0]!.code === 'NO_PERSONAL_MATCH')).toBe(true);
  });
  it('missing facts stay UNKNOWN (확인 필요), never become a failed condition', () => {
    expect(r.notFeatured.items.some(i => i.reason === 'ELIGIBILITY_NOT_MET')).toBe(false);
    expect(r.clubs.all.some(c => c.eligibility === 'INELIGIBLE')).toBe(false);
    expect(r.clubs.all.some(c => c.eligibility === 'UNKNOWN')).toBe(true);
  });
});

describe('#132 settings A → B actually recompute feed, notices and clubs', () => {
  const ra = recompute(A);
  const rb = recompute(B);

  it('A and B give different, non-empty results in all three areas', () => {
    expect(featuredIds(ra).length).toBeGreaterThan(0);
    expect(featuredIds(rb).length).toBeGreaterThan(0);
    expect(featuredIds(ra)).not.toEqual(featuredIds(rb));
    expect(clubIds(ra)).toContain('SYN-CLUB-005');
    expect(clubIds(rb)).toContain('SYN-CLUB-009');
    expect(clubIds(ra)).not.toEqual(clubIds(rb));
    expect(personalNotices(ra)).toContain('SYN-NOT-010'); // data/AI talk matches A only
    expect(personalNotices(rb)).not.toContain('SYN-NOT-010');
  });

  it('reasons follow the current settings, never the previous ones', () => {
    const topicsOf = (r:ReturnType<typeof recompute>) => r.feed.explanations.flatMap(e => e.reasons.flatMap(x => x.topics ?? []));
    expect(topicsOf(ra).every(t => A.interests.includes(t) || A.majorTopics.includes(t))).toBe(true);
    expect(topicsOf(rb).every(t => B.interests.includes(t) || B.majorTopics.includes(t))).toBe(true);
    expect(topicsOf(rb)).not.toContain('DATA_ANALYTICS');
    expect(rb.clubs.recommended.flatMap(c => c.reasons.map(x => x.text)).join(' ')).not.toMatch(/데이터 분석/);
  });

  it('the major alone never makes an item personal (M is a bonus, not relevance)', () => {
    const majorOnly = recompute({...EMPTY, majorTopics:['DATA_ANALYTICS']});
    expect(featuredIds(majorOnly)).toEqual([]);
  });

  it('earned credits are not a recommendation input: changing them changes nothing', () => {
    expect(JSON.stringify(recompute({...A, earnedCredits:0}))).toBe(JSON.stringify(ra));
    expect(JSON.stringify(recompute({...A, earnedCredits:null}))).toBe(JSON.stringify(ra));
  });

  it('A → B → A and reset → EMPTY return byte-identical results (stateless, no cache residue)', () => {
    recompute(B);
    expect(JSON.stringify(recompute(A))).toBe(JSON.stringify(ra));
    expect(JSON.stringify(recompute(EMPTY))).toBe(JSON.stringify(recompute({...EMPTY})));
    expect(featuredIds(recompute(EMPTY))).toEqual([]);
  });
});
