import {describe, expect, it} from 'vitest';
import {DEMO_AS_OF} from '../opportunities/demo-corpus.js';
import {DEMO_STUDENTS} from '../opportunities/demo-profiles.js';
import {DEMO_NOTICES} from './demo-notices.js';
import {CRITICAL_DUE_DAYS, PINNED_MAX, composeNotices, type Notice} from './notice.js';

/**
 * #10 / A07: full decision table for the 10 SYNTHETIC academic notices × 5 SYNTHETIC students at DEMO_AS_OF.
 * Every cell was derived by hand from the A07.2 rules (scope → link → verified → ≤7 days), not copied from output.
 * Cell = priority/appliesTo[/flags]; P = pinned, O = overdue, R = review pending, U:<fields> = unknown scope.
 * A changed cell is a behaviour change that needs the A07 rule owner's review, not a fixture refresh.
 */
const EXPECTED:Record<string, readonly string[]> = {
  // S01 SEOUL·REGULAR·2027-2, open GRAD-CERT, course STAT201, AI_ML interest.
  S01:['SYN-NOT-008 CRITICAL_DUE/YES P', 'SYN-NOT-001 CRITICAL_DUE/YES P',
    'SYN-NOT-005 PERSONAL_OPPORTUNITY/UNKNOWN U:scholarshipConditions', 'SYN-NOT-006 PERSONAL_OPPORTUNITY/YES',
    'SYN-NOT-010 PERSONAL_OPPORTUNITY/YES', 'SYN-NOT-007 PERSONAL_OPPORTUNITY/YES O',
    'SYN-NOT-002 GENERAL/YES R', 'SYN-NOT-003 GENERAL/NO', 'SYN-NOT-009 GENERAL/NO', 'SYN-NOT-004 GENERAL/NO'],
  // S02 GLOBAL·REGULAR·2027-1, open GRAD-CERT, no courses, no notice topic match.
  S02:['SYN-NOT-001 CRITICAL_DUE/YES P', 'SYN-NOT-005 PERSONAL_OPPORTUNITY/UNKNOWN U:scholarshipConditions',
    'SYN-NOT-006 PERSONAL_OPPORTUNITY/YES', 'SYN-NOT-009 PERSONAL_OPPORTUNITY/YES', 'SYN-NOT-007 PERSONAL_OPPORTUNITY/YES O',
    'SYN-NOT-008 GENERAL/YES', 'SYN-NOT-002 GENERAL/YES', 'SYN-NOT-003 GENERAL/NO', 'SYN-NOT-004 GENERAL/NO', 'SYN-NOT-010 GENERAL/YES'],
  // S03 SEOUL·2026-2 verified candidate, open GRAD-EXAM (deadline 10 days → not CRITICAL_DUE).
  S03:['SYN-NOT-003 ACADEMIC_REQUIRED/YES P', 'SYN-NOT-005 PERSONAL_OPPORTUNITY/UNKNOWN U:scholarshipConditions',
    'SYN-NOT-006 PERSONAL_OPPORTUNITY/YES', 'SYN-NOT-007 PERSONAL_OPPORTUNITY/YES O',
    'SYN-NOT-008 GENERAL/YES', 'SYN-NOT-001 GENERAL/YES', 'SYN-NOT-002 GENERAL/YES', 'SYN-NOT-009 GENERAL/NO', 'SYN-NOT-004 GENERAL/NO', 'SYN-NOT-010 GENERAL/YES'],
  // S04 SEOUL·FOREIGN·2028-2, nothing open, course MEDIA101: FOREIGN-only notice applies but links nothing.
  S04:['SYN-NOT-008 CRITICAL_DUE/YES P', 'SYN-NOT-005 PERSONAL_OPPORTUNITY/UNKNOWN U:scholarshipConditions',
    'SYN-NOT-006 PERSONAL_OPPORTUNITY/YES', 'SYN-NOT-007 PERSONAL_OPPORTUNITY/YES O',
    'SYN-NOT-001 GENERAL/YES', 'SYN-NOT-002 GENERAL/YES', 'SYN-NOT-003 GENERAL/NO', 'SYN-NOT-009 GENERAL/NO', 'SYN-NOT-004 GENERAL/YES', 'SYN-NOT-010 GENERAL/YES'],
  // S05 academics not shared (null), no target term / admission type: required notices stay UNKNOWN, never pinned.
  S05:['SYN-NOT-001 ACADEMIC_REQUIRED/UNKNOWN U:academicStatus', 'SYN-NOT-003 ACADEMIC_REQUIRED/UNKNOWN U:graduationTerm+academicStatus',
    'SYN-NOT-004 ACADEMIC_REQUIRED/UNKNOWN U:admissionType+academicStatus', 'SYN-NOT-005 PERSONAL_OPPORTUNITY/UNKNOWN U:scholarshipConditions',
    'SYN-NOT-006 PERSONAL_OPPORTUNITY/YES', 'SYN-NOT-007 PERSONAL_OPPORTUNITY/YES O',
    'SYN-NOT-008 GENERAL/YES', 'SYN-NOT-002 GENERAL/YES', 'SYN-NOT-009 GENERAL/NO', 'SYN-NOT-010 GENERAL/YES'],
};

