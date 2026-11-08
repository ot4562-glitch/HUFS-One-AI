import {describe, expect, it} from 'vitest';
import {
  evaluateScholarship, prepareActivityRecognition, evaluateBadgePreparation,
  type ScholarshipCondition,
} from './eligibility.js';
import {
  rankMentors, routeCounseling, compareJobRequirements, recommendLearningPrograms,
  type MentorCandidate, type LearningProgram,
} from './recommendations.js';
import {
  searchApprovedOpportunities, calculatePublicEmploymentRate, selectInternationalGuide,
  type ApprovedOpportunity, type OpportunityFilters,
} from './discovery.js';

const gpa: ScholarshipCondition = {
  id: 'GPA', factKey: 'grade', operation: 'NUMBER_GTE', expected: 3.5, sourceState: 'VERIFIED',
};
describe('#343 scholarship eligibility core', () => {
  it('handles an inclusive GPA boundary', () => {
    expect(evaluateScholarship([gpa], {grade: {value: 3.5, provenance: 'VERIFIED'}}).overall).toBe('MET');
    expect(evaluateScholarship([gpa], {grade: {value: 3.49, provenance: 'VERIFIED'}}).overall).toBe('NOT_MET');
  });
  it('never treats missing or self-reported grades as verified', () => {
    expect(evaluateScholarship([gpa], {}).overall).toBe('UNKNOWN');
    expect(evaluateScholarship([gpa], {grade: {value: 4.0, provenance: 'SELF_REPORTED'}}).overall).toBe('UNKNOWN');
  });
  it('makes an unverified rule unknown and handles invalid fact shapes', () => {
    expect(evaluateScholarship([{...gpa, sourceState: 'NEEDS_REVIEW'}], {
      grade: {value: 3.8, provenance: 'VERIFIED'},
    }).overall).toBe('UNKNOWN');
    expect(evaluateScholarship([gpa], {grade: {value: '3.8', provenance: 'VERIFIED'}}).overall).toBe('UNKNOWN');
  });
  it('never promotes an empty or partly unknown list to fully eligible', () => {
    expect(evaluateScholarship([], {}).overall).toBe('UNKNOWN');
    expect(evaluateScholarship([gpa, {...gpa, id: 'X', factKey: 'unknown'}],
      {grade: {value: 4.0, provenance: 'VERIFIED'}}).overall).toBe('UNKNOWN');
  });
  it('preserves a verified mismatch even if another requirement is missing', () => {
    expect(evaluateScholarship([gpa, {...gpa, id: 'X', factKey: 'unknown'}],
      {grade: {value: 3.0, provenance: 'VERIFIED'}}).overall).toBe('NOT_MET');
  });
});

describe('#346 external activity recognition preparation', () => {
  const rule = {id: 'R', sourceState: 'VERIFIED' as const,
    requiredProofKinds: ['CERTIFICATE', 'REPORT']};
  it('does not mark incomplete evidence ready', () => {
    const result = prepareActivityRecognition('A1', rule, [
      {id: 'P1', kind: 'CERTIFICATE', activityId: 'A1', ownerReviewed: true},
    ]);
    expect(result.status).toBe('DOCUMENTS_PENDING');
    expect(result.officialRecognition).toBe(false);
    expect(result.items[1]?.state).toBe('MISSING');
  });
  it('treats a pending document review as missing', () => {
    expect(prepareActivityRecognition('A1', rule, [
      {id: 'P1', kind: 'CERTIFICATE', activityId: 'A1', ownerReviewed: false},
    ]).status).toBe('DOCUMENTS_PENDING');
  });
  it('does not borrow proofs from other activities', () => {
    expect(prepareActivityRecognition('A1', rule, [
      {id: 'P2', kind: 'REPORT', activityId: 'A2', ownerReviewed: true},
    ]).items[1]?.state).toBe('MISSING');
  });
  it('prepares both documents without granting official recognition', () => {
    const result = prepareActivityRecognition('A1', rule, ['CERTIFICATE', 'REPORT']
      .map((kind, i) => ({id: String(i), kind, activityId: 'A1', ownerReviewed: true})));
    expect(result.status).toBe('READY_FOR_OFFICIAL_REVIEW');
    expect(result.officialRecognition).toBe(false);
    expect(prepareActivityRecognition('A1', {...rule, sourceState: 'REVOKED'}, []).status).toBe('UNKNOWN_RULE');
  });
});

