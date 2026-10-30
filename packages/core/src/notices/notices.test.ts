import {describe, it, expect} from 'vitest';
import {AcademicSummarySchema, NoticeResultSchema} from '@hufs-one/contracts';
import {composeNotices, evaluateNotice, noticeAppliesTo, openRequirementIds, type Notice, type NoticeStudent} from './index.js';

// Synthetic only (A12.2 SYN-NOT style). No real student, department or deadline.
const ASOF = '2026-11-20T00:00:00.000Z';
const inDays = (d:number) => new Date(Date.parse(ASOF) + d * 86_400_000).toISOString();

function notice(id:string, over:Partial<Notice> = {}):Notice {
  return {
    id, sourceSnapshotId:`SNAP-${id}`, title:`가상 공지 ${id}`, issuer:'시연가상학과',
    category:'GENERAL', verificationState:'VERIFIED', evidenceRefs:[`EV-${id}`], ...over,
  };
}

const student:NoticeStudent = {
  campus:'SEOUL', college:'가상대학', majors:['가상전공A'], cohort:2023, enrollmentState:'ENROLLED',
  openRequirementIds:['REQ-GRAD-CERT', 'REQ-MAJOR-CORE'], courseIds:['SYN-C-101'], interestTopics:['DATA_ANALYTICS'],
};

function without(key:'cohort'|'college'):NoticeStudent {
  const copy = {...student};
  delete copy[key];
  return copy;
}

describe('TASK-14 scope (A07.2-1)', () => {
  it('explicit match → YES, mismatch → NO, missing student value → UNKNOWN with the field named', () => {
    expect(noticeAppliesTo(student, notice('A', {campus:'SEOUL', majors:['가상전공A', '가상전공B']})).appliesTo).toBe('YES');
    expect(noticeAppliesTo(student, notice('A', {campus:'GLOBAL'})).appliesTo).toBe('NO');
    expect(noticeAppliesTo(without('cohort'), notice('A', {cohortRange:{max:2022}})))
      .toEqual({appliesTo:'UNKNOWN', unknownScope:['cohort']});
  });

  it('a definite mismatch wins over an unknown field', () => {
    expect(noticeAppliesTo(without('college'), notice('A', {college:'다른대학', campus:'GLOBAL'})).appliesTo).toBe('NO');
  });
});

describe('TASK-14 priority (A07.2-2…5, A15.2 공지)', () => {
  it('student deadline ≤7 days on a linked, verified, applicable requirement → CRITICAL_DUE', () => {
    const ev = evaluateNotice(student, notice('A', {category:'ACADEMIC', requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(3)}), ASOF);
    expect(ev.priority).toBe('CRITICAL_DUE');
    expect(ev.links.requirementIds).toEqual(['REQ-GRAD-CERT']);
  });

  it('the admin report deadline is never treated as the student deadline (SYN-NOT-001)', () => {
    const ev = evaluateNotice(student, notice('A', {
      category:'ACADEMIC', requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(20), adminReportDeadline:inDays(2),
    }), ASOF);
    expect(ev.priority).toBe('ACADEMIC_REQUIRED');
    expect(ev).toMatchObject({studentDeadline:inDays(20), adminReportDeadline:inDays(2)});
  });

  it('a junior still gets a required notice when the scope is unknown — kept with the UNKNOWN badge', () => {
    const junior = without('cohort');
    const ev = evaluateNotice(junior, notice('A', {category:'ACADEMIC', courseRefs:['SYN-C-101'], cohortRange:{min:2020}, studentDeadline:inDays(2)}), ASOF);
    expect(ev).toMatchObject({priority:'ACADEMIC_REQUIRED', appliesTo:'UNKNOWN'}); // not CRITICAL_DUE until scope is confirmed
  });

  it('a senior keeps scholarship notices; uncollected GPA makes it UNKNOWN, not auto-satisfied', () => {
    const senior = {...student, cohort:2020};
    const ev = evaluateNotice(senior, notice('S', {category:'SCHOLARSHIP', scholarshipConditions:['직전학기 평점 3.5 이상']}), ASOF);
    expect(ev).toMatchObject({priority:'PERSONAL_OPPORTUNITY', appliesTo:'UNKNOWN', unknownScope:['scholarshipConditions']});
  });

  it('topic overlap makes a career notice personal; nothing else does', () => {
    expect(evaluateNotice(student, notice('A', {category:'CAREER', topicCodes:['DATA_ANALYTICS']}), ASOF).priority).toBe('PERSONAL_OPPORTUNITY');
    expect(evaluateNotice(student, notice('B', {category:'CAREER', topicCodes:['CULTURE_TOURISM']}), ASOF).priority).toBe('GENERAL');
  });

  it('an unverified notice is never CRITICAL_DUE', () => {
    const ev = evaluateNotice(student, notice('A', {verificationState:'CANDIDATE', requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(1)}), ASOF);
    expect(ev.priority).toBe('ACADEMIC_REQUIRED');
  });

  it('an out-of-scope notice is GENERAL even if it names an open requirement', () => {
    expect(evaluateNotice(student, notice('A', {campus:'GLOBAL', requirementRefs:['REQ-GRAD-CERT']}), ASOF).priority).toBe('GENERAL');
  });

  it('a passed student deadline is overdue (해결 필요), not CRITICAL_DUE', () => {
    const ev = evaluateNotice(student, notice('A', {requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(-1)}), ASOF);
    expect(ev).toMatchObject({priority:'ACADEMIC_REQUIRED', overdue:true});
  });
});