const AS_OF = Date.parse(DEMO_AS_OF);
const byId = new Map(DEMO_NOTICES.map(n => [n.id, n]));
const run = (subject:string) => {
  const student = DEMO_STUDENTS.find(s => s.subject === subject)!;
  return composeNotices(student.noticeStudent, DEMO_NOTICES, {asOf:DEMO_AS_OF});
};
const cells = (subject:string) => {
  const r = run(subject);
  return r.evaluations.map(e => {
    const flags = [r.result.pinnedIds.includes(e.noticeId) ? 'P' : '', e.overdue ? 'O' : '', e.reviewPending ? 'R' : '',
      e.unknownScope.length ? `U:${e.unknownScope.join('+')}` : ''].filter(Boolean);
    return [`${e.noticeId} ${e.priority}/${e.appliesTo}`, ...flags].join(' ');
  });
};

describe('#10 A07 academic notice grades: 10 notices × 5 students decision table (SYNTHETIC)', () => {
  for (const subject of Object.keys(EXPECTED)) {
    it(`${subject} matches the hand-derived order, grade, scope and flags`, () => {
      expect(cells(subject)).toEqual(EXPECTED[subject]);
      expect(run(subject).excluded).toEqual([]);
    });
  }

  it('the corpus is 10 notices and every grade, appliesTo value and flag occurs at least once', () => {
    expect(DEMO_NOTICES).toHaveLength(10);
    const all = Object.values(EXPECTED).flat().join(' ');
    for (const token of ['CRITICAL_DUE', 'ACADEMIC_REQUIRED', 'PERSONAL_OPPORTUNITY', 'GENERAL', '/YES', '/NO', '/UNKNOWN', ' P', ' O', ' R', ' U:']) {
      expect(all).toContain(token);
    }
  });
});