describe('#349 open badge preparation', () => {
  const rule = {id: 'B', sourceState: 'VERIFIED' as const,
    required: [{id: 'REQ', topicCode: 'DATA', minDistinctActivities: 2}]};
  it('counts distinct owner-approved activities only', () => {
    const proof = {activityId: 'A', topicCode: 'DATA', ownerApproved: true, sourceState: 'VERIFIED' as const};
    const report = evaluateBadgePreparation(rule, [proof, proof, {...proof, activityId: 'B', ownerApproved: false}]);
    expect(report.status).toBe('IN_PROGRESS');
    expect(report.checks[0]?.confirmedEvidenceCount).toBe(1);
  });
  it('means prepared, not issued', () => {
    const evidence = ['A', 'B'].map(activityId =>
      ({activityId, topicCode: 'DATA', ownerApproved: true, sourceState: 'VERIFIED' as const}));
    const result = evaluateBadgePreparation(rule, evidence);
    expect(result.status).toBe('READY_TO_CHECK');
    expect(result.officialIssued).toBe(false);
  });
  it('rejects invalid or unverified rules', () => {
    expect(evaluateBadgePreparation({...rule, sourceState: 'REVOKED'}, []).status).toBe('UNKNOWN');
    expect(evaluateBadgePreparation({...rule, required: []}, []).status).toBe('UNKNOWN');
    expect(evaluateBadgePreparation({...rule, required: [{...rule.required[0]!, minDistinctActivities: 0}]},
      []).status).toBe('UNKNOWN');
  });
});

describe('#344 ranked mentors', () => {
  const student = {majorCodes: ['ECON'], desiredJobCodes: ['ANALYST'],
    approvedExperienceTopics: ['DATA'], preferredLanguage: 'ko'};
  const mentors: MentorCandidate[] = [
    {id: 'unrelated', sourceState: 'VERIFIED', active: true, majorCodes: ['ART'],
      jobCodes: ['DESIGNER'], experienceTopics: ['DRAW'], languages: ['ko'], campuses: []},
    {id: 'similar', sourceState: 'VERIFIED', active: true, majorCodes: ['ECON'],
      jobCodes: ['ANALYST'], experienceTopics: ['DATA'], languages: ['ko'], campuses: []},
  ];
  it('puts a similar major, job and experience mentor first', () => {
    const items = rankMentors(student, mentors);
    expect(items.map(m => m.id)).toEqual(['similar', 'unrelated']);
    expect(items[0]?.ruleScore).toBe(1);
    expect(items[0]?.matchingExperienceTopics).toEqual(['DATA']);
  });
  it('does not include revoked or inactive mentors', () => {
    expect(rankMentors(student, [...mentors, {...mentors[1]!, id: 'revoked', sourceState: 'REVOKED'},
      {...mentors[1]!, id: 'inactive', active: false}])).toHaveLength(2);
  });
  it('renormalizes for undisclosed dimensions', () => {
    const items = rankMentors({...student, majorCodes: [], desiredJobCodes: []}, mentors);
    expect(items[0]?.ruleScore).toBe(1);
  });
  it('is stable for an empty profile', () => {
    const items = rankMentors({majorCodes: [], desiredJobCodes: [], approvedExperienceTopics: []},
      [mentors[1]!, mentors[0]!]);
    expect(items.map(x => x.id)).toEqual(['similar', 'unrelated']);
    expect(items.every(x => x.ruleScore === 0)).toBe(true);
  });
});

describe('#345 counseling routing', () => {
  const services = [
    {id: 'career', sourceState: 'VERIFIED' as const, active: true,
      purposes: ['CAREER'], campuses: ['SEOUL'], languages: ['ko']},
    {id: 'academic', sourceState: 'VERIFIED' as const, active: true,
      purposes: ['ACADEMIC'], relatedPurposes: ['CAREER'], campuses: ['SEOUL'], languages: ['ko']},
  ];
  it('ranks exact-purpose services higher than related-purpose services', () => {
    expect(routeCounseling({purposes: ['CAREER'], campus: 'SEOUL'}, services).map(x => x.id))
      .toEqual(['career', 'academic']);
  });
  it('returns no route for absent purpose', () => {
    expect(routeCounseling({purposes: []}, services)).toEqual([]);
  });
  it('honors campus, language and source review', () => {
    expect(routeCounseling({purposes: ['CAREER'], language: 'en'}, services)).toEqual([]);
    expect(routeCounseling({purposes: ['CAREER'], campus: 'GLOBAL'}, services)).toEqual([]);
    expect(routeCounseling({purposes: ['CAREER']},
      services.map(s => ({...s, sourceState: 'NEEDS_REVIEW' as const})))).toEqual([]);
  });
});

