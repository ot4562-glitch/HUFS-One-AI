import {describe, expect, it} from 'vitest';
import {applySameCourseRules, type SameCourseRule} from './course-equivalence.js';
import {buildAcademicLedger, type LedgerAttempt, type LedgerRequirement} from './ledger.js';

const AS_OF = '2026-12-20T12:00:00+09:00';
const attempt = (token:string, course:string, term = '2024-1', extra:Partial<LedgerAttempt> = {}):LedgerAttempt =>
  ({attemptToken:token, canonicalCourseId:course, creditUnits:6, ledger:'EARNED', areaIds:['SYN-MAJOR'], recognition:'RECOGNIZED', term, ...extra});
const rule = (id:string, from:string[], to:string, state:SameCourseRule['state'] = 'APPROVED'):SameCourseRule =>
  ({id, fromCourseIds:from, toCourseId:to, state, evidenceRefs:state === 'APPROVED' ? ['SYN-EV-SAME-TABLE'] : []});
const requirements:LedgerRequirement[] = [
  {id:'SYN-REQ-NEW', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-NEW', evidenceRefs:['SYN-EV-REQ']},
  {id:'SYN-REQ-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:6, evidenceRefs:['SYN-EV-TOTAL']},
];
const ledger = (attempts:LedgerAttempt[]) => buildAcademicLedger({asOf:AS_OF, rulePackVersion:'SYN-PACK-1', rulePackState:'APPROVED', attempts, requirements});
const row = (result:ReturnType<typeof ledger>, id:string) => result.requirements.find(r => r.requirementId === id)!;

describe('applySameCourseRules', () => {
  it('lets an approved rule meet a requirement on the current course with the old one', () => {
    const before = ledger([attempt('SYN-A1', 'SYN-OLD')]);
    expect(row(before, 'SYN-REQ-NEW').state).toBe('UNSATISFIED');
    const out = applySameCourseRules([attempt('SYN-A1', 'SYN-OLD')], [rule('SYN-R1', ['SYN-OLD'], 'SYN-NEW')]);
    expect(out).toMatchObject({state:'APPLIED', held:[], applied:[{attemptToken:'SYN-A1', fromCourseId:'SYN-OLD', toCourseId:'SYN-NEW', ruleId:'SYN-R1'}]});
    expect(row(ledger(out.attempts), 'SYN-REQ-NEW').state).toBe('SATISFIED');
  });

  it('stops double counting when both the old and the current course were taken', () => {
    // Without the rule the two look like different courses and both credits count.
    const both = [attempt('SYN-A1', 'SYN-OLD', '2023-1'), attempt('SYN-A2', 'SYN-NEW', '2025-1')];
    expect(ledger(both).earnedCreditUnits).toBe(12);
    // With it they are one course earned twice without an approved retake: the ledger holds both.
    const after = ledger(applySameCourseRules(both, [rule('SYN-R1', ['SYN-OLD'], 'SYN-NEW')]).attempts);
    expect(after.earnedCreditUnits).toBe(0);
    expect(after.state).toBe('NEEDS_REVIEW');
    expect(after.excludedAttempts).toEqual([{attemptToken:'SYN-A1', reason:'NEEDS_REVIEW'}, {attemptToken:'SYN-A2', reason:'NEEDS_REVIEW'}]);
    // Earned old course plus the current course only in progress: the second one is a duplicate.
    const {term:_term, ...current} = attempt('SYN-A2', 'SYN-NEW');
    const planned:LedgerAttempt[] = [attempt('SYN-A1', 'SYN-OLD', '2023-1'), {...current, ledger:'IN_PROGRESS'}];
    const after2 = ledger(applySameCourseRules(planned, [rule('SYN-R1', ['SYN-OLD'], 'SYN-NEW')]).attempts);
    expect(after2.earnedCreditUnits).toBe(6);
    expect(after2.excludedAttempts).toEqual([{attemptToken:'SYN-A2', reason:'DUPLICATE'}]);
  });

  it('lets an approved retake run from the old course to the current one', () => {
    const attempts = [attempt('SYN-A1', 'SYN-OLD', '2023-1'),
      attempt('SYN-A2', 'SYN-NEW', '2025-1', {supersedesAttemptToken:'SYN-A1', retakeApprovalRef:'SYN-EV-RETAKE'})];
    const before = ledger(attempts);
    expect(before.excludedAttempts.find(e => e.attemptToken === 'SYN-A1')).toBeUndefined();
    const after = ledger(applySameCourseRules(attempts, [rule('SYN-R1', ['SYN-OLD'], 'SYN-NEW')]).attempts);
    expect(after.excludedAttempts).toEqual([{attemptToken:'SYN-A1', reason:'RETAKE_SUPERSEDED'}]);
    expect(after.earnedCreditUnits).toBe(6);
  });

  it('does not apply an unapproved rule and lists the attempt as held', () => {
    for (const state of ['DRAFT', 'NEEDS_REVIEW'] as const) {
      const out = applySameCourseRules([attempt('SYN-A1', 'SYN-OLD')], [rule('SYN-R1', ['SYN-OLD'], 'SYN-NEW', state)]);
      expect(out).toMatchObject({state:'NEEDS_REVIEW', applied:[], held:[{attemptToken:'SYN-A1', courseId:'SYN-OLD', ruleIds:['SYN-R1'], reason:'RULE_NOT_APPROVED'}]});
      expect(out.attempts[0]!.canonicalCourseId).toBe('SYN-OLD');
      expect(row(ledger(out.attempts), 'SYN-REQ-NEW').state).toBe('UNSATISFIED');
    }
  });

  it('never merges look-alike ids without a rule', () => {
    // one character apart, same prefix: still two courses (#133 decision D)
    const out = applySameCourseRules([attempt('SYN-A1', 'SYN-C10101'), attempt('SYN-A2', 'SYN-C10104')], [rule('SYN-R1', ['SYN-OTHER'], 'SYN-NEW')]);
    expect(out).toMatchObject({state:'APPLIED', applied:[], held:[]});
    expect(out.attempts.map(a => a.canonicalCourseId)).toEqual(['SYN-C10101', 'SYN-C10104']);
    expect(ledger(out.attempts).earnedCreditUnits).toBe(12);
  });

  it('holds a course that rules map to different targets, even when only one is approved', () => {
    const rules = [rule('SYN-R1', ['SYN-OLD'], 'SYN-NEW'), rule('SYN-R2', ['SYN-OLD'], 'SYN-NEWER', 'DRAFT')];
    const out = applySameCourseRules([attempt('SYN-A1', 'SYN-OLD')], rules);
    expect(out).toMatchObject({state:'NEEDS_REVIEW', applied:[], held:[{courseId:'SYN-OLD', ruleIds:['SYN-R1', 'SYN-R2'], reason:'AMBIGUOUS'}]});
    expect(out.attempts[0]!.canonicalCourseId).toBe('SYN-OLD');
    expect(applySameCourseRules([attempt('SYN-A1', 'SYN-OLD')], [...rules].reverse()).held[0]!.ruleIds).toEqual(['SYN-R1', 'SYN-R2']);
  });

  it('applies one rule that lists several old courses (e.g. two former section codes)', () => {
    const out = applySameCourseRules([attempt('SYN-A1', 'SYN-OLD-1', '2023-1'), attempt('SYN-A2', 'SYN-OLD-2', '2023-2'), attempt('SYN-A3', 'SYN-KEEP')],
      [rule('SYN-R1', ['SYN-OLD-1', 'SYN-OLD-2'], 'SYN-NEW')]);
    expect(out.attempts.map(a => a.canonicalCourseId)).toEqual(['SYN-NEW', 'SYN-NEW', 'SYN-KEEP']);
    expect(out.applied.map(a => a.attemptToken)).toEqual(['SYN-A1', 'SYN-A2']);
  });

  it('refuses chains, cycles and malformed rules', () => {
    const a = [attempt('SYN-A1', 'SYN-OLD')];
    expect(() => applySameCourseRules(a, [rule('SYN-R1', ['SYN-A'], 'SYN-B'), rule('SYN-R2', ['SYN-B'], 'SYN-C')])).toThrow(/composed rule/);
    expect(() => applySameCourseRules(a, [rule('SYN-R1', ['SYN-A'], 'SYN-B'), rule('SYN-R2', ['SYN-B'], 'SYN-A')])).toThrow(/composed rule/);
    expect(() => applySameCourseRules(a, [rule('SYN-R1', ['SYN-A'], 'SYN-A')])).toThrow(/itself/);
    expect(() => applySameCourseRules(a, [rule('SYN-R1', ['SYN-A'], 'SYN-B'), rule('SYN-R1', ['SYN-C'], 'SYN-D')])).toThrow(/duplicate same-course rule/);
    expect(() => applySameCourseRules(a, [{...rule('SYN-R1', ['SYN-A'], 'SYN-B'), evidenceRefs:[]}])).toThrow(/without evidence/);
    expect(() => applySameCourseRules(a, [rule('SYN-R1', [], 'SYN-B')])).toThrow(/fromCourseIds/);
    expect(() => applySameCourseRules(a, [rule('SYN-R1', ['SYN-A', 'SYN-A'], 'SYN-B')])).toThrow(/repeats/);
    expect(() => applySameCourseRules(a, [rule('bad id', ['SYN-A'], 'SYN-B')])).toThrow();
    expect(() => applySameCourseRules(a, [{...rule('SYN-R1', ['SYN-A'], 'SYN-B'), state:'OK' as never}])).toThrow(/unknown state/);
    expect(() => applySameCourseRules([attempt('SYN-A1', 'SYN-X'), attempt('SYN-A1', 'SYN-Y')], [])).toThrow(/duplicate attemptToken/);
    expect(() => applySameCourseRules([attempt('SYN-A1', 'SYN-X', '2024-3')], [])).toThrow(/term/);
  });

  it('does not modify its inputs and gives the same result for any rule order', () => {
    const attempts = Object.freeze([Object.freeze(attempt('SYN-A1', 'SYN-OLD')), Object.freeze(attempt('SYN-A2', 'SYN-OTHER'))]);
    const rules = [rule('SYN-R2', ['SYN-OTHER'], 'SYN-NEW-2'), rule('SYN-R1', ['SYN-OLD'], 'SYN-NEW')];
    const one = applySameCourseRules(attempts, rules);
    const two = applySameCourseRules(attempts, [...rules].reverse());
    expect(one).toEqual(two);
    expect(attempts[0]!.canonicalCourseId).toBe('SYN-OLD');
    expect(one.attempts[0]).not.toBe(attempts[0]);
    // an attempt no rule touches is still a fresh copy, so callers cannot change the input through it
    const untouched = Object.freeze(attempt('SYN-A3', 'SYN-KEEP'));
    const kept = applySameCourseRules([untouched], rules).attempts[0]!;
    expect(kept).toEqual(untouched);
    expect(kept).not.toBe(untouched);
    expect(kept.areaIds).not.toBe(untouched.areaIds);
  });
});
