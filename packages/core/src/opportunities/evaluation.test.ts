import {describe, it, expect} from 'vitest';
import {OpportunitySchema, type Opportunity} from '@hufs-one/contracts';
import {compareRankers, eligibilityAgreement, ndcgAtK, precisionAtK, type RecommendationProfile} from './index.js';

// Synthetic only: fictional organizations, hand-made labels (A15.1 shape, not real evaluation data).
const ASOF = '2026-11-20T00:00:00.000Z';
function opp(id:string, topicCodes:Opportunity['topicCodes']):Opportunity {
  return OpportunitySchema.parse({
    id, version:'v1', sourceSnapshotId:`SNAP-${id}`, title:`가상 공고 ${id}`, organization:`시연가상기관 ${id}`,
    kind:'CONTEST', topicCodes, languageCodes:[], applyClosesAt:'2026-12-01T00:00:00.000Z', eventSessions:[],
    actualApplicationRoute:'DEMO_DISABLED', conditions:[], roleSteps:[], prioritySelection:[], completionRules:[],
    dataMode:'SYNTHETIC', dataQuality:'COMPLETE',
  });
}
const profile = (over:Partial<RecommendationProfile>):RecommendationProfile => ({
  interestTopics:[], desiredJobTopics:[], approvedExperienceTopics:[], approvedLanguageCodes:[], officialMajorTopics:[], facts:{}, ...over,
});

describe('A15.1 P@k and nDCG@k (hand-calculated)', () => {
  it('P@3 counts rel ≥ 1, reports coverage, and uses the actual k when fewer candidates exist', () => {
    expect(precisionAtK(['a', 'b', 'c', 'd'], {a:2, b:0, c:1}, 3)).toEqual({
      k:3, actualK:3, precision:{num:2, den:3, value:0.666667}, coverage:{num:3, den:3, value:1},
    });
    expect(precisionAtK(['a', 'x'], {a:1}, 3)).toMatchObject({actualK:2, precision:{num:1, den:2}, coverage:{num:1, den:2}});
    expect(precisionAtK(['a', 'c'], {a:2, c:1}, 3, 2).precision).toMatchObject({num:1, den:2});
    expect(precisionAtK([], {}, 3).precision).toEqual({num:0, den:0, value:0});
  });

  it('nDCG@3 uses 2^rel−1 gains and the ideal order of the same candidate list', () => {
    // candidates a,b,c,d. DCG = 3/1 + 0 + 1/2 = 3.5; IDCG = 3 + 3/log2(3) + 1/2 = 5.39279 → 0.649015
    expect(ndcgAtK(['a', 'b', 'c', 'd'], {a:2, b:0, c:1, d:2}, 3)).toBe(0.649015);
    expect(ndcgAtK(['a', 'd', 'c', 'b'], {a:2, b:0, c:1, d:2}, 3)).toBe(1);
    expect(ndcgAtK(['a'], {a:0}, 3)).toBe(0);
  });

  it('labels outside the evaluable candidates never lower nDCG (PR #48 review #1)', () => {
    expect(ndcgAtK(['A'], {A:2, HIDDEN:2}, 2)).toBe(1);
    expect(ndcgAtK(['A', 'B'], {A:2, B:0, FUTURE:2, INELIGIBLE:2}, 3)).toBe(1);
  });

  it('rejects an invalid k', () => {
    expect(() => precisionAtK(['a'], {}, 0)).toThrow(RangeError);
    expect(() => ndcgAtK(['a'], {}, 1.5)).toThrow(RangeError);
  });
});

describe('A15.1 eligibility agreement (조건 precision/recall, 중대한 허위 적격)', () => {
  it('counts false eligible as the critical class and skips gold UNKNOWN in precision/recall', () => {
    const r = eligibilityAgreement(
      {a:'ELIGIBLE', b:'INELIGIBLE', c:'INELIGIBLE', d:'UNKNOWN', e:'ELIGIBLE', f:'INELIGIBLE'},
      {a:'INELIGIBLE', b:'INELIGIBLE', c:'ELIGIBLE', d:'INELIGIBLE', e:'ELIGIBLE', f:'UNKNOWN', g:'ELIGIBLE'},
    );
    expect(r.falseEligible).toEqual(['a']);
    expect(r.falseIneligible).toEqual(['c']);
    expect(r.unknown).toEqual(['d']);
    expect(r.conditionPrecision).toMatchObject({num:1, den:2}); // b correct, c wrong (f skipped: gold UNKNOWN)
    expect(r.conditionRecall).toMatchObject({num:1, den:3});    // gold INELIGIBLE: a, b, d
  });
});

