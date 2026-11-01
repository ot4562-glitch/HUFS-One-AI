import {describe, expect, it} from 'vitest';
import type {AcademicAuditVNext} from '@hufs-one/contracts';
import {composeNotices, type Notice, type NoticeStudent} from '../notices/index.js';
import {buildAcademicLedger, type AcademicLedgerRequest, type LedgerRequirement} from './ledger.js';
import {openRequirementIdsFromAudit} from './notice-links.js';

/** Synthetic only. 1 unit = 0.5학점, so 3학점 is 6 units. */
const AS_OF = '2026-11-01T00:00:00.000Z';

const requirements:LedgerRequirement[] = [
  {id:'REQ-TOTAL', kind:'CREDIT_TOTAL', requiredCreditUnits:6, evidenceRefs:['SYN-EV-TOTAL']},
  {id:'REQ-CORE', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-CORE', evidenceRefs:['SYN-EV-CORE']},
  {id:'REQ-GPA', kind:'NON_CREDIT', criterionId:'GPA', verificationMode:'GPA_NOT_COLLECTED'},
  {id:'REQ-EXAM', kind:'NON_CREDIT', criterionId:'SYN-EXAM', verificationMode:'MANUAL', evidenceRefs:['SYN-EV-EXAM']},
];

const ledger = (over:Partial<AcademicLedgerRequest> = {}):AcademicAuditVNext => buildAcademicLedger({
  asOf:AS_OF,
  rulePackVersion:'SYN-PACK-1',
  rulePackState:'APPROVED',
  attempts:[{
    attemptToken:'SYN-T-1', canonicalCourseId:'SYN-OTHER', creditUnits:6, ledger:'EARNED',
    areaIds:[], recognition:'RECOGNIZED', term:'2025-2',
  }],
  requirements,
  ...over,
});

describe('openRequirementIdsFromAudit', () => {
  it('opens unsatisfied, review, and not-checked requirements and closes satisfied ones', () => {
    const audit = ledger();
    expect(audit.requirements.map(row => [row.requirementId, row.state])).toEqual([
      ['REQ-TOTAL', 'SATISFIED'], ['REQ-CORE', 'UNSATISFIED'], ['REQ-GPA', 'NOT_CHECKED'], ['REQ-EXAM', 'NEEDS_REVIEW'],
    ]);
    expect(openRequirementIdsFromAudit(audit)).toEqual(['REQ-CORE', 'REQ-EXAM', 'REQ-GPA']);
  });

  it('opens every requirement when the rule pack is not approved', () => {
    expect(openRequirementIdsFromAudit(ledger({rulePackState:'DRAFT'})))
      .toEqual(['REQ-CORE', 'REQ-EXAM', 'REQ-GPA', 'REQ-TOTAL']);
  });

  it('returns null, not an empty list, when academics are unknown', () => {
    expect(openRequirementIdsFromAudit(ledger({rulePackState:'MISSING'}))).toBeNull();
    expect(openRequirementIdsFromAudit(null)).toBeNull();
    expect(openRequirementIdsFromAudit(undefined)).toBeNull();
  });

  it('returns an empty list only when every requirement is closed', () => {
    const audit = ledger({requirements:[requirements[0]!]});
    expect(openRequirementIdsFromAudit(audit)).toEqual([]);
  });

  it('closes an officially not-applicable requirement', () => {
    const audit = ledger();
    const withNotApplicable:AcademicAuditVNext = {...audit, requirements:audit.requirements.map(row => row.requirementId === 'REQ-EXAM'
      ? {requirementId:'REQ-EXAM', state:'NOT_APPLICABLE', evidenceRefs:['SYN-EV-EXAM'], notApplicableReason:'Synthetic exemption for this program.'}
      : row)};
    expect(openRequirementIdsFromAudit(withNotApplicable)).toEqual(['REQ-CORE', 'REQ-GPA']);
  });

  it('refuses something that is not a valid audit', () => {
    expect(() => openRequirementIdsFromAudit({...ledger(), state:'DONE'} as never)).toThrow(/valid academic audit/);
  });
});

describe('hand-off to the notice core', () => {
  const notice = (id:string, requirementRef:string):Notice => ({
    id, sourceSnapshotId:'SYN-SRC', title:`${id} 안내`, issuer:'SYN-DEPT', category:'ACADEMIC',
    requirementRefs:[requirementRef], studentDeadline:'2026-11-04T23:59:59+09:00',
    publishedAt:'2026-10-20T00:00:00+09:00', verificationState:'VERIFIED', evidenceRefs:['EV-SYN-1'],
  });
  const student = (openRequirementIds:string[]|null):NoticeStudent => ({openRequirementIds, courseIds:[], interestTopics:[]});
  const notices = [notice('SYN-N-CORE', 'REQ-CORE'), notice('SYN-N-TOTAL', 'REQ-TOTAL')];

  it('raises a notice for an open requirement and leaves one for a satisfied requirement as general', () => {
    const {result} = composeNotices(student(openRequirementIdsFromAudit(ledger())), notices, {asOf:AS_OF});
    expect(result.items.map(item => [item.noticeId, item.priority, item.appliesTo])).toEqual([
      ['SYN-N-CORE', 'CRITICAL_DUE', 'YES'],
      ['SYN-N-TOTAL', 'GENERAL', 'YES'],
    ]);
  });

  it('keeps requirement notices as required with UNKNOWN when academics are unknown', () => {
    const {result} = composeNotices(student(openRequirementIdsFromAudit(ledger({rulePackState:'MISSING'}))), notices, {asOf:AS_OF});
    expect(result.items.map(item => [item.noticeId, item.priority, item.appliesTo])).toEqual([
      ['SYN-N-CORE', 'ACADEMIC_REQUIRED', 'UNKNOWN'],
      ['SYN-N-TOTAL', 'ACADEMIC_REQUIRED', 'UNKNOWN'],
    ]);
  });
});
