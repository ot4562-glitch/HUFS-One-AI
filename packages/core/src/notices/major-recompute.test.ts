import {describe, it, expect} from 'vitest';
import {composeNotices, type Notice, type NoticeStudent} from './index.js';
import {DEMO_AS_OF, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT, composeFeed, type RecommendationProfile} from '../opportunities/index.js';

/**
 * #133 (김채윤 · 추천·공지 연동) — SYNTHETIC only. The real 4-person majors / double majors stay in the
 * restricted registry; these tests pin how the core reacts to the same shapes: primary only, primary +
 * double, unanswered, a namesake (same inputs), a course that is not offered this term.
 */
const D = (days:number) => new Date(Date.parse(DEMO_AS_OF) + days * 86_400_000).toISOString();
const notice = (n:string, over:Partial<Notice>):Notice => ({
  id:`SYN-NOT-M${n}`, sourceSnapshotId:`SYN-NSRC-M${n}-r1`, title:`가상 전공 공지 ${n}`, issuer:'시연가상학과', category:'ACADEMIC',
  verificationState:'VERIFIED', evidenceRefs:[`EV-SYN-NOT-M${n}`], publishedAt:D(-3), studentDeadline:D(10), ...over,
});
const NOTICES:Notice[] = [
  notice('1', {title:'가상 이중전공자 전공필수 안내', majors:['가상경영학과'], majorRoles:['DOUBLE'], courseRefs:['SYN-C-BIZ301']}),
  notice('2', {title:'가상 1전공자 졸업논문 안내', majors:['가상통계학과'], majorRoles:['PRIMARY']}),
  notice('3', {title:'가상 통계학과(1·이중) 수강정정 안내', majors:['가상통계학과'], majorRoles:['PRIMARY', 'DOUBLE'], courseRefs:['SYN-C-STAT201']}),
];
const base:NoticeStudent = {openRequirementIds:null, courseIds:[], interestTopics:[]};
const applies = (s:NoticeStudent) => Object.fromEntries(
  composeNotices(s, NOTICES, {asOf:DEMO_AS_OF}).evaluations.map(e => [e.noticeId.slice(-2), e.appliesTo]));

describe('#133 major / double-major changes recompute notice applicability', () => {
  const primaryOnly:NoticeStudent = {...base, majors:[{major:'가상통계학과', role:'PRIMARY'}]};
  const withDouble:NoticeStudent = {...base, majors:[{major:'가상통계학과', role:'PRIMARY'}, {major:'가상경영학과', role:'DOUBLE'}]};
  const doubleInStat:NoticeStudent = {...base, majors:[{major:'가상경영학과', role:'PRIMARY'}, {major:'가상통계학과', role:'DOUBLE'}]};

  it('primary only: double-major notice does not apply, own primary notices do', () => {
    expect(applies(primaryOnly)).toEqual({M1:'NO', M2:'YES', M3:'YES'});
  });
  it('adding a double major turns the double-major notice on, without touching the others', () => {
    expect(applies(withDouble)).toEqual({M1:'YES', M2:'YES', M3:'YES'});
  });
  it('role matters: 통계 as DOUBLE gets the 1·이중 notice but not the 1전공자-only notice', () => {
    expect(applies(doubleInStat)).toEqual({M1:'NO', M2:'NO', M3:'YES'});
  });
  it('unanswered majors are UNKNOWN (확인 필요), never "does not apply"', () => {
    expect(applies(base)).toEqual({M1:'UNKNOWN', M2:'UNKNOWN', M3:'UNKNOWN'});
    expect(applies({...base, majors:[]})).toEqual({M1:'UNKNOWN', M2:'UNKNOWN', M3:'UNKNOWN'});
    const r = composeNotices(base, NOTICES, {asOf:DEMO_AS_OF}).evaluations;
    expect(r.every(e => e.unknownScope.includes('majors'))).toBe(true);
  });
  it('removing the double major again returns exactly the primary-only result (no residue)', () => {
    applies(withDouble);
    expect(JSON.stringify(composeNotices(primaryOnly, NOTICES, {asOf:DEMO_AS_OF})))
      .toBe(JSON.stringify(composeNotices({...base, majors:[{major:'가상통계학과', role:'PRIMARY'}]}, NOTICES, {asOf:DEMO_AS_OF})));
  });
});

describe('#133 identity is never an input; courses link only when actually taken/planned', () => {
  it('namesakes: identical inputs give identical results, different majors give different ones', () => {
    // The core receives no name or id. Two people sharing a name are separated by the API's owner scope.
    const a:NoticeStudent = {...base, majors:[{major:'가상통계학과', role:'PRIMARY'}]};
    const b:NoticeStudent = {...base, majors:[{major:'가상통계학과', role:'PRIMARY'}]};
    const c:NoticeStudent = {...base, majors:[{major:'가상경영학과', role:'PRIMARY'}]};
    expect(JSON.stringify(composeNotices(a, NOTICES, {asOf:DEMO_AS_OF}))).toBe(JSON.stringify(composeNotices(b, NOTICES, {asOf:DEMO_AS_OF})));
    expect(applies(c)).not.toEqual(applies(a));
  });

  it('a course not offered / not in the student plan creates no course link', () => {
    const planned:NoticeStudent = {...base, majors:[{major:'가상통계학과', role:'PRIMARY'}], courseIds:['SYN-C-STAT201']};
    const notOffered:NoticeStudent = {...planned, courseIds:['SYN-C-STAT999']}; // not in any notice / not offered
    const links = (s:NoticeStudent) => composeNotices(s, NOTICES, {asOf:DEMO_AS_OF}).evaluations.find(e => e.noticeId === 'SYN-NOT-M3')!.links.courseIds;
    expect(links(planned)).toEqual(['SYN-C-STAT201']);
    expect(links(notOffered)).toEqual([]);
  });
});

describe('#133 double-major topics in the feed are a bonus, never relevance on their own', () => {
  const profile = (officialMajorTopics:RecommendationProfile['officialMajorTopics']):RecommendationProfile => ({
    interestTopics:['DATA_ANALYTICS'], desiredJobTopics:[], approvedExperienceTopics:[], approvedLanguageCodes:[], officialMajorTopics, facts:{},
  });
  const opts = {asOf:DEMO_AS_OF, publishedAtBySnapshotId:DEMO_PUBLISHED_AT};

  it('adding the double major mapping changes scores, not which items count as personal', () => {
    const without = composeFeed(profile([]), DEMO_OPPORTUNITIES, opts);
    const withDouble = composeFeed(profile(['DATA_ANALYTICS', 'MARKETING_BRAND']), DEMO_OPPORTUNITIES, opts);
    const relevant = (f:typeof without) => f.all.filter(r => r.relevant).map(r => r.opportunity.id).sort();
    expect(relevant(withDouble)).toEqual(relevant(without));
    const score = (f:typeof without, id:string) => f.all.find(r => r.opportunity.id === id)?.score.M;
    expect(without.all.every(r => r.score.M === 0)).toBe(true);
    expect(withDouble.all.some(r => score(withDouble, r.opportunity.id) === 1)).toBe(true);
  });
});