describe('A15.1 A (latest first) vs B (recommended) on the same visible candidates', () => {
  const opportunities = [opp('NEW1', ['CULTURE_TOURISM']), opp('NEW2', ['MEDIA_CONTENT']), opp('NEW3', ['HR_ORG']),
    opp('D1', ['DATA_ANALYTICS']), opp('D2', ['DATA_ANALYTICS', 'AI_ML']), opp('T1', ['TRADE_OVERSEAS'])];
  const published = {'SNAP-NEW1':'2026-11-19T00:00:00.000Z', 'SNAP-NEW2':'2026-11-18T00:00:00.000Z', 'SNAP-NEW3':'2026-11-17T00:00:00.000Z',
    'SNAP-D1':'2026-11-01T00:00:00.000Z', 'SNAP-D2':'2026-10-25T00:00:00.000Z', 'SNAP-T1':'2026-10-20T00:00:00.000Z'};
  const profiles = [
    {profileId:'SYN-P2', profile:profile({interestTopics:['TRADE_OVERSEAS']}), labels:{T1:2, NEW1:1} as const},
    {profileId:'SYN-P1', profile:profile({desiredJobTopics:['DATA_ANALYTICS'], interestTopics:['AI_ML']}), labels:{D1:2, D2:2, NEW1:0} as const},
  ];

  it('reports per-profile and pooled P@3 as exact fractions plus the %p difference', () => {
    const r = compareRankers(profiles, opportunities, {asOf:ASOF, publishedAtBySnapshotId:published});
    expect(r.profiles.map(p => p.profileId)).toEqual(['SYN-P1', 'SYN-P2']);
    expect(r.profiles[0]?.latestFirst.top3).toEqual(['NEW1', 'NEW2', 'NEW3']);
    expect(r.profiles[0]?.recommended.top3.slice(0, 2)).toEqual(['D2', 'D1']);
    // A: P1 0/3, P2 1/3 (NEW1) → macro 1/6, micro 1/6. B: P1 2/3, P2 T1 first + NEW1 in top3 → 2/3 → 4/6.
    expect(r.meanP3.latestFirst).toEqual({macro:0.166667, micro:{num:1, den:6, value:0.166667}});
    expect(r.meanP3.recommended).toEqual({macro:0.666667, micro:{num:4, den:6, value:0.666667}});
    expect(r.deltaP3Points).toBe(50);
    expect(r.deltaP3PointsMicro).toBe(50);
    expect(r.meanNdcg3.recommended).toBeGreaterThan(r.meanNdcg3.latestFirst);
    expect(r.rankConfigVersion).toBe('rank-v1.0');
  });

  it('reports macro and micro separately when a profile has fewer than 3 candidates (PR #48 review #2)', () => {
    // Different visible sets per profile via eligibility: S1 sees 1 candidate (1/1), S2 sees 3 (0/3) → macro 1/2, micro 1/4.
    const items = [opp('D1', ['DATA_ANALYTICS']), opp('X1', ['HR_ORG']), opp('X2', ['HR_ORG'])].map((o, i) =>
      i === 0 ? o : OpportunitySchema.parse({...o, conditions:[{field:'campus', operator:'EQ', value:'GLOBAL', evidenceId:`EV-${o.id}`}]}));
    const seoul = profile({interestTopics:['DATA_ANALYTICS'], facts:{campus:'SEOUL'}}); // X1/X2 ineligible → 1 candidate
    const unknown = profile({interestTopics:['DATA_ANALYTICS']});                     // X1/X2 UNKNOWN → 3 candidates
    const r = compareRankers([
      {profileId:'S1', profile:seoul, labels:{D1:2}},
      {profileId:'S2', profile:unknown, labels:{}},
    ], items, {asOf:ASOF});
    expect(r.profiles.map(p => p.recommended.p3.actualK)).toEqual([1, 3]);
    expect(r.meanP3.recommended.macro).toBe(0.5);
    expect(r.meanP3.recommended.micro).toMatchObject({num:1, den:4});
  });

  it('is deterministic for reordered profiles and opportunities', () => {
    const a = compareRankers(profiles, opportunities, {asOf:ASOF, publishedAtBySnapshotId:published});
    const b = compareRankers([...profiles].reverse(), [...opportunities].reverse(), {asOf:ASOF, publishedAtBySnapshotId:published});
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('never ranks a future-published item in either arm (same visible set)', () => {
    const future = {...published, 'SNAP-NEW1':'2026-12-01T00:00:00.000Z'};
    const r = compareRankers(profiles, opportunities, {asOf:ASOF, publishedAtBySnapshotId:future});
    for (const p of r.profiles) {
      expect(p.latestFirst.top3).not.toContain('NEW1');
      expect(p.recommended.top3).not.toContain('NEW1');
    }
  });
});

describe('#10 top-3 diversity and UNKNOWN per arm (label-free, hand-calculated)', () => {
  // Three newest items share one organizer group; two are CONFLICT sources (code eligibility UNKNOWN).
  const same = (id:string, quality:Opportunity['dataQuality']) => OpportunitySchema.parse({...opp(id, ['MEDIA_CONTENT']), organization:'시연가상기관 SAME', dataQuality:quality});
  const opportunities = [same('N1', 'CONFLICT'), same('N2', 'COMPLETE'), same('N3', 'CONFLICT'),
    opp('D1', ['DATA_ANALYTICS']), opp('D2', ['AI_ML']), opp('D3', ['DATA_ANALYTICS', 'SOFTWARE_DEV'])];
  const published = {'SNAP-N1':'2026-11-19T00:00:00.000Z', 'SNAP-N2':'2026-11-18T00:00:00.000Z', 'SNAP-N3':'2026-11-17T00:00:00.000Z',
    'SNAP-D1':'2026-11-01T00:00:00.000Z', 'SNAP-D2':'2026-10-30T00:00:00.000Z', 'SNAP-D3':'2026-10-29T00:00:00.000Z'};
  const profiles = [{profileId:'SYN-Q1', profile:profile({desiredJobTopics:['DATA_ANALYTICS'], interestTopics:['AI_ML', 'SOFTWARE_DEV']}), labels:{}}];
  const r = compareRankers(profiles, opportunities, {asOf:ASOF, publishedAtBySnapshotId:published});

  it('latest-first top 3 = one group, one topic, two UNKNOWN slots', () => {
    expect(r.profiles[0]?.latestFirst.top3).toEqual(['N1', 'N2', 'N3']);
    expect(r.profiles[0]?.latestFirst.top3Quality).toEqual({slots:3, distinctGroups:1, distinctTopics:1, unknownEligibility:2});
    expect(r.top3Quality.latestFirst).toEqual({
      groupDiversity:{num:1, den:3, value:0.333333}, unknownEligibilityShare:{num:2, den:3, value:0.666667}, meanDistinctTopics:1,
    });
  });

  it('recommended top 3 = three groups, three topics, no UNKNOWN slot', () => {
    expect([...r.profiles[0]!.recommended.top3].sort()).toEqual(['D1', 'D2', 'D3']);
    expect(r.profiles[0]?.recommended.top3Quality).toEqual({slots:3, distinctGroups:3, distinctTopics:3, unknownEligibility:0});
    expect(r.top3Quality.recommended.groupDiversity).toEqual({num:3, den:3, value:1});
    expect(r.top3Quality.recommended.unknownEligibilityShare).toEqual({num:0, den:3, value:0});
  });

  it('pools slots, so a profile with fewer than 3 candidates is not over-weighted', () => {
    const two = compareRankers([{profileId:'SYN-Q2', profile:profile({}), labels:{}}], [opp('A', ['HR_ORG']), same('B', 'CONFLICT')], {asOf:ASOF});
    expect(two.profiles[0]?.recommended.top3Quality.slots).toBe(2);
    expect(two.top3Quality.recommended.unknownEligibilityShare).toEqual({num:1, den:2, value:0.5});
    expect(compareRankers([], opportunities, {asOf:ASOF}).top3Quality.recommended.groupDiversity).toEqual({num:0, den:0, value:0});
  });
});
