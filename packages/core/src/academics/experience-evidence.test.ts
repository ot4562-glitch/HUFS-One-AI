import {describe, expect, it} from 'vitest';
import {
  describeCourseEvidence,
  resolveExperienceCourseLinks,
  type AcademicEvidenceAccess,
  type ExperienceCourseLink,
} from './experience-evidence.js';
import {buildAcademicLedger, type LedgerAttempt} from './ledger.js';

/** Synthetic only (SYN-*). AS_OF falls inside 2026-2 (2026-09-01 to 2027-01-01, Asia/Seoul). */
const AS_OF = '2026-11-05T12:00:00.000+09:00';
const CONFIRMED_AT = '2026-11-01T10:00:00.000+09:00';

const attempt = (attemptToken:string, canonicalCourseId:string, over:Partial<LedgerAttempt> = {}):LedgerAttempt => ({
  attemptToken, canonicalCourseId, creditUnits:6, ledger:'EARNED', areaIds:[], recognition:'RECOGNIZED', term:'2025-1', ...over,
});
const noTerm = (row:LedgerAttempt):LedgerAttempt => {
  const {term:_term, ...rest} = row;
  return rest;
};
const shared = (attempts:readonly LedgerAttempt[], over:Partial<Extract<AcademicEvidenceAccess, {state:'SHARED'}>> = {}):AcademicEvidenceAccess => ({
  state:'SHARED', grantVersion:'SYN-GRANT-1', transcriptVersion:'SYN-TRANSCRIPT-1', attempts, ...over,
});
const link = (experienceId:string, canonicalCourseId:string, over:Partial<ExperienceCourseLink> = {}):ExperienceCourseLink => ({
  experienceId, canonicalCourseId, provenance:'STUDENT_CONFIRMED', experienceContentVersion:1,
  grantVersion:'SYN-GRANT-1', confirmedTerm:'2025-1', confirmedAt:CONFIRMED_AT, ...over,
});
const EXPERIENCES = [{experienceId:'SYN-EXP-1', contentVersion:1}, {experienceId:'SYN-EXP-2', contentVersion:1}];
const courses = (access:AcademicEvidenceAccess, asOf = AS_OF) => {
  const result = describeCourseEvidence({asOf, access});
  if (result.state !== 'SHARED') throw new Error(`expected SHARED, got ${result.state}`);
  return result.courses;
};
const one = (row:LedgerAttempt, asOf = AS_OF) => {
  const [first] = courses(shared([row]), asOf);
  if (!first) throw new Error('expected one course');
  return first;
};
const links = (input:{access:AcademicEvidenceAccess; links:readonly ExperienceCourseLink[]; asOf?:string;
  experiences?:readonly {experienceId:string; contentVersion:number}[]}) => {
  const result = resolveExperienceCourseLinks({asOf:input.asOf ?? AS_OF, access:input.access,
    experiences:input.experiences ?? EXPERIENCES, links:input.links});
  if (result.state !== 'SHARED') throw new Error(`expected SHARED, got ${result.state}`);
  return result.links;
};

describe('0, NOT_SHARED and NEEDS_REVIEW stay apart', () => {
  it('NOT_SHARED carries no course list, so it cannot be shown as zero courses', () => {
    const result = describeCourseEvidence({asOf:AS_OF, access:{state:'NOT_SHARED'}});
    expect(result).toEqual({state:'NOT_SHARED'});
    expect('courses' in result).toBe(false);
  });

  it('a failed transcript intake is NEEDS_REVIEW, not an empty transcript', () => {
    expect(describeCourseEvidence({asOf:AS_OF, access:{state:'NEEDS_REVIEW'}})).toEqual({state:'NEEDS_REVIEW'});
  });

  it('only a shared transcript without rows is a real zero', () => {
    expect(describeCourseEvidence({asOf:AS_OF, access:shared([])})).toEqual({
      state:'SHARED', basis:'STUDENT_SUBMITTED_TRANSCRIPT', transcriptVersion:'SYN-TRANSCRIPT-1', courses:[],
    });
  });

  it('NOT_SHARED hides stored links instead of reporting zero links', () => {
    for (const state of ['NOT_SHARED', 'NEEDS_REVIEW'] as const) {
      const result = resolveExperienceCourseLinks({asOf:AS_OF, access:{state}, experiences:EXPERIENCES,
        links:[link('SYN-EXP-1', 'SYN-C1')]});
      expect(result).toEqual({state});
      expect('links' in result).toBe(false);
    }
  });
});

