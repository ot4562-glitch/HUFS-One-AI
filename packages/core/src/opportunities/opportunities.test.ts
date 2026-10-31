import {describe, it, expect} from 'vitest';
import {FeedResultSchema, OpportunitySchema, type Opportunity} from '@hufs-one/contracts';
import {
  composeFeed, coverage, evaluateCondition, evaluateOpportunity, rankOpportunities, scoreOpportunity,
  type RecommendationProfile,
  RANK_CONFIG_V1, RANK_CONFIG_V1_1, explainRecommendation,
} from './index.js';

// All data below is synthetic (A12.2 style: fictional organizations, demo-disabled routes).
const ASOF = '2026-11-20T00:00:00.000Z';

function opp(id:string, over:Partial<Opportunity> = {}):Opportunity {
  return OpportunitySchema.parse({
    id, version:'v1', sourceSnapshotId:`SNAP-${id}`,
    title:`가상 공고 ${id}`, organization:`시연가상기관 ${id}`,
    kind:'CONTEST', topicCodes:['DATA_ANALYTICS'], languageCodes:[],
    applyClosesAt:'2026-12-01T00:00:00.000Z', eventSessions:[],
    actualApplicationRoute:'DEMO_DISABLED', conditions:[],
    roleSteps:[], prioritySelection:[], completionRules:[],
    dataMode:'SYNTHETIC', dataQuality:'COMPLETE',
    ...over,
  });
}

function profile(over:Partial<RecommendationProfile> = {}):RecommendationProfile {
  return {
    interestTopics:[], desiredJobTopics:[], approvedExperienceTopics:[],
    approvedLanguageCodes:[], officialMajorTopics:[], facts:{},
    ...over,
  };
}

const dataStudent = profile({desiredJobTopics:['DATA_ANALYTICS'], interestTopics:['AI_ML'], facts:{enrollment:'ENROLLED'}});
const enrolledOnly = {field:'enrollment', operator:'EQ', value:'ENROLLED', evidenceId:'EV-ENR'} as const;

describe('TASK-06 score v1.0 (A05.2) — hand-calculated', () => {
  it('coverage follows min(1,|U∩O|/max(1,min(2,|U|))) and is 0 for empty U', () => {
    expect(coverage([], ['AI_ML'])).toBe(0);
    expect(coverage(['AI_ML'], ['AI_ML'])).toBe(1);
    expect(coverage(['AI_ML', 'SOFTWARE_DEV', 'DATA_ANALYTICS'], ['AI_ML'])).toBe(0.5);
    expect(coverage(['AI_ML', 'SOFTWARE_DEV'], ['AI_ML', 'SOFTWARE_DEV', 'CLOUD_INFRA'])).toBe(1);
  });

  it('35J + 25I + 15S + 10L + 5M + 10F', () => {
    // J=1, I=0.5, S=0, L=1, M=0, F=1-15/30=0.5 → 35 + 12.5 + 0 + 10 + 0 + 5 = 62.5
    const p = profile({desiredJobTopics:['DATA_ANALYTICS'], interestTopics:['AI_ML', 'SOFTWARE_DEV'], approvedLanguageCodes:['en']});
    const o = opp('A', {topicCodes:['DATA_ANALYTICS', 'AI_ML'], languageCodes:['EN']});
    const {score, matched} = scoreOpportunity(p, o, {asOf:ASOF, publishedAtBySnapshotId:{'SNAP-A':'2026-11-05T00:00:00.000Z'}});
    expect(score).toEqual({J:1, I:0.5, S:0, L:1, M:0, F:0.5, total:62.5});
    expect(matched).toEqual({job:['DATA_ANALYTICS'], interest:['AI_ML'], experience:[]});
  });

  it('a publication time after asOf gives F=0 and is flagged, not rewarded', () => {
    const r = scoreOpportunity(profile(), opp('A'), {asOf:ASOF, publishedAtBySnapshotId:{'SNAP-A':'2026-12-01T00:00:00.000Z'}});
    expect(r.score.F).toBe(0);
    expect(r.futurePublication).toBe(true);
  });

  it('ties: score desc → confirmed deadline asc (unknown last) → id', () => {
    const items = [
      opp('C', {applyClosesAt:'2026-11-25T00:00:00.000Z'}),
      opp('B'),
      opp('A', {actualApplicationRoute:'RECORD_ONLY'}), // internal deadline is not a recruitment deadline
      opp('D', {applyClosesAt:'2026-11-25T00:00:00.000Z'}),
    ];
    expect(rankOpportunities(dataStudent, items, {asOf:ASOF}).map(r => r.opportunity.id)).toEqual(['C', 'D', 'B', 'A']);
  });
});

