import {describe, it, expect} from 'vitest';
import {OpportunitySchema, type Opportunity} from '@hufs-one/contracts';
import {
  checkTopicCandidates, gateBySourceRevision, resolveDeadlineClaims, resultCacheKey, selectCurrentRevisions,
  type ClaimRecord, type RevisionRecord, type ResultCacheParts,
} from './index.js';
import {composeFeed} from '../opportunities/index.js';
import {composeNotices, type Notice, type NoticeStudent} from '../notices/index.js';

// Synthetic temporal scenarios only (#10 vNext / #18). No real source, student or provider output.
const ASOF = '2026-11-20T00:00:00.000Z';
type Loose<T> = {[K in keyof T]?:T[K]|undefined};
const strip = <T,>(o:Loose<T>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const D = (d:number) => new Date(Date.parse(ASOF) + d * 86_400_000).toISOString();

function rev(revisionId:string, sourceId:string, over:Loose<RevisionRecord> = {}):RevisionRecord {
  const base:RevisionRecord = {
    revisionId, sourceId, status:'ACTIVE', changeKind:'NEW', provenance:'SYNTHETIC', permissionRef:'synthetic-ref',
    publishedAt:D(-10), fetchedAt:D(-10), lastVerifiedAt:D(-9),
  };
  const out = {...base, ...strip(over)};
  for (const [k, v] of Object.entries(over)) if (v === undefined) delete (out as Record<string, unknown>)[k];
  return out;
}
function opp(id:string, revisionId:string, over:Partial<Opportunity> = {}):Opportunity {
  return OpportunitySchema.parse({
    id, version:'v1', sourceSnapshotId:revisionId, title:`가상 공고 ${id}`, organization:`시연가상기관 ${id}`,
    kind:'CONTEST', topicCodes:['DATA_ANALYTICS'], languageCodes:[], applyClosesAt:D(10), eventSessions:[],
    actualApplicationRoute:'DEMO_DISABLED', conditions:[], roleSteps:[], prioritySelection:[], completionRules:[],
    dataMode:'SYNTHETIC', dataQuality:'COMPLETE', ...over,
  });
}

describe('#10 trusted sources: only the current, verified, valid revision at asOf', () => {
  const scenarios:[string, RevisionRecord[], string|undefined, string][] = [
    ['normal active', [rev('r1', 'S')], 'r1', ''],
    ['fetched after asOf (future information)', [rev('r1', 'S', {fetchedAt:D(1), publishedAt:D(1), lastVerifiedAt:D(1)})], undefined, 'NOT_KNOWN_AT_ASOF'],
    ['published after asOf', [rev('r1', 'S', {publishedAt:D(2)})], undefined, 'FUTURE_PUBLICATION'],
    ['cancelled correction', [rev('r1', 'S'), rev('r2', 'S', {supersedes:'r1', changeKind:'CANCELLED', status:'RETRACTED'})], undefined, 'CANCELLED'],
    ['retracted', [rev('r1', 'S', {status:'RETRACTED'})], undefined, 'NOT_ACTIVE'],
    ['stale', [rev('r1', 'S', {status:'STALE'})], undefined, 'NOT_ACTIVE'],
    ['rights blocked', [rev('r1', 'S', {status:'BLOCKED_RIGHTS'})], undefined, 'NOT_ACTIVE'],
    ['unverified', [rev('r1', 'S', {lastVerifiedAt:undefined})], undefined, 'UNVERIFIED'],
    ['verified only after asOf', [rev('r1', 'S', {lastVerifiedAt:D(1)})], undefined, 'UNVERIFIED'],
    ['research only', [rev('r1', 'S', {provenance:'RESEARCH_ONLY'})], undefined, 'RESEARCH_ONLY'],
    ['not yet valid', [rev('r1', 'S', {validFrom:D(3)})], undefined, 'NOT_YET_VALID'],
    ['expired', [rev('r1', 'S', {validUntil:D(-1)})], undefined, 'EXPIRED'],
    ['extended: new revision wins', [rev('r1', 'S'), rev('r2', 'S', {supersedes:'r1', changeKind:'EXTENDED', fetchedAt:D(-2), lastVerifiedAt:D(-1)})], 'r2', ''],
    ['extension not yet known at asOf', [rev('r1', 'S'), rev('r2', 'S', {supersedes:'r1', changeKind:'EXTENDED', fetchedAt:D(2), lastVerifiedAt:D(2)})], 'r1', ''],
    ['forked chain', [rev('r1', 'S'), rev('r2', 'S', {supersedes:'r1', changeKind:'CORRECTED'}), rev('r3', 'S', {supersedes:'r1', changeKind:'CORRECTED'})], undefined, 'FORKED_CHAIN'],
  ];
  for (const [name, revisions, expected, reason] of scenarios) {
    it(name, () => {
      const s = selectCurrentRevisions(revisions, ASOF);
      expect(s.current.get('S')?.revisionId).toBe(expected);
      if (reason) expect(s.quarantined.map(q => q.reason)).toContain(reason);
    });
  }

  it('superseded revisions are quarantined so their old claims are never reused', () => {
    const s = selectCurrentRevisions([rev('r1', 'S'), rev('r2', 'S', {supersedes:'r1', changeKind:'CORRECTED'})], ASOF);
    expect(s.quarantined).toEqual([{revisionId:'r1', sourceId:'S', reason:'SUPERSEDED'}]);
  });

  it('gates feed input: cancelled/unknown revisions never reach composeFeed', () => {
    const revisions = [rev('a1', 'A'), rev('b1', 'B'), rev('b2', 'B', {supersedes:'b1', changeKind:'CANCELLED', status:'RETRACTED'})];
    const gated = gateBySourceRevision([opp('OA', 'a1'), opp('OB', 'b1'), opp('OX', 'x9')], selectCurrentRevisions(revisions, ASOF));
    expect(gated.usable.map(o => o.id)).toEqual(['OA']);
    expect(gated.quarantined).toEqual([
      {id:'OB', revisionId:'b1', reason:'SUPERSEDED'},
      {id:'OX', revisionId:'x9', reason:'UNKNOWN_REVISION'},
    ]);
    const profile = {interestTopics:['DATA_ANALYTICS' as const], desiredJobTopics:[], approvedExperienceTopics:[], approvedLanguageCodes:[], officialMajorTopics:[], facts:{}};
    expect(composeFeed(profile, gated.usable, {asOf:ASOF}).all.map(r => r.opportunity.id)).toEqual(['OA']);
  });

  it('gates notices the same way', () => {
    const student:NoticeStudent = {openRequirementIds:['REQ-1'], courseIds:[], interestTopics:[]};
    const n = (id:string, revisionId:string):Notice => ({id, sourceSnapshotId:revisionId, title:id, issuer:'시연가상학과', category:'ACADEMIC',
      requirementRefs:['REQ-1'], verificationState:'VERIFIED', evidenceRefs:[`EV-${id}`]});
    const s = selectCurrentRevisions([rev('n1', 'N'), rev('m1', 'M', {status:'RETRACTED'})], ASOF);
    const gated = gateBySourceRevision([n('KEEP', 'n1'), n('DROP', 'm1')], s);
    expect(composeNotices(student, gated.usable, {asOf:ASOF}).result.items.map(i => i.noticeId)).toEqual(['KEEP']);
  });

  it('is byte-stable for shuffled revisions', () => {
    const list = [rev('r1', 'S'), rev('r2', 'S', {supersedes:'r1', changeKind:'CORRECTED'}), rev('q1', 'Q', {status:'STALE'}), rev('p1', 'P')];
    const a = selectCurrentRevisions(list, ASOF);
    const b = selectCurrentRevisions([...list].reverse(), ASOF);
    expect(JSON.stringify(b.quarantined)).toBe(JSON.stringify(a.quarantined));
    expect([...b.current.keys()].sort()).toEqual([...a.current.keys()].sort());
  });
});

describe('#10 deadlines from verified claims only', () => {
  // Trusted paragraph of revision r2 (synthetic); span() computes exact code-point offsets of a quote.
  const text = '학생 제출 마감: 11월 27일 23:59까지, 학과 보고: 12월 3일 18:00';
  const paragraphs = [{revisionId:'r2', paragraphId:'p1', text}, {revisionId:'r1', paragraphId:'p1', text:'학생 제출 마감: 11월 22일'}];
  const span = (quote:string, rev = 'r2') => {
    const start = Array.from(text).join('').indexOf(quote);
    const s0 = Array.from(text.slice(0, start)).length;
    return {kind:'TEXT' as const, sourceRevisionId:rev, paragraphId:'p1', startCodePoint:s0, endCodePoint:s0 + Array.from(quote).length, quote};
  };
  const STUDENT = span('11월 27일 23:59');
  const ADMIN = span('12월 3일 18:00');
  const opts = {currentRevisionId:'r2', asOf:ASOF, paragraphs};
  const claim = (claimId:string, over:Loose<ClaimRecord>):ClaimRecord => {
    const out:ClaimRecord = {
      claimId, sourceRevisionId:'r2', field:'studentDeadline', value:'2026-11-27T23:59:59+09:00', state:'VERIFIED', dateKind:'STUDENT',
      reviewerId:'reviewer-01', claimCheckedAt:D(-2), evidence:[STUDENT], ...strip(over),
    };
    for (const [k, v] of Object.entries(over)) if (v === undefined) delete (out as unknown as Record<string, unknown>)[k];
    return out;
  };

  it('uses claims VERIFIED by a reviewer at or before asOf, on the current revision, with exact evidence', () => {
    const r = resolveDeadlineClaims([
      claim('c1', {}),
      claim('c2', {field:'adminReportDeadline', dateKind:'ADMIN', value:'2026-12-03T18:00:00+09:00', evidence:[ADMIN]}),
    ], opts);
    expect(r.dates).toEqual({studentDeadline:'2026-11-27T14:59:59.000Z', adminReportDeadline:'2026-12-03T09:00:00.000Z'});
    expect(r.ignored).toEqual([]);
  });

  it('no backward leak: a verification finished on 12/01 is not used for an 11/20 view (PR #40 review)', () => {
    const late = claim('late', {claimCheckedAt:'2026-12-01T00:00:00.000Z'});
    expect(resolveDeadlineClaims([late], opts)).toMatchObject({dates:{}, ignored:[{claimId:'late', reason:'CHECKED_AFTER_ASOF'}]});
    expect(resolveDeadlineClaims([late], {...opts, asOf:'2026-12-01T00:00:00.000Z'}).dates.studentDeadline).toBe('2026-11-27T14:59:59.000Z');
  });

  it('rejects missing or malformed verification time / reviewer', () => {
    const r = resolveDeadlineClaims([
      claim('no-time', {claimCheckedAt:undefined}),
      claim('bad-time', {claimCheckedAt:'어제'}),
      claim('no-reviewer', {reviewerId:undefined}),
      claim('blank-reviewer', {reviewerId:' '}),
    ], opts);
    expect(r.dates).toEqual({});
    expect(r.ignored).toEqual([
      {claimId:'bad-time', reason:'BAD_CHECK_TIME'},
      {claimId:'blank-reviewer', reason:'NO_REVIEWER'},
      {claimId:'no-reviewer', reason:'NO_REVIEWER'},
      {claimId:'no-time', reason:'BAD_CHECK_TIME'},
    ]);
  });

  it('re-checks evidence: exact quote of the current revision only; IMAGE spans are not trusted by the core', () => {
    const r = resolveDeadlineClaims([
      claim('none', {evidence:[]}),
      claim('wrong-quote', {evidence:[{...STUDENT, quote:'11월 28일 23:59'}]}),
      claim('shifted', {evidence:[{...STUDENT, startCodePoint:STUDENT.startCodePoint + 1, endCodePoint:STUDENT.endCodePoint + 1}]}),
      claim('old-span', {evidence:[span('11월 27일 23:59', 'r1')]}),
      claim('image', {evidence:[{kind:'IMAGE', sourceRevisionId:'r2'}]}),
    ], opts);
    expect(r.dates).toEqual({});
    expect(r.ignored.map(x => [x.claimId, x.reason])).toEqual([
      ['image', 'UNVERIFIABLE_EVIDENCE'], ['none', 'NO_EVIDENCE'], ['old-span', 'OTHER_REVISION'],
      ['shifted', 'EVIDENCE_MISMATCH'], ['wrong-quote', 'EVIDENCE_MISMATCH'],
    ]);
  });

  it('ignores candidates, old revisions, wrong kinds (event/admin as student) and vague text', () => {
    const r = resolveDeadlineClaims([
      claim('cand', {state:'CANDIDATE'}),
      claim('old', {sourceRevisionId:'r1'}),
      claim('event', {dateKind:'EVENT'}),
      claim('admin-as-student', {dateKind:'ADMIN'}),
      claim('vague', {value:'다음 주'}),
      claim('unrelated', {field:'organizer', dateKind:undefined, value:'시연가상기관'}),
    ], opts);
    expect(r.dates).toEqual({});
    expect(r.ignored.map(x => [x.claimId, x.reason])).toEqual([
      ['admin-as-student', 'WRONG_DATE_KIND'], ['cand', 'NOT_VERIFIED'], ['event', 'WRONG_DATE_KIND'], ['old', 'OTHER_REVISION'], ['vague', 'BAD_VALUE'],
    ]);
  });

  it('extension: the new revision deadline replaces the old one; conflicting verified values stay unset', () => {
    expect(resolveDeadlineClaims([claim('old', {sourceRevisionId:'r1', value:'2026-11-22T23:59:59+09:00'}), claim('new', {})], opts).dates.studentDeadline)
      .toBe('2026-11-27T14:59:59.000Z');
    const conflict = resolveDeadlineClaims([claim('a', {}), claim('b', {value:'2026-11-29T23:59:59+09:00'})], opts);
    expect(conflict).toMatchObject({dates:{}, conflicts:['studentDeadline']});
  });

  it('is byte-stable for reversed input and rejects an invalid asOf', () => {
    const list = [claim('late', {claimCheckedAt:'2026-12-01T00:00:00.000Z'}), claim('ok', {}), claim('cand', {state:'CANDIDATE'})];
    expect(JSON.stringify(resolveDeadlineClaims([...list].reverse(), opts))).toBe(JSON.stringify(resolveDeadlineClaims(list, opts)));
    expect(() => resolveDeadlineClaims(list, {...opts, asOf:'now'})).toThrow(RangeError);
  });
});

describe('#10 AI topic candidates are re-checked by code', () => {
  const paragraphs = [{id:'p1', text:'데이터 분석 경험이 있는 재학생을 우대합니다.'}];
  it('accepts only enum + allowed + literal quote in the trusted paragraph', () => {
    const r = checkTopicCandidates([
      {code:'DATA_ANALYTICS', paragraphId:'p1', quote:'데이터 분석 경험'},
      {code:'AI_ML', paragraphId:'p1', quote:'데이터 분석'},
      {code:'PREDICTED_SKILL', paragraphId:'p1', quote:'재학생'},
      {code:'DATA_ANALYTICS', paragraphId:'p1', quote:'파이썬 필수'},
      {code:'DATA_ANALYTICS', paragraphId:'p9', quote:'데이터 분석'},
    ], ['DATA_ANALYTICS', 'SOFTWARE_DEV'], paragraphs);
    expect(r.accepted).toEqual(['DATA_ANALYTICS']);
    expect(r.rejected.map(x => x.reason)).toEqual(['NOT_ALLOWED', 'NOT_IN_ENUM', 'QUOTE_NOT_IN_SOURCE', 'QUOTE_NOT_IN_SOURCE']);
  });
});

describe('#10 cache keys: version change invalidates, students never share', () => {
  const base:ResultCacheParts = {
    kind:'FEED', asOf:ASOF, profile:'P1', projection:'S01-PR1', consent:'C1', overlay:'OV1', topics:'topics-v1',
    rankConfig:'rank-v1.0', sourceRevisionIds:['r2', 'a1'], claimVersion:'cl-1', retrievalConfigVersion:'keyword-v1', academics:'none',
  };
  it('is order-independent and changes with every dependency', () => {
    const k = resultCacheKey(base);
    expect(resultCacheKey({...base, sourceRevisionIds:['a1', 'r2', 'a1']})).toBe(k);
    for (const change of [
      {sourceRevisionIds:['r3', 'a1']}, {claimVersion:'cl-2'}, {retrievalConfigVersion:'keyword-v2'},
      {projection:'S02-PR1'}, {rankConfig:'rank-v1.1'}, {asOf:D(1)}, {kind:'NOTICES' as const},
    ]) expect(resultCacheKey({...base, ...change})).not.toBe(k);
  });
  it('refuses a missing version instead of sharing an entry', () => {
    expect(() => resultCacheKey({...base, projection:''})).toThrow(RangeError);
    expect(() => resultCacheKey({...base, claimVersion:'a|b'})).toThrow(RangeError);
  });
});