describe('course states follow the ledger and the term calendar', () => {
  it('an earned, recognized course after its term is TAKEN with that term only', () => {
    expect(one(attempt('SYN-T1', 'SYN-C1'))).toEqual({canonicalCourseId:'SYN-C1', state:'TAKEN', term:'2025-1'});
  });

  it('a planned course is not an experience', () => {
    expect(one(attempt('SYN-T1', 'SYN-C1', {ledger:'PLANNED', term:'2027-1'})))
      .toEqual({canonicalCourseId:'SYN-C1', state:'PLANNED_ONLY'});
  });

  it('IN_PROGRESS holds only inside its term; outside it completion is not guessed', () => {
    const row = (term:string) => attempt('SYN-T1', 'SYN-C1', {ledger:'IN_PROGRESS', term});
    expect(one(row('2026-2'))).toEqual({canonicalCourseId:'SYN-C1', state:'IN_PROGRESS', term:'2026-2'});
    // The term ended but the submitted transcript still says 수강중: neither TAKEN nor IN_PROGRESS.
    expect(one(row('2026-1'))).toEqual({canonicalCourseId:'SYN-C1', state:'NEEDS_REVIEW'});
    expect(one(row('2027-1'))).toEqual({canonicalCourseId:'SYN-C1', state:'NEEDS_REVIEW'});
    expect(one(noTerm(attempt('SYN-T1', 'SYN-C1', {ledger:'IN_PROGRESS'}))))
      .toEqual({canonicalCourseId:'SYN-C1', state:'NEEDS_REVIEW'});
  });

  it('term boundaries match the ledger: IN_PROGRESS ends exactly when EARNED starts to count', () => {
    const inProgress = attempt('SYN-T1', 'SYN-C1', {ledger:'IN_PROGRESS', term:'2026-2'});
    const earned = attempt('SYN-T1', 'SYN-C1', {term:'2026-2'});
    expect(one(inProgress, '2026-08-31T23:59:59.999+09:00').state).toBe('NEEDS_REVIEW');
    expect(one(inProgress, '2026-09-01T00:00:00.000+09:00').state).toBe('IN_PROGRESS');
    expect(one(inProgress, '2026-12-31T23:59:59.999+09:00').state).toBe('IN_PROGRESS');
    expect(one(earned, '2026-12-31T23:59:59.999+09:00').state).toBe('NEEDS_REVIEW');
    expect(one(inProgress, '2027-01-01T00:00:00.000+09:00').state).toBe('NEEDS_REVIEW');
    expect(one(earned, '2027-01-01T00:00:00.000+09:00').state).toBe('TAKEN');
    const term = (value:string, asOf:string) => one(attempt('SYN-T1', 'SYN-C1', {ledger:'IN_PROGRESS', term:value}), asOf).state;
    expect(term('2026-S', '2026-07-15T09:00:00.000+09:00')).toBe('IN_PROGRESS');
    expect(term('2026-W', '2027-01-15T09:00:00.000+09:00')).toBe('IN_PROGRESS');
    expect(term('2026-1', '2026-02-28T23:59:59.999+09:00')).toBe('NEEDS_REVIEW');
    expect(term('2026-1', '2026-03-01T00:00:00.000+09:00')).toBe('IN_PROGRESS');
  });

  it('an EARNED row whose term has not ended, or has no term, is held like in the ledger', () => {
    expect(one(attempt('SYN-T1', 'SYN-C1', {term:'2026-2'})).state).toBe('NEEDS_REVIEW');
    expect(one(noTerm(attempt('SYN-T1', 'SYN-C1'))).state).toBe('NEEDS_REVIEW');
  });

  it('an approved retake looks exactly like one attempt in the later term', () => {
    const retaken = courses(shared([
      attempt('SYN-OLD', 'SYN-C1', {term:'2025-1'}),
      attempt('SYN-NEW', 'SYN-C1', {term:'2026-1', supersedesAttemptToken:'SYN-OLD', retakeApprovalRef:'SYN-RETAKE-OK'}),
    ]));
    expect(retaken).toEqual(courses(shared([attempt('SYN-ONLY', 'SYN-C1', {term:'2026-1'})])));
    expect(retaken).toEqual([{canonicalCourseId:'SYN-C1', state:'TAKEN', term:'2026-1'}]);
  });

  it('an unapproved retake is held for review instead of picking a term', () => {
    expect(courses(shared([
      attempt('SYN-OLD', 'SYN-C1', {term:'2025-1'}),
      attempt('SYN-NEW', 'SYN-C1', {term:'2026-1', supersedesAttemptToken:'SYN-OLD'}),
    ]))).toEqual([{canonicalCourseId:'SYN-C1', state:'NEEDS_REVIEW'}]);
  });

  it('two earned rows of one course without a retake link need review', () => {
    expect(courses(shared([
      attempt('SYN-A', 'SYN-C1', {term:'2025-1'}),
      attempt('SYN-B', 'SYN-C1', {term:'2025-2'}),
    ]))).toEqual([{canonicalCourseId:'SYN-C1', state:'NEEDS_REVIEW'}]);
  });

  it('an earned course stays TAKEN when the same course also appears as planned', () => {
    expect(courses(shared([
      attempt('SYN-A', 'SYN-C1'),
      attempt('SYN-B', 'SYN-C1', {ledger:'PLANNED', term:'2027-1'}),
    ]))).toEqual([{canonicalCourseId:'SYN-C1', state:'TAKEN', term:'2025-1'}]);
  });

  it('pending recognition and official exclusion cannot be linked', () => {
    expect(courses(shared([
      attempt('SYN-P', 'SYN-C1', {recognition:'PENDING'}),
      attempt('SYN-X', 'SYN-C2', {recognition:'EXCLUDED'}),
    ]))).toEqual([
      {canonicalCourseId:'SYN-C1', state:'RECOGNITION_PENDING'},
      {canonicalCourseId:'SYN-C2', state:'RECOGNITION_EXCLUDED'},
    ]);
  });

  it('agrees with the credit audit on seeded random transcripts', () => {
    let seed = 260;
    const random = () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(values:readonly T[]):T => values[Math.floor(random() * values.length)]!;
    for (let run = 0; run < 400; run += 1) {
      const count = 1 + Math.floor(random() * 6);
      const attempts:LedgerAttempt[] = [];
      for (let index = 0; index < count; index += 1) {
        const token = `SYN-R${run}-${index}`;
        const target = index > 0 && random() < 0.3 ? `SYN-R${run}-${Math.floor(random() * index)}` : undefined;
        const term = pick(['2024-1', '2024-2', '2025-1', '2025-S', '2026-1', '2026-2', undefined]);
        const row = attempt(token, pick(['SYN-C1', 'SYN-C2', 'SYN-C3']), {
          ledger:pick(['EARNED', 'EARNED', 'IN_PROGRESS', 'PLANNED'] as const),
          recognition:pick(['RECOGNIZED', 'RECOGNIZED', 'RECOGNIZED', 'PENDING', 'EXCLUDED'] as const),
          ...(term ? {term} : {}),
          ...(target ? {supersedesAttemptToken:target} : {}),
          ...(target && random() < 0.7 ? {retakeApprovalRef:`SYN-OK-${run}`} : {}),
        });
        attempts.push(term ? row : noTerm(row));
      }
      const audit = buildAcademicLedger({asOf:AS_OF, rulePackVersion:'SYN-PACK', rulePackState:'APPROVED',
        attempts, requirements:[]});
      const excluded = new Map(audit.excludedAttempts.map(row => [row.attemptToken, row.reason]));
      const counted = attempts.filter(row => row.ledger === 'EARNED' && !excluded.has(row.attemptToken));
      const held = new Set(attempts.filter(row => excluded.get(row.attemptToken) === 'NEEDS_REVIEW')
        .map(row => row.canonicalCourseId));
      const expected = [...new Set(counted.map(row => row.canonicalCourseId))].filter(id => !held.has(id)).sort();
      const result = courses(shared(attempts));
      expect(result.filter(row => row.state === 'TAKEN').map(row => row.canonicalCourseId), JSON.stringify(attempts))
        .toEqual(expected);
      expect(counted.reduce((sum, row) => sum + row.creditUnits, 0)).toBe(audit.earnedCreditUnits);
      expect(courses(shared([...attempts].reverse()))).toEqual(result);
    }
  });
});

