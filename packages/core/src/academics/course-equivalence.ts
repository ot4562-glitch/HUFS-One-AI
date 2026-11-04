import {assertId, termKey, type LedgerAttempt} from './ledger.js';

/**
 * applySameCourseRules (#133 F②): before the ledger runs, rewrite attempts of an old course to the
 * current course that an official 동일 교과목 rule names, so the ledger treats both as one course:
 * a requirement on the current course is met by the old one, an approved retake from the old course
 * to the new one is recognized, and the two are no longer counted as two courses. Both earned
 * without an approved retake is one course earned twice, which the ledger holds for review.
 *
 * Only explicit rules count. Course ids are opaque: two ids that look alike (same prefix, one
 * character apart) are never merged. A rule that is not APPROVED is not applied; every attempt it
 * would touch is listed as held so the caller can show NEEDS_REVIEW. Not an official recognition of
 * any equivalence: the caller supplies the rules and their approval.
 *
 * A substitute course (대체 이수: either course meets one requirement, both may be credited) is not a
 * same-course rule. It belongs in the requirement itself as a K_OF_N option, not here.
 * Pure: no clock, network, or storage. Inputs are not modified.
 */

export interface SameCourseRule {
  id:string;
  /** Old course ids. Each must differ from `toCourseId`. */
  fromCourseIds:readonly string[];
  /** The current course every attempt of a `fromCourseIds` course is counted as. */
  toCourseId:string;
  state:'APPROVED'|'DRAFT'|'NEEDS_REVIEW';
  /** Required for APPROVED: the official listing (e.g. the 동일 교과목 table row). */
  evidenceRefs:readonly string[];
}

export interface AppliedSameCourse {
  attemptToken:string;
  fromCourseId:string;
  toCourseId:string;
  ruleId:string;
}

export interface HeldSameCourse {
  attemptToken:string;
  courseId:string;
  ruleIds:string[];
  /** RULE_NOT_APPROVED: only unapproved rules name this course. AMBIGUOUS: rules name different targets. */
  reason:'RULE_NOT_APPROVED'|'AMBIGUOUS';
}

export interface SameCourseResult {
  /** APPLIED when nothing is held. NEEDS_REVIEW when any attempt is held; held attempts keep their course. */
  state:'APPLIED'|'NEEDS_REVIEW';
  attempts:LedgerAttempt[];
  applied:AppliedSameCourse[];
  held:HeldSameCourse[];
}

function validate(rules:readonly SameCourseRule[]):void {
  if (!Array.isArray(rules)) throw new TypeError('rules must be an array');
  const ids = new Set<string>();
  for (const rule of rules) {
    assertId(rule.id, 'same-course rule id');
    if (ids.has(rule.id)) throw new TypeError(`duplicate same-course rule ${rule.id}`);
    ids.add(rule.id);
    if (!['APPROVED', 'DRAFT', 'NEEDS_REVIEW'].includes(rule.state)) throw new TypeError(`${rule.id} has unknown state`);
    assertId(rule.toCourseId, `${rule.id} toCourseId`);
    if (!Array.isArray(rule.fromCourseIds) || rule.fromCourseIds.length === 0) throw new TypeError(`${rule.id} needs fromCourseIds`);
    if (new Set(rule.fromCourseIds).size !== rule.fromCourseIds.length) throw new TypeError(`${rule.id} repeats a fromCourseId`);
    for (const from of rule.fromCourseIds) {
      assertId(from, `${rule.id} fromCourseId`);
      if (from === rule.toCourseId) throw new TypeError(`${rule.id} maps ${from} to itself`);
    }
    if (!Array.isArray(rule.evidenceRefs)) throw new TypeError(`${rule.id} evidenceRefs must be an array`);
    for (const ref of rule.evidenceRefs) assertId(ref, `${rule.id} evidence`);
    if (rule.state === 'APPROVED' && rule.evidenceRefs.length === 0) throw new TypeError(`${rule.id} is APPROVED without evidence`);
  }
  // A chain (A -> B, B -> C) or a cycle would need an order of application. Refuse it: the caller
  // writes the composed rule (A -> C) with its own evidence instead.
  const approvedFrom = new Set(rules.filter(r => r.state === 'APPROVED').flatMap(r => r.fromCourseIds));
  for (const rule of rules) {
    if (rule.state === 'APPROVED' && approvedFrom.has(rule.toCourseId)) {
      throw new TypeError(`${rule.id} maps to ${rule.toCourseId}, which another approved rule maps away; write one composed rule`);
    }
  }
}

export function applySameCourseRules(attempts:readonly LedgerAttempt[], rules:readonly SameCourseRule[]):SameCourseResult {
  if (!Array.isArray(attempts)) throw new TypeError('attempts must be an array');
  validate(rules);
  const tokens = new Set<string>();
  for (const attempt of attempts) {
    assertId(attempt.attemptToken, 'attemptToken');
    assertId(attempt.canonicalCourseId, `${attempt.attemptToken} canonicalCourseId`);
    if (tokens.has(attempt.attemptToken)) throw new TypeError(`duplicate attemptToken ${attempt.attemptToken}`);
    tokens.add(attempt.attemptToken);
    if (attempt.term !== undefined) termKey(attempt.term);
  }

  // course id -> rules naming it as an old course
  const byFrom = new Map<string, SameCourseRule[]>();
  for (const rule of rules) {
    for (const from of rule.fromCourseIds) byFrom.set(from, [...(byFrom.get(from) ?? []), rule]);
  }

  const applied:AppliedSameCourse[] = [];
  const held:HeldSameCourse[] = [];
  const out = attempts.map(attempt => {
    const copy:LedgerAttempt = {...attempt, areaIds:[...attempt.areaIds]};
    const named = byFrom.get(attempt.canonicalCourseId);
    if (!named) return copy;
    const approved = named.filter(r => r.state === 'APPROVED');
    // Any rule, approved or not, that names another target makes the course ambiguous.
    const targets = new Set(named.map(r => r.toCourseId));
    const ruleIds = named.map(r => r.id).sort();
    if (targets.size > 1) {
      held.push({attemptToken:attempt.attemptToken, courseId:attempt.canonicalCourseId, ruleIds, reason:'AMBIGUOUS'});
      return copy;
    }
    if (approved.length === 0) {
      held.push({attemptToken:attempt.attemptToken, courseId:attempt.canonicalCourseId, ruleIds, reason:'RULE_NOT_APPROVED'});
      return copy;
    }
    const rule = [...approved].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]!;
    applied.push({attemptToken:attempt.attemptToken, fromCourseId:attempt.canonicalCourseId, toCourseId:rule.toCourseId, ruleId:rule.id});
    return {...copy, canonicalCourseId:rule.toCourseId};
  });
  return {state:held.length ? 'NEEDS_REVIEW' : 'APPLIED', attempts:out, applied, held};
}