describe('TASK-06 eligibility ≠ relevance (A05.1)', () => {
  it('missing student fact → UNKNOWN, never assumed ELIGIBLE', () => {
    const o = opp('A', {conditions:[{field:'campus', operator:'EQ', value:'SEOUL', evidenceId:'EV-CAMPUS'}]});
    const e = evaluateOpportunity(dataStudent, o, ASOF);
    expect(e.eligibility).toBe('UNKNOWN');
    expect(e.evidenceRefs).toEqual(['EV-CAMPUS']);
  });

  it('any failed condition → INELIGIBLE; all passed on COMPLETE data → ELIGIBLE', () => {
    expect(evaluateOpportunity(dataStudent, opp('A', {conditions:[enrolledOnly]}), ASOF).eligibility).toBe('ELIGIBLE');
    const leave = profile({facts:{enrollment:'LEAVE'}});
    expect(evaluateOpportunity(leave, opp('A', {conditions:[enrolledOnly]}), ASOF).eligibility).toBe('INELIGIBLE');
  });

  it('CONFLICT source (e.g. "전체" vs "재학생 팀장") stays UNKNOWN + needsReview, never the lenient reading', () => {
    const e = evaluateOpportunity(dataStudent, opp('A', {dataQuality:'CONFLICT', conditions:[enrolledOnly]}), ASOF);
    expect(e).toMatchObject({eligibility:'UNKNOWN', needsReview:true});
  });

  it('PARTIAL / STALE data never yields ELIGIBLE', () => {
    for (const dataQuality of ['PARTIAL', 'STALE'] as const) {
      expect(evaluateOpportunity(dataStudent, opp('A', {dataQuality, conditions:[enrolledOnly]}), ASOF).eligibility).toBe('UNKNOWN');
    }
  });

  it('priority selection and completion rules are not application requirements', () => {
    const o = opp('A', {conditions:[enrolledOnly], prioritySelection:['클라우드 자격 보유자 우선'], completionRules:['80% 출석 시 수료']});
    expect(evaluateOpportunity(dataStudent, o, ASOF).eligibility).toBe('ELIGIBLE');
  });

  it('operator matrix fails closed on type mismatch', () => {
    const facts = {cohort:2023, major:['ENGLISH', 'STATS'], certification:[] as string[], teamRole:'LEADER'};
    const c = (field:any, operator:any, value:any) => evaluateCondition({field, operator, value, evidenceId:'E'}, facts);
    expect(c('cohort', 'GTE', 2022)).toBe('PASS');
    expect(c('cohort', 'LTE', 2022)).toBe('FAIL');
    expect(c('cohort', 'GTE', '2022')).toBe('UNKNOWN');
    expect(c('major', 'IN', ['STATS'])).toBe('PASS');
    expect(c('major', 'NOT_IN', ['STATS'])).toBe('FAIL');
    expect(c('major', 'EQ', 'ENGLISH')).toBe('PASS');
    expect(c('teamRole', 'IN', ['LEADER', 'MEMBER'])).toBe('PASS');
    expect(c('certification', 'EXISTS', true)).toBe('FAIL');
    expect(c('certification', 'IN', ['TOEIC'])).toBe('UNKNOWN'); // empty list is not evidence of absence
    expect(c('degree', 'EQ', 'BACHELOR')).toBe('UNKNOWN');
    expect(c('teamRole', 'EQ', true)).toBe('UNKNOWN');
  });
});