describe('RulePack, areas and requirement results do not change course facts', () => {
  it('area allocations are not part of the evidence', () => {
    const plain = courses(shared([attempt('SYN-T1', 'SYN-C1')]));
    expect(courses(shared([attempt('SYN-T1', 'SYN-C1', {areaIds:['SYN-AREA-A', 'SYN-AREA-B']})]))).toEqual(plain);
  });

  it('a DRAFT pack holds the audit for review, and an APPROVED one adds nothing to the course facts', () => {
    const rows = [attempt('SYN-T1', 'SYN-C1')];
    const audit = (rulePackState:'DRAFT'|'APPROVED') => buildAcademicLedger({asOf:AS_OF, rulePackVersion:'SYN-PACK',
      rulePackState, attempts:rows, requirements:[{id:'SYN-REQ', kind:'REQUIRED_COURSE', canonicalCourseId:'SYN-C1',
        evidenceRefs:['SYN-EV']}]});
    expect(audit('DRAFT').requirements[0]!.state).toBe('NEEDS_REVIEW');
    expect(audit('APPROVED').requirements[0]!.state).toBe('SATISFIED');
    // The evidence core has no pack input: the same transcript gives the same course facts either way.
    expect(courses(shared(rows))).toEqual([{canonicalCourseId:'SYN-C1', state:'TAKEN', term:'2025-1'}]);
  });
});

