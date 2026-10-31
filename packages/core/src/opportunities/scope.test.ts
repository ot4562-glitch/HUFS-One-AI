import {describe, it, expect} from 'vitest';
import {OpportunitySchema, type Opportunity} from '@hufs-one/contracts';
import {composeFeed, scopeInputsToGrant, type RecommendationProfile} from './index.js';
import {composeNotices, type Notice, type NoticeStudent} from '../notices/index.js';

// Synthetic only. Checks that derived feed/notices do not reveal sections the grant does not share.
const ASOF = '2026-11-20T00:00:00.000Z';
const inDays = (d:number) => new Date(Date.parse(ASOF) + d * 86_400_000).toISOString();
const profile:RecommendationProfile = {
  interestTopics:['AI_ML'], desiredJobTopics:[], approvedExperienceTopics:['DATA_ANALYTICS'],
  approvedLanguageCodes:[], officialMajorTopics:[], facts:{},
};
const student:NoticeStudent = {openRequirementIds:['REQ-GRAD-CERT'], courseIds:['SYN-C-101'], interestTopics:['AI_ML']};
const opp = (id:string, topicCodes:Opportunity['topicCodes']) => OpportunitySchema.parse({
  id, version:'v1', sourceSnapshotId:`SNAP-${id}`, title:id, organization:`시연가상기관 ${id}`, kind:'CONTEST', topicCodes,
  languageCodes:[], applyClosesAt:inDays(10), eventSessions:[], actualApplicationRoute:'DEMO_DISABLED', conditions:[],
  roleSteps:[], prioritySelection:[], completionRules:[], dataMode:'SYNTHETIC', dataQuality:'COMPLETE',
});
const notice = (id:string, over:Partial<Notice>):Notice => ({
  id, sourceSnapshotId:`SNAP-${id}`, title:id, issuer:'시연가상학과', category:'ACADEMIC', verificationState:'VERIFIED', evidenceRefs:[`EV-${id}`], ...over,
});
const notices = [
  notice('GRAD-CERT', {requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(3)}),
  notice('COURSE-CHANGE', {courseRefs:['SYN-C-101'], studentDeadline:inDays(20)}),
];

