import {describe, it, expect} from 'vitest';
import {OpportunitySchema, type Opportunity} from '@hufs-one/contracts';
import {buildCalendar, composeFeed, seoulDate, type RecommendationProfile} from './index.js';
import {composeNotices, type Notice, type NoticeStudent} from '../notices/index.js';

// Synthetic only: fictional notices / opportunities for the "내 주요 일정" mini calendar.
const ASOF = '2026-11-20T00:00:00.000Z';
const D = (d:number, h = 0) => new Date(Date.parse(ASOF) + d * 86_400_000 + h * 3_600_000).toISOString();
const student:NoticeStudent = {openRequirementIds:['REQ-GRAD-CERT', 'REQ-EXAM'], courseIds:[], interestTopics:['DATA_ANALYTICS']};
const profile:RecommendationProfile = {interestTopics:['DATA_ANALYTICS'], desiredJobTopics:[], approvedExperienceTopics:[], approvedLanguageCodes:[], officialMajorTopics:[], facts:{}};
const notice = (id:string, over:Partial<Notice>):Notice => ({
  id, sourceSnapshotId:`SNAP-${id}`, title:`가상 공지 ${id}`, issuer:'시연가상학과', category:'ACADEMIC', verificationState:'VERIFIED', evidenceRefs:[`EV-${id}`], ...over,
});
const opp = (id:string, over:Partial<Opportunity> = {}) => OpportunitySchema.parse({
  id, version:'v1', sourceSnapshotId:`SNAP-${id}`, title:`가상 공고 ${id}`, organization:`시연가상기관 ${id}`, kind:'CONTEST',
  topicCodes:['DATA_ANALYTICS'], languageCodes:[], applyClosesAt:D(7), eventSessions:[], actualApplicationRoute:'DEMO_DISABLED',
  conditions:[], roleSteps:[], prioritySelection:[], completionRules:[], dataMode:'SYNTHETIC', dataQuality:'COMPLETE', ...over,
});

const noticeInputs = [
  notice('CERT', {requirementRefs:['REQ-GRAD-CERT'], studentDeadline:D(3), adminReportDeadline:D(1)}),
  notice('EXAM', {requirementRefs:['REQ-EXAM'], studentDeadline:D(10), eventSessions:[{start:D(14), end:D(14, 2)}]}),
  notice('SCH', {category:'SCHOLARSHIP', studentDeadline:D(5)}),
  notice('GEN', {category:'GENERAL', studentDeadline:D(2)}),
  notice('CAND', {verificationState:'CANDIDATE', requirementRefs:['REQ-EXAM'], studentDeadline:D(2)}),
  notice('OUT', {campus:'GLOBAL', requirementRefs:['REQ-EXAM'], studentDeadline:D(2)}),
  notice('LATE', {requirementRefs:['REQ-GRAD-CERT'], studentDeadline:D(-2)}),
  notice('NODATE', {requirementRefs:['REQ-EXAM']}),
];
const opportunities = [
  opp('DATA1'),
  opp('DATA2', {applyClosesAt:undefined as never, eventSessions:[{start:D(9), end:D(9, 3)}]}),
  opp('OTHER', {topicCodes:['CULTURE_TOURISM'], applyClosesAt:D(4)}),
  opp('FAR', {applyClosesAt:D(90)}),
];
const build = (opts:Partial<Parameters<typeof buildCalendar>[3]> = {}, notices = noticeInputs, opps = opportunities) =>
  buildCalendar(composeFeed(profile, opps, {asOf:ASOF}), composeNotices({...student, campus:'SEOUL'}, notices, {asOf:ASOF}), notices, {asOf:ASOF, ...opts});

describe('mini calendar "내 주요 일정"', () => {
  it('collects important notice deadlines, exam sessions and recommended deadlines in date order', () => {
    const c = build();
    expect(c.entries.map(e => [e.refId, e.kind, e.importance])).toEqual([
      ['LATE', 'STUDENT_DEADLINE', 'REQUIRED'],
      ['CERT', 'STUDENT_DEADLINE', 'CRITICAL'],
      ['SCH', 'STUDENT_DEADLINE', 'PERSONAL'],
      ['DATA1', 'APPLY_DEADLINE', 'RECOMMENDED'],
      ['DATA2', 'EVENT', 'RECOMMENDED'],
      ['EXAM', 'STUDENT_DEADLINE', 'REQUIRED'],
      ['EXAM', 'EVENT', 'REQUIRED'],
    ]);
  });

  it('never shows the admin report deadline, general / unverified / out-of-scope notices, or non-matching opportunities', () => {
    const c = build();
    const refs = new Set(c.entries.map(e => e.refId));
    for (const id of ['GEN', 'CAND', 'OUT', 'OTHER']) expect(refs.has(id)).toBe(false);
    expect(c.entries.filter(e => e.refId === 'CERT').map(e => e.at)).toEqual([D(3)]); // not the D+1 admin deadline
  });

  it('shows exam / event dates as events, not deadlines, with their end time', () => {
    const exam = build().entries.find(e => e.refId === 'EXAM' && e.kind === 'EVENT');
    expect(exam).toMatchObject({at:D(14), end:D(14, 2), overdue:false});
  });

  it('marks a recent passed deadline as overdue and drops older ones and past events', () => {
    const c = build();
    expect(c.entries.find(e => e.refId === 'LATE')?.overdue).toBe(true);
    const old = build({}, [notice('OLD', {requirementRefs:['REQ-GRAD-CERT'], studentDeadline:D(-30), eventSessions:[{start:D(-1)}]})], []);
    expect(old.entries).toEqual([]);
  });

  it('puts undated items aside instead of guessing a day', () => {
    expect(build().undated.map(u => [u.refId, u.reason])).toEqual([['NODATE', 'DEADLINE_UNKNOWN'], ['DATA2', 'DEADLINE_UNKNOWN']]);
  });

  it('respects the look-ahead window and includes saved opportunities only while visible', () => {
    expect(build().entries.some(e => e.refId === 'FAR')).toBe(false);
    expect(build({daysAhead:120}).entries.some(e => e.refId === 'FAR')).toBe(true);
    const saved = build({savedOpportunityIds:['OTHER', 'GONE']});
    expect(saved.entries.find(e => e.refId === 'OTHER')).toMatchObject({importance:'SAVED', kind:'APPLY_DEADLINE'});
    expect(saved.entries.some(e => e.refId === 'GONE')).toBe(false);
  });

  it('groups by the Seoul calendar day (UTC 15:00 = next day in Seoul)', () => {
    expect(seoulDate('2026-11-24T15:00:00.000Z')).toBe('2026-11-25');
    expect(seoulDate('2026-11-24T14:59:59.000Z')).toBe('2026-11-24');
    expect(build().entries.find(e => e.refId === 'CERT')?.seoulDate).toBe(seoulDate(D(3)));
  });

  it('is byte-stable for reordered inputs and rejects an invalid asOf or range', () => {
    const a = JSON.stringify(build());
    const b = JSON.stringify(buildCalendar(
      composeFeed(profile, [...opportunities].reverse(), {asOf:ASOF}),
      composeNotices({...student, campus:'SEOUL'}, [...noticeInputs].reverse(), {asOf:ASOF}), [...noticeInputs].reverse(), {asOf:ASOF}));
    expect(b).toBe(a);
    expect(() => build({asOf:'now'})).toThrow(RangeError);
    expect(() => build({daysAhead:-1})).toThrow(RangeError);
  });
});