describe('#347 job skill evidence mapping', () => {
  const r = [{id: 'R1', topicCodes: ['DATA'], sourceState: 'VERIFIED' as const},
    {id: 'R2', topicCodes: ['PUBLIC'], sourceState: 'VERIFIED' as const},
    {id: 'R3', topicCodes: [], sourceState: 'VERIFIED' as const},
    {id: 'R4', topicCodes: ['UNKNOWN'], sourceState: 'REVOKED' as const}];
  it('finds the correct approved experience without claiming ability', () => {
    const result = compareJobRequirements(r, [
      {id: 'X', topicCodes: ['DATA'], ownerApproved: true},
      {id: 'Y', topicCodes: ['PUBLIC'], ownerApproved: false},
    ]);
    expect(result.map(x => x.status)).toEqual([
      'SUPPORTED_BY_EVIDENCE', 'EVIDENCE_MISSING', 'UNMAPPED', 'NEEDS_REVIEW']);
    expect(result[0]?.matchingExperienceIds).toEqual(['X']);
    expect(result[1]?.matchingExperienceIds).toEqual([]);
  });
});

describe('#350 learning programs', () => {
  const profile = {goalTags: ['STATS'], courseCodes: ['ECON201'], topicCodes: ['DATA'], campus: 'SEOUL', term: '2026-2'};
  const programs: LearningProgram[] = [
    {id: 'best', sourceState: 'VERIFIED', active: true, goalTags: ['STATS'],
      courseCodes: ['ECON201'], topicCodes: ['DATA'], campus: 'SEOUL', term: '2026-2'},
    {id: 'not-for-campus', sourceState: 'VERIFIED', active: true, goalTags: ['STATS'],
      courseCodes: ['ECON201'], topicCodes: ['DATA'], campus: 'GLOBAL', term: '2026-2'},
    {id: 'general', sourceState: 'VERIFIED', active: true, goalTags: [],
      courseCodes: [], topicCodes: ['DATA']},
  ];
  it('prefers a matching course and goal over a generic program', () => {
    expect(recommendLearningPrograms(profile, programs, '2026-11-08T12:00:00+09:00')
      .map(p => p.id)).toEqual(['best', 'general']);
  });
  it('filters expired offers and revoked sources', () => {
    expect(recommendLearningPrograms(profile, [
      {...programs[0]!, deadline: '2026-01-01T00:00:00+09:00'},
      {...programs[0]!, id: 'revoked', sourceState: 'REVOKED'},
    ], '2026-11-08T12:00:00+09:00')).toEqual([]);
  });
  it('labels applicability unknown when the applicant does not disclose campus', () => {
    const r = recommendLearningPrograms({goalTags: profile.goalTags, courseCodes: profile.courseCodes,
      topicCodes: profile.topicCodes, term: profile.term}, programs,
      '2026-11-08T12:00:00+09:00');
    expect(r.find(x => x.id === 'best')?.eligibility).toBe('UNKNOWN');
  });
});

describe('#348 authorized full catalog paging', () => {
  const list: ApprovedOpportunity[] = Array.from({length: 101}, (_, index) => ({
    id: String(index).padStart(3, '0'), title: index === 100 ? 'unique final page' : 'common listing',
    topicCodes: [], category: 'JOB', sourceState: 'VERIFIED', permitted: true,
  }));
  const filters: OpportunityFilters = {order: 'TITLE'};
  const opts = {asOf: '2026-11-08T12:00:00+09:00', sourceRevisionId: 'rev1', scopeToken: 'actor-a', limit: 30};
  it('reaches matching records outside the initial page', () => {
    const r = searchApprovedOpportunities(list, {...filters, q: 'unique'}, opts);
    expect(r.items.map(x => x.id)).toEqual(['100']);
    expect(r.hasMore).toBe(false);
  });
  it('uses stable cursor pages without loss or duplicates', () => {
    const found: string[] = [];
    let cursor: ReturnType<typeof searchApprovedOpportunities>['nextCursor'] = null;
    for (let page = 0; page < 10; page += 1) {
      const res = searchApprovedOpportunities(list, filters, {...opts, ...(cursor ? {cursor} : {})});
      found.push(...res.items.map(i => i.id));
      cursor = res.nextCursor;
      if (!res.hasMore) break;
    }
    expect(new Set(found).size).toBe(list.length);
    expect(found).toHaveLength(list.length);
  });
  it('rejects changing actor or filter while reusing the cursor', () => {
    const first = searchApprovedOpportunities(list, filters, opts);
    expect(first.nextCursor).not.toBeNull();
    expect(() => searchApprovedOpportunities(list, filters,
      {...opts, scopeToken: 'actor-b', cursor: first.nextCursor!})).toThrow('STALE_CURSOR');
    expect(() => searchApprovedOpportunities(list, {...filters, q: 'different'},
      {...opts, cursor: first.nextCursor!})).toThrow('STALE_CURSOR');
  });
  it('denies unapproved or unauthorized records before searching', () => {
    const r = searchApprovedOpportunities([
      {...list[100]!, id: 'rejected', permitted: false},
      {...list[100]!, id: 'revoked', sourceState: 'REVOKED'},
    ], filters, opts);
    expect(r.items).toEqual([]);
  });
  it('sorts verified deadlines before unknown deadlines', () => {
    const r = searchApprovedOpportunities([
      {...list[0]!, id: 'no-deadline'},
      {...list[0]!, id: 'due', deadline: '2026-11-10T23:59:00+09:00'},
    ], {order: 'DEADLINE_ASC'}, opts);
    expect(r.items[0]?.id).toBe('due');
  });
});