describe('TASK-14 composeNotices (A07.2-5…6)', () => {
  const list = [
    notice('GEN', {publishedAt:inDays(-1)}),
    notice('SCH', {category:'SCHOLARSHIP', studentDeadline:inDays(10)}),
    notice('REQ-LATE', {requirementRefs:['REQ-MAJOR-CORE'], studentDeadline:inDays(25)}),
    notice('CRIT-2', {requirementRefs:['REQ-MAJOR-CORE'], studentDeadline:inDays(5)}),
    notice('CRIT-1', {requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(2)}),
    notice('OVERDUE', {requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(-2)}),
    notice('REJ', {verificationState:'REJECTED', requirementRefs:['REQ-GRAD-CERT']}),
    notice('EXPIRED', {validUntil:inDays(-1)}),
  ];

  it('returns a schema-valid NoticeResult in tier → student deadline → published → id order', () => {
    const {result} = composeNotices(student, list, {asOf:ASOF});
    expect(NoticeResultSchema.safeParse(result).success).toBe(true);
    expect(result.items.map(i => i.noticeId)).toEqual(['CRIT-1', 'CRIT-2', 'REQ-LATE', 'OVERDUE', 'SCH', 'GEN']);
  });

  it('pins at most 2, never overdue or unverified ones', () => {
    const {result} = composeNotices(student, list, {asOf:ASOF});
    expect(result.pinnedIds).toEqual(['CRIT-1', 'CRIT-2']);
    const onlyLater = composeNotices(student, list.filter(n => !n.id.startsWith('CRIT')), {asOf:ASOF});
    expect(onlyLater.result.pinnedIds).toEqual(['REQ-LATE']);
  });

  it('separates overdue and excluded notices instead of hiding them silently', () => {
    const r = composeNotices(student, list, {asOf:ASOF});
    expect(r.overdueIds).toEqual(['OVERDUE']);
    expect(r.excludedIds).toEqual(['EXPIRED', 'REJ']);
  });

  it('is byte-stable regardless of input order', () => {
    const a = JSON.stringify(composeNotices(student, list, {asOf:ASOF}));
    expect(JSON.stringify(composeNotices(student, [...list].reverse(), {asOf:ASOF}))).toBe(a);
  });

  it('rejects an invalid asOf instead of reading the clock', () => {
    expect(() => composeNotices(student, list, {asOf:'now'})).toThrow(RangeError);
  });
});

describe('TASK-14 academic link', () => {
  it('derives open requirement ids from the academic summary deficits', () => {
    const summary = AcademicSummarySchema.parse({
      state:'NEEDS_REVIEW', rulePackVersion:'SYN-RP-1', asOf:ASOF,
      earnedCreditUnits:0, inProgressCreditUnits:0, plannedCreditUnits:0, caveats:[],
      deficits:[
        {requirementId:'REQ-B', state:'MISSING', evidenceRefs:[]},
        {requirementId:'REQ-A', state:'UNKNOWN', evidenceRefs:[]},
        {requirementId:'REQ-B', state:'NEEDS_REVIEW', evidenceRefs:[]},
      ],
    });
    expect(openRequirementIds(summary)).toEqual(['REQ-A', 'REQ-B']);
  });
});