describe('#10 A07 grade invariants over every student (independent of the table)', () => {
  for (const s of DEMO_STUDENTS) {
    it(`${s.subject}: CRITICAL_DUE, pins, overdue and admin deadlines follow A07.2`, () => {
      const r = composeNotices(s.noticeStudent, DEMO_NOTICES, {asOf:DEMO_AS_OF});
      expect(r.result.pinnedIds.length).toBeLessThanOrEqual(PINNED_MAX);
      for (const e of r.evaluations) {
        const n = byId.get(e.noticeId)!;
        const due = n.studentDeadline === undefined ? undefined : Date.parse(n.studentDeadline);
        if (e.priority === 'CRITICAL_DUE') {
          // Student deadline only: the department report deadline never makes a notice urgent.
          expect(due).toBeDefined();
          expect(due! - AS_OF).toBeLessThanOrEqual(CRITICAL_DUE_DAYS * 86_400_000);
          expect(e.appliesTo).toBe('YES');
          expect(n.verificationState).toBe('VERIFIED');
          expect(e.links.requirementIds.length + e.links.courseIds.length).toBeGreaterThan(0);
        }
        if (r.result.pinnedIds.includes(e.noticeId)) {
          expect(['CRITICAL_DUE', 'ACADEMIC_REQUIRED']).toContain(e.priority);
          expect(e.appliesTo).toBe('YES');
          expect(e.overdue).toBe(false);
        }
        if (e.overdue) expect(e.priority).not.toBe('CRITICAL_DUE');
        if (e.appliesTo === 'NO') expect([e.priority, e.overdue]).toEqual(['GENERAL', false]);
        if (n.verificationState !== 'VERIFIED') expect(['GENERAL']).toContain(e.priority);
        // GPA/income are never collected, so a scholarship condition is never auto-satisfied.
        if (n.scholarshipConditions?.length && e.appliesTo !== 'NO') expect(e.unknownScope).toContain('scholarshipConditions');
        if (s.noticeStudent.openRequirementIds === null && n.requirementRefs?.length && e.appliesTo !== 'NO') {
          expect([e.priority, e.appliesTo]).toEqual(['ACADEMIC_REQUIRED', 'UNKNOWN']);
        }
      }
    });
  }

  it('is byte-stable for any input order of the notices', () => {
    for (const s of DEMO_STUDENTS) {
      const a = composeNotices(s.noticeStudent, DEMO_NOTICES, {asOf:DEMO_AS_OF});
      const b = composeNotices(s.noticeStudent, [...DEMO_NOTICES].reverse(), {asOf:DEMO_AS_OF});
      expect(JSON.stringify(b.result)).toBe(JSON.stringify(a.result));
    }
  });
});

describe('#10 A07 CRITICAL_DUE 7-day boundary (test-only notice, DEMO_NOTICES unchanged)', () => {
  const student = DEMO_STUDENTS.find(s => s.subject === 'S01')!.noticeStudent;
  const at = (ms:number) => new Date(AS_OF + ms).toISOString();
  const notice = (dueMs:number):Notice => {
    const {adminReportDeadline:_admin, ...base} = byId.get('SYN-NOT-001')!;
    return {...base, id:'SYN-NOT-EDGE', studentDeadline:at(dueMs)};
  };
  const grade = (dueMs:number) => composeNotices(student, [notice(dueMs)], {asOf:DEMO_AS_OF}).evaluations[0];
  const WINDOW = CRITICAL_DUE_DAYS * 86_400_000;

  it('exactly 7 days is CRITICAL_DUE and pinned; 7 days + 1 ms is ACADEMIC_REQUIRED', () => {
    expect(grade(WINDOW)).toMatchObject({priority:'CRITICAL_DUE', overdue:false});
    expect(composeNotices(student, [notice(WINDOW)], {asOf:DEMO_AS_OF}).result.pinnedIds).toEqual(['SYN-NOT-EDGE']);
    expect(grade(WINDOW + 1)).toMatchObject({priority:'ACADEMIC_REQUIRED', overdue:false});
    expect(grade(WINDOW + 1_000)).toMatchObject({priority:'ACADEMIC_REQUIRED'});
  });

  it('1 ms before asOf is still CRITICAL_DUE window; at asOf it is overdue ACADEMIC_REQUIRED, never CRITICAL_DUE', () => {
    expect(grade(1)).toMatchObject({priority:'CRITICAL_DUE', overdue:false});
    expect(grade(0)).toMatchObject({priority:'ACADEMIC_REQUIRED', overdue:true});
    expect(grade(-1)).toMatchObject({priority:'ACADEMIC_REQUIRED', overdue:true});
  });
});