describe('#351 safe published statistics', () => {
  const data = {numerator: 20, denominator: 40, sourceState: 'VERIFIED' as const,
    publicApproved: true, minPublishablePositiveCount: 5};
  it('calculates a valid percentage only', () => {
    expect(calculatePublicEmploymentRate(data)).toEqual({status: 'PERCENT', percentage: 50});
  });
  it('distinguishes observed zero from unknown records', () => {
    expect(calculatePublicEmploymentRate({...data, numerator: 0})).toEqual(
      {status: 'OBSERVED_ZERO', percentage: 0});
    expect(calculatePublicEmploymentRate({denominator: 40, sourceState: 'VERIFIED', publicApproved: true,
      minPublishablePositiveCount: 5}).status).toBe('NO_DATA');
  });
  it('suppresses low population or unapproved data', () => {
    expect(calculatePublicEmploymentRate({...data, numerator: 1}).status).toBe('SUPPRESSED');
    expect(calculatePublicEmploymentRate({...data, publicApproved: false}).status).toBe('SUPPRESSED');
    expect(calculatePublicEmploymentRate({numerator: 20, denominator: 40, sourceState: 'VERIFIED',
      publicApproved: true}).status)
      .toBe('SUPPRESSED');
  });
  it('rejects impossible denominators and numerators', () => {
    expect(calculatePublicEmploymentRate({...data, denominator: 0}).status).toBe('INVALID_DENOMINATOR');
    expect(calculatePublicEmploymentRate({...data, numerator: 41}).status).toBe('INVALID_DENOMINATOR');
  });
});

describe('#352 checked multilingual administrative guides', () => {
  const guide = {id: 'G', topicCode: 'ENROLL', campuses: ['SEOUL'], terms: ['2026-2'],
    sourceState: 'VERIFIED' as const, translations: {
      ko: {text: '공식 안내', reviewStatus: 'HUMAN_VERIFIED' as const},
      en: {text: 'machine draft', reviewStatus: 'MACHINE_DRAFT' as const},
      zh: {text: '已审核', reviewStatus: 'HUMAN_VERIFIED' as const},
    }};
  it('uses reviewed Chinese text for Chinese readers', () => {
    const r = selectInternationalGuide(guide,
      {topicCode: 'ENROLL', campus: 'SEOUL', term: '2026-2', locale: 'zh'});
    expect(r).toMatchObject({state: 'READY', locale: 'zh', text: '已审核', translationStatus: 'VERIFIED'});
  });
  it('falls back to reviewed Korean, never unreviewed AI translation', () => {
    const r = selectInternationalGuide(guide,
      {topicCode: 'ENROLL', campus: 'SEOUL', term: '2026-2', locale: 'en'});
    expect(r).toMatchObject({state: 'READY', locale: 'ko', text: '공식 안내',
      translationStatus: 'FALLBACK_KO'});
  });
  it('does not mix another semester or campus into current guidance', () => {
    expect(selectInternationalGuide(guide,
      {topicCode: 'ENROLL', campus: 'GLOBAL', term: '2026-2', locale: 'ko'}).state).toBe('NOT_APPLICABLE');
    expect(selectInternationalGuide(guide,
      {topicCode: 'ENROLL', campus: 'SEOUL', term: '2027-1', locale: 'ko'}).state).toBe('NOT_APPLICABLE');
  });
  it('marks an unverified source unknown and does not assume missing student scope', () => {
    expect(selectInternationalGuide({...guide, sourceState: 'REVOKED'},
      {topicCode: 'ENROLL', campus: 'SEOUL', term: '2026-2', locale: 'ko'}).state).toBe('SOURCE_UNKNOWN');
    expect(selectInternationalGuide(guide,
      {topicCode: 'ENROLL', locale: 'ko'}).state).toBe('SOURCE_UNKNOWN');
  });
});
