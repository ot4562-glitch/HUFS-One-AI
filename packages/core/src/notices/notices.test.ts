import {describe, it, expect} from 'vitest';
import {AcademicSummarySchema, NoticeResultSchema} from '@hufs-one/contracts';
import {
  composeNotices, endOfSeoulDay, evaluateNotice, noticeAppliesTo, openRequirementIds, validateNotice,
  type Notice, type NoticeStudent,
} from './index.js';

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
  campus:'SEOUL', college:'가상대학', majors:[{major:'가상전공A', role:'PRIMARY'}], cohort:2023, enrollmentState:'ENROLLED',
  admissionType:'REGULAR', targetGraduationTerm:'2028-2',
  openRequirementIds:['REQ-GRAD-CERT', 'REQ-MAJOR-CORE'], courseIds:['SYN-C-101'], interestTopics:['DATA_ANALYTICS'],
};

function without(key:'cohort'|'college'|'targetGraduationTerm'):NoticeStudent {
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

  it('graduationTermScope: other term → NO, missing → UNKNOWN, self-reported match → UNKNOWN, verified match → YES', () => {
    const only20262 = notice('G', {graduationTermScope:['2026-2']});
    expect(noticeAppliesTo(student, only20262).appliesTo).toBe('NO');
    expect(noticeAppliesTo(without('targetGraduationTerm'), only20262)).toEqual({appliesTo:'UNKNOWN', unknownScope:['graduationTerm']});
    const candidate = {...student, targetGraduationTerm:'2026-2'};
    expect(noticeAppliesTo(candidate, only20262)).toEqual({appliesTo:'UNKNOWN', unknownScope:['graduationTerm']});
    expect(noticeAppliesTo({...candidate, graduationTermVerified:true}, only20262).appliesTo).toBe('YES');
  });

  it('admission type: "외국인 학생만" does not apply to a regular student (review P-graduation exam)', () => {
    expect(noticeAppliesTo(student, notice('F', {admissionTypes:['FOREIGN']})).appliesTo).toBe('NO');
  });

  it('major roles: "A 1전공자만" does not apply to a student whose A is a double major (P4)', () => {
    const s = {...student, majors:[{major:'가상전공B', role:'PRIMARY' as const}, {major:'가상전공A', role:'DOUBLE' as const}]};
    expect(noticeAppliesTo(s, notice('M', {majors:['가상전공A'], majorRoles:['PRIMARY']})).appliesTo).toBe('NO');
    expect(noticeAppliesTo(s, notice('M', {majors:['가상전공A'], majorRoles:['PRIMARY', 'DOUBLE']})).appliesTo).toBe('YES');
    expect(noticeAppliesTo(s, notice('M', {majorRoles:['MINOR']})).appliesTo).toBe('NO');
  });

  it('cohort is a four-digit year: a two-digit notice range is rejected, a two-digit student value is unknown (P6)', () => {
    expect(validateNotice(notice('C', {cohortRange:{max:14}}))).toBe('INVALID_COHORT');
    expect(validateNotice(notice('C', {cohortRange:{max:2014}}))).toBeUndefined();
    expect(noticeAppliesTo({...student, cohort:14}, notice('C', {cohortRange:{max:2014}})).appliesTo).toBe('UNKNOWN');
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

  it('2026-2-only notice with a 3-day deadline is not CRITICAL_DUE for a 2028-2 target student (review #1)', () => {
    const n = notice('G', {category:'ACADEMIC', graduationTermScope:['2026-2'], requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(3)});
    expect(evaluateNotice(student, n, ASOF)).toMatchObject({priority:'GENERAL', appliesTo:'NO'});
    expect(evaluateNotice(without('targetGraduationTerm'), n, ASOF)).toMatchObject({priority:'ACADEMIC_REQUIRED', appliesTo:'UNKNOWN'});
  });

  it('a junior still gets a verified required notice when the scope is unknown — kept with the UNKNOWN badge', () => {
    const ev = evaluateNotice(without('cohort'), notice('A', {category:'ACADEMIC', courseRefs:['SYN-C-101'], cohortRange:{min:2020}, studentDeadline:inDays(2)}), ASOF);
    expect(ev).toMatchObject({priority:'ACADEMIC_REQUIRED', appliesTo:'UNKNOWN'});
  });

  it('unverified academic notices are review-pending GENERAL, never ACADEMIC_REQUIRED (review #2, P7)', () => {
    for (const verificationState of ['CANDIDATE', 'NEEDS_REVIEW'] as const) {
      const ev = evaluateNotice(student, notice('A', {verificationState, requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(1)}), ASOF);
      expect(ev).toMatchObject({priority:'GENERAL', reviewPending:true});
    }
  });

  it('unverified scholarship / exchange / topic-matched career notices are review-pending GENERAL, not PERSONAL_OPPORTUNITY (#16 re-review #2)', () => {
    for (const verificationState of ['CANDIDATE', 'NEEDS_REVIEW'] as const) {
      expect(evaluateNotice(student, notice('S', {category:'SCHOLARSHIP', verificationState}), ASOF)).toMatchObject({priority:'GENERAL', appliesTo:'YES', reviewPending:true});
      expect(evaluateNotice(student, notice('E', {category:'EXCHANGE', verificationState}), ASOF)).toMatchObject({priority:'GENERAL', reviewPending:true});
      expect(evaluateNotice(student, notice('C', {category:'CAREER', topicCodes:['DATA_ANALYTICS'], verificationState}), ASOF)).toMatchObject({priority:'GENERAL', reviewPending:true});
    }
    // An unverified plain GENERAL notice is not queued (nothing would be raised), and VERIFIED keeps PERSONAL_OPPORTUNITY.
    expect(evaluateNotice(student, notice('G', {verificationState:'CANDIDATE'}), ASOF)).toMatchObject({priority:'GENERAL', reviewPending:false});
    expect(evaluateNotice(student, notice('S', {category:'SCHOLARSHIP'}), ASOF).priority).toBe('PERSONAL_OPPORTUNITY');
  });

  it('academics not shared (null) keeps a requirement notice as ACADEMIC_REQUIRED + UNKNOWN, not GENERAL (P1)', () => {
    const pending = {...student, openRequirementIds:null};
    const ev = evaluateNotice(pending, notice('X', {requirementRefs:['REQ-EXAM'], studentDeadline:inDays(3)}), ASOF);
    expect(ev).toMatchObject({priority:'ACADEMIC_REQUIRED', appliesTo:'UNKNOWN', unknownScope:['academicStatus']});
    // An empty list is a known "no open requirement" and is different from null.
    expect(evaluateNotice({...student, openRequirementIds:[]}, notice('X', {requirementRefs:['REQ-EXAM']}), ASOF).priority).toBe('GENERAL');
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

  it('an out-of-scope notice is GENERAL and never overdue, even if it names an open requirement (review #3)', () => {
    const ev = evaluateNotice(student, notice('A', {campus:'GLOBAL', requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(-1)}), ASOF);
    expect(ev).toMatchObject({priority:'GENERAL', overdue:false});
  });

  it('any passed student deadline is overdue (해결 필요), not CRITICAL_DUE — including non-academic notices (P5)', () => {
    expect(evaluateNotice(student, notice('A', {requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(-1)}), ASOF))
      .toMatchObject({priority:'ACADEMIC_REQUIRED', overdue:true});
    expect(evaluateNotice(student, notice('S', {category:'SCHOLARSHIP', studentDeadline:inDays(-1)}), ASOF).overdue).toBe(true);
  });
});

describe('TASK-14 composeNotices (A07.2-5…6)', () => {
  const list = [
    notice('GEN', {publishedAt:inDays(-1)}),
    notice('SCH', {category:'SCHOLARSHIP', studentDeadline:inDays(10)}),
    notice('SCH-OLD', {category:'SCHOLARSHIP', studentDeadline:inDays(-3)}),
    notice('REQ-LATE', {requirementRefs:['REQ-MAJOR-CORE'], studentDeadline:inDays(25)}),
    notice('CRIT-2', {requirementRefs:['REQ-MAJOR-CORE'], studentDeadline:inDays(5)}),
    notice('CRIT-1', {requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(2)}),
    notice('OVERDUE', {requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(-2)}),
    notice('CAND', {verificationState:'CANDIDATE', requirementRefs:['REQ-GRAD-CERT'], studentDeadline:inDays(1)}),
    notice('SCH-CAND', {category:'SCHOLARSHIP', verificationState:'CANDIDATE', studentDeadline:inDays(4)}),
    notice('REJ', {verificationState:'REJECTED', requirementRefs:['REQ-GRAD-CERT']}),
    notice('EXPIRED', {validUntil:inDays(-1)}),
    notice('FUTURE', {requirementRefs:['REQ-GRAD-CERT'], publishedAt:inDays(5), studentDeadline:inDays(6)}),
    notice('DATEONLY', {studentDeadline:'2026-11-25'}),
  ];

  it('returns a schema-valid NoticeResult in tier → overdue last → deadline → published → id order', () => {
    const {result} = composeNotices(student, list, {asOf:ASOF});
    expect(NoticeResultSchema.safeParse(result).success).toBe(true);
    expect(result.items.map(i => i.noticeId)).toEqual(['CRIT-1', 'CRIT-2', 'REQ-LATE', 'OVERDUE', 'SCH', 'SCH-OLD', 'CAND', 'SCH-CAND', 'GEN']);
  });

  it('pins at most 2, never overdue or unverified ones', () => {
    const {result} = composeNotices(student, list, {asOf:ASOF});
    expect(result.pinnedIds).toEqual(['CRIT-1', 'CRIT-2']);
    const onlyLater = composeNotices(student, list.filter(n => !n.id.startsWith('CRIT')), {asOf:ASOF});
    expect(onlyLater.result.pinnedIds).toEqual(['REQ-LATE']);
  });

  it('separates overdue, review-pending and excluded notices instead of hiding them silently', () => {
    const r = composeNotices(student, list, {asOf:ASOF});
    expect(r.overdueIds).toEqual(['OVERDUE', 'SCH-OLD']);
    expect(r.reviewPendingIds).toEqual(['CAND', 'SCH-CAND']);
    expect(r.excluded).toEqual([
      {noticeId:'DATEONLY', reason:'INVALID_DATETIME'},
      {noticeId:'EXPIRED', reason:'EXPIRED'},
      {noticeId:'FUTURE', reason:'FUTURE_PUBLICATION'},
      {noticeId:'REJ', reason:'REJECTED'},
    ]);
  });

  it('serializes overdue on every item of the official NoticeResult wire (contracts #44)', () => {
    const r = composeNotices(student, list, {asOf:ASOF});
    const parsed = NoticeResultSchema.parse(JSON.parse(JSON.stringify(r.result)));
    const overdue = Object.fromEntries(parsed.items.map(i => [i.noticeId, i.overdue]));
    expect(overdue).toEqual({
      'CRIT-1':false, 'CRIT-2':false, 'REQ-LATE':false, 'OVERDUE':true, 'SCH':false, 'SCH-OLD':true, 'CAND':false, 'SCH-CAND':false, 'GEN':false,
    });
    expect(parsed.items.filter(i => i.overdue).map(i => i.noticeId)).toEqual(r.overdueIds);
    expect(parsed.pinnedIds.some(id => overdue[id])).toBe(false);
  });

  it('an out-of-scope (NO) notice with a passed deadline is serialized overdue:false and accepted by the wire', () => {
    const r = composeNotices(student, [notice('OUT', {campus:'GLOBAL', studentDeadline:inDays(-1)})], {asOf:ASOF});
    expect(r.result.items[0]).toMatchObject({appliesTo:'NO', overdue:false});
    expect(NoticeResultSchema.safeParse(r.result).success).toBe(true);
  });

  it('a malformed date excludes only that notice; the rest of the list still renders (P3)', () => {
    const r = composeNotices(student, [notice('OK'), notice('BAD', {studentDeadline:'2026-11-25'})], {asOf:ASOF});
    expect(r.result.items.map(i => i.noticeId)).toEqual(['OK']);
  });

  it('a notice published after asOf never appears in a past view (review #4, P2)', () => {
    const r = composeNotices(student, list, {asOf:ASOF});
    expect(r.result.items.map(i => i.noticeId)).not.toContain('FUTURE');
    expect(composeNotices(student, list, {asOf:inDays(5)}).result.items.map(i => i.noticeId)).toContain('FUTURE');
  });

  it('is byte-stable regardless of input order', () => {
    const a = JSON.stringify(composeNotices(student, list, {asOf:ASOF}));
    expect(JSON.stringify(composeNotices(student, [...list].reverse(), {asOf:ASOF}))).toBe(a);
  });

  it('rejects an invalid asOf instead of reading the clock', () => {
    expect(() => composeNotices(student, list, {asOf:'now'})).toThrow(RangeError);
  });
});

describe('TASK-14 date normalization', () => {
  it('"~까지" date-only deadlines become the end of the Seoul day', () => {
    expect(endOfSeoulDay('2026-11-25')).toBe('2026-11-25T23:59:59+09:00');
    expect(validateNotice(notice('D', {studentDeadline:endOfSeoulDay('2026-11-25')}))).toBeUndefined();
    expect(() => endOfSeoulDay('2026-02-30')).toThrow(RangeError);
    expect(() => endOfSeoulDay('2026/11/25')).toThrow(RangeError);
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