describe('TASK-06 lifecycle and dates', () => {
  it('event sessions are never used as the apply deadline', () => {
    const o = opp('A', {applyClosesAt:undefined, eventSessions:[{start:'2026-11-01T00:00:00.000Z', end:'2026-11-02T00:00:00.000Z'}]});
    const e = evaluateOpportunity(dataStudent, o, ASOF);
    expect(e.lifecycle).toBe('UNKNOWN');
    expect(e.deadline).toBeUndefined();
  });

  it('closed / upcoming / open from confirmed apply dates only', () => {
    expect(evaluateOpportunity(dataStudent, opp('A', {applyClosesAt:'2026-11-19T00:00:00.000Z'}), ASOF).lifecycle).toBe('CLOSED');
    expect(evaluateOpportunity(dataStudent, opp('A', {applyOpensAt:'2026-11-21T00:00:00.000Z'}), ASOF).lifecycle).toBe('UPCOMING');
    expect(evaluateOpportunity(dataStudent, opp('A'), ASOF).lifecycle).toBe('OPEN');
  });

  it('rejects a missing/invalid asOf instead of reading the clock', () => {
    expect(() => rankOpportunities(dataStudent, [opp('A')], {asOf:'not-a-date'})).toThrow(RangeError);
  });
});

describe('TASK-06 composeFeed (A05.2 steps 1, 7–9)', () => {
  const corpus = [
    opp('R1', {topicCodes:['DATA_ANALYTICS'], organization:'시연가상기관 X', applyClosesAt:'2026-11-22T00:00:00.000Z'}),
    opp('R2', {topicCodes:['DATA_ANALYTICS'], organization:'시연가상기관 X', applyClosesAt:'2026-11-23T00:00:00.000Z'}),
    opp('R3', {topicCodes:['DATA_ANALYTICS'], organization:'시연가상기관 X', applyClosesAt:'2026-11-24T00:00:00.000Z'}),
    opp('R4', {topicCodes:['AI_ML'], kind:'INTERNSHIP'}),
    opp('UNK', {topicCodes:['DATA_ANALYTICS'], conditions:[{field:'campus', operator:'EQ', value:'GLOBAL', evidenceId:'EV-C'}]}),
    opp('INEL', {topicCodes:['DATA_ANALYTICS'], conditions:[{...enrolledOnly, value:'GRADUATED'}]}),
    opp('CLOSED', {topicCodes:['DATA_ANALYTICS'], applyClosesAt:'2026-11-01T00:00:00.000Z'}),
    opp('CONF', {topicCodes:['DATA_ANALYTICS'], dataQuality:'CONFLICT'}),
    ...['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map(id => opp(id, {topicCodes:['CULTURE_TOURISM']})),
  ];
  // v1.0 behaviour (kind+organization cap only) stays covered; v1.1 topic diversity is tested below.
  const opts = {asOf:ASOF, config:RANK_CONFIG_V1};

  it('produces a schema-valid FeedResult with ≤3 large and ≤6 compact, no duplicates', () => {
    const {feed} = composeFeed(dataStudent, corpus, opts);
    expect(FeedResultSchema.safeParse(feed).success).toBe(true);
    expect(feed.featured).toHaveLength(3);
    expect(feed.compact).toHaveLength(6);
    expect(feed.totalCandidates).toBe(12); // 14 − INEL − CLOSED
    expect(feed.hasMore).toBe(true);
  });

  it('caps the same kind+organization at 2 large cards and lets another group take the slot', () => {
    const {feed} = composeFeed(dataStudent, corpus, opts);
    expect(feed.featured.map(c => c.opportunityId)).toEqual(['R1', 'R2', 'UNK']);
  });

  it('keeps UNKNOWN visible with its badge, separates INELIGIBLE and CLOSED, and never features CONFLICT', () => {
    const r = composeFeed(dataStudent, corpus, opts);
    expect(r.feed.featured.find(c => c.opportunityId === 'UNK')?.eligibility).toBe('UNKNOWN');
    expect(r.ineligible.map(x => x.opportunity.id)).toEqual(['INEL']);
    expect(r.closed.map(x => x.opportunity.id)).toEqual(['CLOSED']);
    const shown = [...r.feed.featured, ...r.feed.compact].map(c => c.opportunityId);
    expect(shown).not.toContain('INEL');
    expect(shown).not.toContain('CLOSED');
    expect(r.feed.featured.map(c => c.opportunityId)).not.toContain('CONF');
  });

  it('keeps the full visible list so compact display never removes access', () => {
    const r = composeFeed(dataStudent, corpus, opts);
    expect(r.all).toHaveLength(r.feed.totalCandidates);
    expect(new Set(r.all.map(x => x.opportunity.id)).size).toBe(r.all.length);
  });

  it('does not create personal cards from freshness alone when the student gave no topics', () => {
    const fresh = {asOf:ASOF, publishedAtBySnapshotId:{'SNAP-G6':'2026-11-19T00:00:00.000Z', 'SNAP-G1':'2026-11-10T00:00:00.000Z'}};
    const {feed} = composeFeed(profile(), corpus, fresh);
    expect(feed.featured).toEqual([]);
    expect(feed.compact.slice(0, 2).map(c => c.opportunityId)).toEqual(['G6', 'G1']);
  });

  it('shrinks the large cards instead of relaxing rules when relevant items are few', () => {
    const {feed} = composeFeed(profile({interestTopics:['AI_ML']}), corpus, opts);
    expect(feed.featured.map(c => c.opportunityId)).toEqual(['R4']);
  });

  it('is byte-stable for the same input regardless of input order', () => {
    const a = JSON.stringify(composeFeed(dataStudent, corpus, opts).feed);
    const b = JSON.stringify(composeFeed(dataStudent, [...corpus].reverse(), opts).feed);
    expect(b).toBe(a);
  });

  it('two students with identical inputs get identical feeds (no per-person hard-coding)', () => {
    const twin = structuredClone(dataStudent);
    expect(composeFeed(twin, corpus, opts).feed).toEqual(composeFeed(dataStudent, corpus, opts).feed);
  });

  it('removes overlay-hidden items from every list and the count', () => {
    const r = composeFeed(dataStudent, corpus, {...opts, hiddenOpportunityIds:['R1']});
    expect(r.all.map(x => x.opportunity.id)).not.toContain('R1');
    expect(r.feed.totalCandidates).toBe(11);
  });

  it('ignores topic codes outside the closed 24-code enum', () => {
    const untyped = {...dataStudent, interestTopics:['PREDICTED_SKILL' as any]};
    const r = rankOpportunities(untyped, [opp('A', {topicCodes:['DATA_ANALYTICS']})], opts);
    expect(r[0]?.score.I).toBe(0);
  });
});

describe('TASK-06 no time leakage: publishedAt > asOf (review on PR #15)', () => {
  // Exactly matching topic, COMPLETE, valid deadline — only the publication time is in the future.
  const future = opp('FUT', {topicCodes:['DATA_ANALYTICS'], conditions:[enrolledOnly]});
  const past = opp('PAST', {topicCodes:['DATA_ANALYTICS'], conditions:[enrolledOnly]});
  const unknownTime = opp('NOTIME', {topicCodes:['DATA_ANALYTICS'], conditions:[enrolledOnly]});
  const published = {'SNAP-FUT':'2026-12-01T00:00:00.000Z', 'SNAP-PAST':'2026-11-10T00:00:00.000Z'};
  const opts = {asOf:ASOF, publishedAtBySnapshotId:published};

  it('keeps a future-published item out of featured, compact and all, and queues it for review', () => {
    const r = composeFeed(dataStudent, [future, past, unknownTime], opts);
    const shown = [...r.feed.featured, ...r.feed.compact].map(c => c.opportunityId);
    expect(shown).not.toContain('FUT');
    expect(r.all.map(x => x.opportunity.id)).not.toContain('FUT');
    expect(r.excludedFuture.map(x => x.opportunity.id)).toEqual(['FUT']);
    expect(r.feed.totalCandidates).toBe(2);
  });

  it('shows confirmed-past items normally and keeps unknown-time items as UNKNOWN with F=0', () => {
    const r = composeFeed(dataStudent, [future, past, unknownTime], opts);
    expect(r.feed.featured.map(c => c.opportunityId)).toEqual(['PAST', 'NOTIME']);
    const byId = new Map(r.all.map(x => [x.opportunity.id, x]));
    expect(byId.get('PAST')?.publication).toBe('CONFIRMED');
    expect(byId.get('NOTIME')).toMatchObject({publication:'UNKNOWN', score:{F:0}});
  });

  it('a future item is excluded even when it would otherwise rank first', () => {
    const r = composeFeed(dataStudent, [future], opts);
    expect(r.feed).toMatchObject({featured:[], compact:[], totalCandidates:0, hasMore:false});
  });

  it('is byte-stable for reversed input including the excluded queue', () => {
    const a = composeFeed(dataStudent, [future, past, unknownTime], opts);
    const b = composeFeed(dataStudent, [unknownTime, past, future], opts);
    expect(JSON.stringify(b.feed)).toBe(JSON.stringify(a.feed));
    expect(b.excludedFuture.map(x => x.opportunity.id)).toEqual(a.excludedFuture.map(x => x.opportunity.id));
  });
});

describe('TASK-06 v1.1 topic diversity in large cards', () => {
  const corpus = [
    opp('D1', {topicCodes:['DATA_ANALYTICS'], organization:'시연가상기관 X', applyClosesAt:'2026-11-22T00:00:00.000Z'}),
    opp('D2', {topicCodes:['DATA_ANALYTICS'], organization:'시연가상기관 Y', applyClosesAt:'2026-11-23T00:00:00.000Z'}),
    opp('D3', {topicCodes:['DATA_ANALYTICS'], organization:'시연가상기관 Z', applyClosesAt:'2026-11-24T00:00:00.000Z'}),
    opp('A1', {topicCodes:['AI_ML'], kind:'INTERNSHIP'}),
  ];

  it('covers a second student topic before repeating the first one (cards stay in rank order)', () => {
    expect(composeFeed(dataStudent, corpus, {asOf:ASOF, config:RANK_CONFIG_V1}).feed.featured.map(c => c.opportunityId)).toEqual(['D1', 'D2', 'D3']);
    const r = composeFeed(dataStudent, corpus, {asOf:ASOF, config:RANK_CONFIG_V1_1});
    expect(r.feed.featured.map(c => c.opportunityId)).toEqual(['D1', 'D2', 'A1']);
    expect(r.rankConfigVersion).toBe('rank-v1.1');
  });

  it('never drops cards or relaxes rules when only one topic matches', () => {
    const single = profile({interestTopics:['DATA_ANALYTICS']});
    expect(composeFeed(single, corpus, {asOf:ASOF}).feed.featured.map(c => c.opportunityId)).toEqual(['D1', 'D2', 'D3']);
    expect(composeFeed(profile({interestTopics:['AI_ML']}), corpus, {asOf:ASOF}).feed.featured.map(c => c.opportunityId)).toEqual(['A1']);
  });

  it('is byte-stable for reversed input', () => {
    const a = JSON.stringify(composeFeed(dataStudent, corpus, {asOf:ASOF}).feed);
    expect(JSON.stringify(composeFeed(dataStudent, [...corpus].reverse(), {asOf:ASOF}).feed)).toBe(a);
  });
});

describe('TASK-06 recommendation reasons and relevance score (code-built, no AI)', () => {
  const asOf = {asOf:ASOF, publishedAtBySnapshotId:{'SNAP-A':'2026-11-15T00:00:00.000Z'}};
  const student = profile({desiredJobTopics:['DATA_ANALYTICS'], interestTopics:['AI_ML', 'SOFTWARE_DEV'], approvedExperienceTopics:['DATA_ANALYTICS'], approvedLanguageCodes:['en']});
  const explainOne = (o:Opportunity, p = student, opts:Parameters<typeof rankOpportunities>[2] = asOf) =>
    explainRecommendation(rankOpportunities(p, [o], opts)[0]!);

  it('gives a 0–100 score with a breakdown that sums to it, a level label and a disclaimer', () => {
    // J=1 → 35, I=0.5 → 12.5, S=1 → 15, L=1 → 10, M=0, F=1-5/30 → 8.3 → total 80.8 → 81
    const e = explainOne(opp('A', {topicCodes:['DATA_ANALYTICS', 'AI_ML'], languageCodes:['en']}));
    expect(e.relevance).toMatchObject({score:81, level:'HIGH', label:'관련 높음'});
    expect(e.relevance.breakdown.map(p => [p.key, p.points, p.max])).toEqual([['J', 35, 35], ['I', 12.5, 25], ['S', 15, 15], ['L', 10, 10], ['M', 0, 5], ['F', 8.3, 10]]);
    expect(e.relevance.disclaimer).toContain('합격이나 취업 가능성이 아니에요');
    expect(e.provenance).toBe('CODE_RULES');
  });

  it('builds reason lines only from actually matched topics, in Korean labels', () => {
    const e = explainOne(opp('A', {topicCodes:['DATA_ANALYTICS', 'AI_ML'], languageCodes:['en']}));
    expect(e.reasons.map(r => r.text)).toEqual([
      '희망 직무 ‘데이터 분석’과 일치해요.',
      '관심 분야 ‘AI·머신러닝’과 일치해요.',
      '승인한 경험의 주제 ‘데이터 분석’과 관련 있어요.',
      '공고의 사용 언어가 내가 등록한 언어와 맞아요(어학 자격 인정은 아님).',
      '최근 15일 안에 게시됐어요.',
    ]);
  });

  it('uses 와 after a vowel ending (e.g. 해외영업 → 과, 프로덕트·UX → 와)', () => {
    const p = profile({interestTopics:['PRODUCT_UX', 'GLOBAL_SALES']});
    expect(explainOne(opp('A', {topicCodes:['PRODUCT_UX']}), p).reasons[0]?.text).toBe('관심 분야 ‘프로덕트·UX’와 일치해요.');
    expect(explainOne(opp('A', {topicCodes:['GLOBAL_SALES']}), p).reasons[0]?.text).toBe('관심 분야 ‘해외영업’과 일치해요.');
    expect(explainOne(opp('A', {topicCodes:['CULTURE_TOURISM']}), profile({interestTopics:['CULTURE_TOURISM']})).reasons[0]?.text).toBe('관심 분야 ‘문화·관광’과 일치해요.');
  });

  it('marks a non-matching item as a general notice even if it is fresh (no fake personalisation)', () => {
    const e = explainOne(opp('A', {topicCodes:['CULTURE_TOURISM']}));
    expect(e.relevance).toMatchObject({level:'GENERAL', label:'일반 공고'});
    expect(e.reasons[0]?.code).toBe('NO_PERSONAL_MATCH');
  });

  it('explains UNKNOWN / INELIGIBLE / CONFLICT eligibility with the field names', () => {
    const campus = {field:'campus', operator:'EQ', value:'SEOUL', evidenceId:'EV-C'} as const;
    expect(explainOne(opp('A', {conditions:[campus]})).eligibility).toEqual({state:'UNKNOWN', fields:['campus'], evidenceRefs:['EV-C'], text:'캠퍼스 정보가 없어 지원 가능 여부를 확인해야 해요.'});
    const leave = profile({...student, facts:{enrollment:'LEAVE'}});
    expect(explainOne(opp('A', {conditions:[enrolledOnly]}), leave).eligibility.text).toBe('지원 조건(학적)이 맞지 않아요.');
    expect(explainOne(opp('A', {dataQuality:'CONFLICT'})).eligibility.text).toBe('공고 안의 조건이 서로 달라 확인이 필요해요.');
    expect(explainOne(opp('A')).eligibility).toMatchObject({state:'ELIGIBLE', text:'공고에 별도 지원 조건이 없어요.'});
  });

  it('deadline notes: confirmed (Seoul time), event-only (HUFSAbility 대외활동), record-only, unknown', () => {
    expect(explainOne(opp('A', {applyClosesAt:'2026-11-27T14:59:00.000Z'})).deadline).toEqual({kind:'CONFIRMED', iso:'2026-11-27T14:59:00.000Z', text:'11월 27일 23:59까지 신청'});
    const eventOnly = opp('A', {applyClosesAt:undefined as never, eventSessions:[{start:'2026-12-01T00:00:00.000Z', end:'2026-12-02T00:00:00.000Z'}]});
    expect(explainOne(eventOnly).deadline.kind).toBe('EVENT_ONLY');
    expect(explainOne(opp('A', {actualApplicationRoute:'RECORD_ONLY'})).deadline.kind).toBe('RECORD_ONLY');
    expect(explainOne(opp('A', {applyClosesAt:undefined as never})).deadline.kind).toBe('UNKNOWN');
  });

  it('composeFeed returns one explanation per shown card in display order', () => {
    const items = [opp('A', {topicCodes:['DATA_ANALYTICS']}), opp('B', {topicCodes:['CULTURE_TOURISM']})];
    const r = composeFeed(student, items, {asOf:ASOF});
    expect(r.explanations.map(e => e.opportunityId)).toEqual([...r.feed.featured, ...r.feed.compact].map(c => c.opportunityId));
    expect(r.explanations.every(e => e.relevance.score === Math.round(r.all.find(x => x.opportunity.id === e.opportunityId)!.score.total))).toBe(true);
  });
});