describe('outputs carry no grade, credits, retake, area or competency', () => {
  const ALLOWED = new Set(['state', 'basis', 'transcriptVersion', 'courses', 'canonicalCourseId', 'term',
    'links', 'experienceId', 'course', 'reason']);
  const keys = (value:unknown, found = new Set<string>()):Set<string> => {
    if (Array.isArray(value)) for (const item of value) keys(item, found);
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        found.add(key);
        keys(item, found);
      }
    }
    return found;
  };

  it('only allowed fields appear, and extra input fields are not echoed', () => {
    const rows = [
      {...attempt('SYN-OLD', 'SYN-C1', {term:'2025-1', areaIds:['SYN-AREA-A']}), grade:'A+', competencyScore:91},
      attempt('SYN-NEW', 'SYN-C1', {term:'2026-1', supersedesAttemptToken:'SYN-OLD', retakeApprovalRef:'SYN-RETAKE-OK'}),
      attempt('SYN-P', 'SYN-C2', {recognition:'PENDING'}),
      attempt('SYN-I', 'SYN-C3', {ledger:'IN_PROGRESS', term:'2026-2'}),
      attempt('SYN-L', 'SYN-C4', {ledger:'PLANNED', term:'2027-1'}),
    ] as LedgerAttempt[];
    const list = describeCourseEvidence({asOf:AS_OF, access:shared(rows)});
    const resolved = resolveExperienceCourseLinks({asOf:AS_OF, access:shared(rows), experiences:EXPERIENCES, links:[
      link('SYN-EXP-1', 'SYN-C1', {confirmedTerm:'2026-1'}), link('SYN-EXP-1', 'SYN-C2'),
      link('SYN-EXP-2', 'SYN-C3', {confirmedTerm:'2026-2'}), link('SYN-EXP-2', 'SYN-C4'),
    ]});
    for (const output of [list, resolved]) {
      expect([...keys(output)].filter(key => !ALLOWED.has(key))).toEqual([]);
      const text = JSON.stringify(output);
      for (const leaked of ['A+', '91', 'SYN-OLD', 'SYN-NEW', 'SYN-RETAKE-OK', 'SYN-AREA-A', 'creditUnits']) {
        expect(text).not.toContain(leaked);
      }
    }
  });
});