describe('scopeInputsToGrant: no leak of unshared sections through feed/notices (PR #35 / #39)', () => {
  it('with everything shared, inputs are unchanged', () => {
    const s = scopeInputsToGrant(profile, student, ['FEED', 'NOTICES', 'EXPERIENCE', 'ACADEMICS']);
    expect(s).toEqual({profile, noticeStudent:student, scopeKey:'ACADEMICS,EXPERIENCE,FEED,NOTICES', withheld:[]});
  });

  it('ACADEMICS not shared → notices cannot reveal which requirement is open', () => {
    const full = composeNotices(student, notices, {asOf:ASOF}).result;
    expect(full.items.find(i => i.noticeId === 'GRAD-CERT')).toMatchObject({priority:'CRITICAL_DUE', appliesTo:'YES'});
    expect(full.pinnedIds).toContain('GRAD-CERT');

    const s = scopeInputsToGrant(profile, student, ['FEED', 'NOTICES']);
    expect(s.withheld).toEqual(['EXPERIENCE_TOPICS', 'ACADEMIC_REQUIREMENTS', 'ACADEMIC_COURSES']);
    const scoped = composeNotices(s.noticeStudent!, notices, {asOf:ASOF}).result;
    // Requirement notice stays visible with an UNKNOWN badge; no CRITICAL_DUE/pin derived from the hidden ledger.
    expect(scoped.items.find(i => i.noticeId === 'GRAD-CERT')).toMatchObject({priority:'ACADEMIC_REQUIRED', appliesTo:'UNKNOWN'});
    expect(scoped.items.find(i => i.noticeId === 'COURSE-CHANGE')).toMatchObject({priority:'GENERAL'});
    expect(scoped.items.some(i => i.priority === 'CRITICAL_DUE')).toBe(false);
    expect(scoped.pinnedIds).toEqual([]);
  });

  it('EXPERIENCE not shared → the feed gets no experience score', () => {
    const items = [opp('D1', ['DATA_ANALYTICS']), opp('A1', ['AI_ML'])];
    const full = composeFeed(profile, items, {asOf:ASOF});
    expect(full.all.find(r => r.opportunity.id === 'D1')?.score.S).toBe(1);
    const s = scopeInputsToGrant(profile, student, ['FEED', 'NOTICES', 'ACADEMICS']);
    const scoped = composeFeed(s.profile!, items, {asOf:ASOF});
    expect(scoped.all.find(r => r.opportunity.id === 'D1')).toMatchObject({score:{S:0}, relevant:false, matched:{experience:[]}});
    expect(scoped.feed.featured.map(c => c.opportunityId)).toEqual(['A1']);
  });

  it('(a) ACADEMICS not shared → verified graduation term cannot drive a term-scoped notice (PR #49 review #1)', () => {
    const graduating:NoticeStudent = {...student, targetGraduationTerm:'2026-2', graduationTermVerified:true, cohort:2022, majors:[{major:'가상전공A', role:'PRIMARY'}]};
    const termNotice = notice('TERM', {graduationTermScope:['2026-2'], studentDeadline:inDays(2)});
    expect(composeNotices(graduating, [termNotice], {asOf:ASOF}).result.items[0]).toMatchObject({appliesTo:'YES'});
    const s = scopeInputsToGrant(profile, graduating, ['FEED', 'NOTICES']);
    expect(s.noticeStudent).toEqual({openRequirementIds:null, courseIds:[], interestTopics:['AI_ML']});
    expect(s.withheld).toEqual(expect.arrayContaining(['GRADUATION_TERM', 'NOTICE_SCOPE:majors', 'NOTICE_SCOPE:cohort']));
    expect(composeNotices(s.noticeStudent!, [termNotice], {asOf:ASOF}).result.items[0]).toMatchObject({appliesTo:'UNKNOWN'});
    // The other term is not revealed as NO either.
    expect(composeNotices(s.noticeStudent!, [notice('OTHER', {graduationTermScope:['2028-2']})], {asOf:ASOF}).result.items[0]?.appliesTo).toBe('UNKNOWN');
  });

  it('(b) FEED not shared → notices cannot reveal interest topics (PR #49 review #2)', () => {
    const career = notice('CAREER', {category:'CAREER', topicCodes:['AI_ML']});
    expect(composeNotices(student, [career], {asOf:ASOF}).result.items[0]?.priority).toBe('PERSONAL_OPPORTUNITY');
    const s = scopeInputsToGrant(profile, student, ['NOTICES', 'ACADEMICS']);
    expect(s.profile).toBeNull();
    expect(s.noticeStudent?.interestTopics).toEqual([]);
    expect(s.withheld).toContain('INTEREST_TOPICS');
    const scoped = composeNotices(s.noticeStudent!, [career], {asOf:ASOF});
    expect(scoped.result.items[0]?.priority).toBe('GENERAL');
    expect(scoped.evaluations[0]?.links.topicCodes).toEqual([]);
  });

  it('(c) ACADEMICS not shared → no official major M score and no academic facts in eligibility (PR #49 review #3)', () => {
    const p:RecommendationProfile = {...profile, officialMajorTopics:['AI_ML'], facts:{major:['가상전공A'], cohort:2022, enrollment:'ENROLLED'}};
    const majorOnly = OpportunitySchema.parse({...opp('M1', ['AI_ML']), conditions:[{field:'major', operator:'IN', value:['가상전공A'], evidenceId:'EV-M'}]});
    const full = composeFeed(p, [majorOnly], {asOf:ASOF}).all[0]!;
    expect(full).toMatchObject({score:{M:1}, evaluation:{eligibility:'ELIGIBLE'}});
    const s = scopeInputsToGrant(p, student, ['FEED', 'NOTICES', 'EXPERIENCE']);
    expect(s.profile).toMatchObject({officialMajorTopics:[], facts:{}});
    expect(s.withheld).toEqual(expect.arrayContaining(['OFFICIAL_MAJOR_TOPICS', 'FACT:major', 'FACT:cohort', 'FACT:enrollment']));
    const scoped = composeFeed(s.profile!, [majorOnly], {asOf:ASOF}).all[0]!;
    expect(scoped).toMatchObject({score:{M:0}, evaluation:{eligibility:'UNKNOWN'}}); // dropped → UNKNOWN, never ELIGIBLE
  });

  it('declared provenance keeps a field that came from a shared section, and changes the scope key', () => {
    const p:RecommendationProfile = {...profile, facts:{campus:'SEOUL', major:['가상전공A']}};
    const st:NoticeStudent = {...student, campus:'SEOUL', cohort:2022};
    const s = scopeInputsToGrant(p, st, ['FEED', 'NOTICES'], {noticeScope:{campus:'FEED'}, facts:{campus:'FEED'}});
    expect(s.profile?.facts).toEqual({campus:'SEOUL'});
    expect(s.noticeStudent).toMatchObject({campus:'SEOUL'});
    expect(s.noticeStudent?.cohort).toBeUndefined();
    expect(s.scopeKey).toBe('FEED,NOTICES;fact.campus=FEED,scope.campus=FEED');
    expect(scopeInputsToGrant(p, st, ['FEED', 'NOTICES']).scopeKey).toBe('FEED,NOTICES');
  });

  it('FEED / NOTICES not shared → nothing is composed for that section', () => {
    expect(scopeInputsToGrant(profile, student, ['NOTICES']).profile).toBeNull();
    expect(scopeInputsToGrant(profile, student, ['FEED']).noticeStudent).toBeNull();
  });

  it('unknown section names fail closed and the scope key is sorted and deduplicated', () => {
    const s = scopeInputsToGrant(profile, student, ['NOTICES', 'FEED', 'FEED', 'RAW_FORMS', 42, null]);
    expect(s.scopeKey).toBe('FEED,NOTICES');
    expect(s.noticeStudent?.openRequirementIds).toBeNull();
  });

  it('never mutates the caller inputs', () => {
    const p = structuredClone(profile), st = structuredClone(student);
    scopeInputsToGrant(p, st, ['FEED', 'NOTICES']);
    expect(p).toEqual(profile);
    expect(st).toEqual(student);
  });
});