describe('resolveExperienceCourseLinks', () => {
  const taken = shared([attempt('SYN-T1', 'SYN-C1')]);

  it('a confirmed link to a taken course links with the course term', () => {
    expect(resolveExperienceCourseLinks({asOf:AS_OF, access:taken, experiences:EXPERIENCES,
      links:[link('SYN-EXP-1', 'SYN-C1')]})).toEqual({
      state:'SHARED', basis:'STUDENT_SUBMITTED_TRANSCRIPT', transcriptVersion:'SYN-TRANSCRIPT-1',
      links:[{experienceId:'SYN-EXP-1', canonicalCourseId:'SYN-C1', state:'LINKED', course:'TAKEN', term:'2025-1'}],
    });
  });

  it('a suggested link never links, even to a taken course', () => {
    expect(links({access:taken, links:[link('SYN-EXP-1', 'SYN-C1', {provenance:'SUGGESTED'})]}))
      .toEqual([{experienceId:'SYN-EXP-1', canonicalCourseId:'SYN-C1', state:'NOT_LINKED', reason:'NOT_CONFIRMED'}]);
  });

  it('a confirmation after asOf did not exist yet at asOf', () => {
    expect(links({access:taken, links:[link('SYN-EXP-1', 'SYN-C1', {confirmedAt:'2026-11-05T12:00:00.001+09:00'})]})[0])
      .toMatchObject({state:'NOT_LINKED', reason:'NOT_CONFIRMED'});
  });

  it('revoking hides the link and a new grant does not bring it back', () => {
    const stored = [link('SYN-EXP-1', 'SYN-C1')];
    expect(links({access:taken, links:stored})[0]).toMatchObject({state:'LINKED'});
    expect(resolveExperienceCourseLinks({asOf:AS_OF, access:{state:'NOT_SHARED'}, experiences:EXPERIENCES, links:stored}))
      .toEqual({state:'NOT_SHARED'});
    expect(links({access:shared([attempt('SYN-T1', 'SYN-C1')], {grantVersion:'SYN-GRANT-2'}), links:stored})[0])
      .toMatchObject({state:'NOT_LINKED', reason:'STALE'});
  });

  it('editing the experience needs a new confirmation, and deleting it ends the link', () => {
    expect(links({access:taken, links:[link('SYN-EXP-1', 'SYN-C1')],
      experiences:[{experienceId:'SYN-EXP-1', contentVersion:2}]})[0]).toMatchObject({reason:'STALE'});
    expect(links({access:taken, links:[link('SYN-EXP-1', 'SYN-C1')], experiences:[]})[0])
      .toMatchObject({reason:'EXPERIENCE_NOT_FOUND'});
  });

  it('a transcript correction of that course is never followed silently', () => {
    const stored = [link('SYN-EXP-1', 'SYN-C1')];
    const corrected = (rows:readonly LedgerAttempt[]) =>
      links({access:shared(rows, {transcriptVersion:'SYN-TRANSCRIPT-2'}), links:stored})[0];
    expect(corrected([attempt('SYN-T1', 'SYN-C1', {term:'2025-2'})])).toMatchObject({reason:'STALE'});
    expect(corrected([attempt('SYN-T9', 'SYN-C9')])).toMatchObject({reason:'NOT_IN_TRANSCRIPT'});
    expect(corrected([attempt('SYN-T1', 'SYN-C1', {recognition:'EXCLUDED'})])).toMatchObject({reason:'RECOGNITION_EXCLUDED'});
    // A correction of another course does not touch this link.
    expect(corrected([attempt('SYN-T1', 'SYN-C1'), attempt('SYN-T2', 'SYN-C2', {term:'2025-2'})]))
      .toMatchObject({state:'LINKED', term:'2025-1'});
  });

  it('a course linked while in progress waits for review after the term, then links again once earned', () => {
    const stored = [link('SYN-EXP-1', 'SYN-C1', {confirmedTerm:'2026-2', confirmedAt:'2026-10-01T09:00:00.000+09:00'})];
    const during = shared([attempt('SYN-T1', 'SYN-C1', {ledger:'IN_PROGRESS', term:'2026-2'})]);
    expect(links({access:during, links:stored, asOf:'2026-10-02T09:00:00.000+09:00'})[0])
      .toMatchObject({state:'LINKED', course:'IN_PROGRESS', term:'2026-2'});
    expect(links({access:during, links:stored, asOf:'2027-02-01T09:00:00.000+09:00'})[0])
      .toMatchObject({state:'NOT_LINKED', reason:'NEEDS_REVIEW'});
    const earned = shared([attempt('SYN-T1', 'SYN-C1', {term:'2026-2'})], {transcriptVersion:'SYN-TRANSCRIPT-2'});
    expect(links({access:earned, links:stored, asOf:'2027-02-01T09:00:00.000+09:00'})[0])
      .toMatchObject({state:'LINKED', course:'TAKEN', term:'2026-2'});
  });

  it('a later approved retake needs a new confirmation instead of moving the link', () => {
    const retaken = shared([
      attempt('SYN-OLD', 'SYN-C1', {term:'2025-1'}),
      attempt('SYN-NEW', 'SYN-C1', {term:'2026-1', supersedesAttemptToken:'SYN-OLD', retakeApprovalRef:'SYN-RETAKE-OK'}),
    ], {transcriptVersion:'SYN-TRANSCRIPT-2'});
    expect(links({access:retaken, links:[link('SYN-EXP-1', 'SYN-C1')]})[0]).toMatchObject({reason:'STALE'});
  });

  it('planned, pending and held courses cannot be linked', () => {
    const access = shared([
      attempt('SYN-L', 'SYN-C1', {ledger:'PLANNED', term:'2027-1'}),
      attempt('SYN-P', 'SYN-C2', {recognition:'PENDING'}),
      attempt('SYN-H', 'SYN-C3', {term:'2026-2'}),
    ]);
    expect(links({access, links:[link('SYN-EXP-1', 'SYN-C1'), link('SYN-EXP-1', 'SYN-C2'), link('SYN-EXP-1', 'SYN-C3')]})
      .map(row => row.state === 'NOT_LINKED' ? row.reason : row.state))
      .toEqual(['PLANNED_ONLY', 'RECOGNITION_PENDING', 'NEEDS_REVIEW']);
  });

  it('results are sorted and do not depend on input order', () => {
    const rows = [attempt('SYN-T1', 'SYN-C1'), attempt('SYN-T2', 'SYN-C2'), attempt('SYN-T3', 'SYN-C3', {term:'2025-2'})];
    const stored = [link('SYN-EXP-2', 'SYN-C1'), link('SYN-EXP-1', 'SYN-C3', {confirmedTerm:'2025-2'}), link('SYN-EXP-1', 'SYN-C2')];
    const forward = resolveExperienceCourseLinks({asOf:AS_OF, access:shared(rows), experiences:EXPERIENCES, links:stored});
    const backward = resolveExperienceCourseLinks({asOf:AS_OF, access:shared([...rows].reverse()),
      experiences:[...EXPERIENCES].reverse(), links:[...stored].reverse()});
    expect(backward).toEqual(forward);
    expect(forward.state === 'SHARED' && forward.links.map(row => `${row.experienceId}/${row.canonicalCourseId}`))
      .toEqual(['SYN-EXP-1/SYN-C2', 'SYN-EXP-1/SYN-C3', 'SYN-EXP-2/SYN-C1']);
  });

  it('refuses malformed input, even when academics are not shared', () => {
    const run = (over:Partial<Parameters<typeof resolveExperienceCourseLinks>[0]>) => () => resolveExperienceCourseLinks({
      asOf:AS_OF, access:{state:'NOT_SHARED'}, experiences:EXPERIENCES, links:[], ...over,
    });
    expect(run({links:[link('SYN-EXP-1', 'SYN-C1'), link('SYN-EXP-1', 'SYN-C1')]})).toThrow(TypeError);
    expect(run({experiences:[EXPERIENCES[0]!, EXPERIENCES[0]!]})).toThrow(TypeError);
    expect(run({links:[link('SYN-EXP-1', 'SYN-C1', {provenance:'AI_APPROVED' as never})]})).toThrow(TypeError);
    expect(run({links:[link('SYN-EXP-1', 'SYN-C1', {experienceContentVersion:0})]})).toThrow(TypeError);
    expect(run({links:[link('SYN-EXP-1', 'SYN-C1', {confirmedTerm:'2025-3'})]})).toThrow(TypeError);
    expect(run({links:[link('SYN-EXP-1', 'SYN-C1', {confirmedAt:'2026-11-01T10:00:00'})]})).toThrow(TypeError);
    expect(run({asOf:'2026-11-05'})).toThrow(TypeError);
    expect(run({links:Array.from({length:1001}, (_, index) => link('SYN-EXP-1', `SYN-C${index}`))})).toThrow(RangeError);
    expect(() => describeCourseEvidence({asOf:AS_OF,
      access:shared([attempt('SYN-T1', 'SYN-C1'), attempt('SYN-T1', 'SYN-C2')])})).toThrow(TypeError);
    expect(() => describeCourseEvidence({asOf:AS_OF, access:{state:'SHARED_ALL'} as never})).toThrow(TypeError);
  });
});
