import {describe, it, expect} from 'vitest';
import {OpportunitySchema, type Opportunity, type TopicCode} from '@hufs-one/contracts';
import {
  DEMO_AS_OF, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT, DEMO_STUDENTS,
  RANK_CONFIG_V1_1, composeFeed, explainNotFeatured, explainRecommendation, scopeInputsToGrant,
  type NotFeaturedOptions, type RecommendationProfile,
} from './index.js';

const opts:NotFeaturedOptions = {asOf:DEMO_AS_OF, publishedAtBySnapshotId:DEMO_PUBLISHED_AT};
const student = (s:string) => DEMO_STUDENTS.find(x => x.subject === s)!;
const S01 = student('S01');
const reasonOf = (r:ReturnType<typeof explainNotFeatured>, id:string) => r.items.find(i => i.opportunityId === id)?.reason;
const withOpp = (id:string, patch:Partial<Opportunity>) => DEMO_OPPORTUNITIES.map(o => o.id === id ? {...o, ...patch} : o);
const DAY = 86_400_000;
const shift = (days:number) => new Date(Date.parse(DEMO_AS_OF) + days * DAY).toISOString();

describe('#86 reasons for candidates that are not large cards (40 synthetic opportunities × 5 profiles)', () => {
  it('decision table: every shown-or-shelved candidate is featured or has exactly one reason; future items are absent', () => {
    for (const s of DEMO_STUDENTS) {
      const r = explainNotFeatured(s.profile, DEMO_OPPORTUNITIES, opts);
      const ids = [...r.featuredIds, ...r.items.map(i => i.opportunityId)];
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(39); // 40 − SYN-OPP-038 (published after asOf)
      expect(ids).not.toContain('SYN-OPP-038');
      expect(r).toMatchObject({asOf:DEMO_AS_OF, rankConfigVersion:'rank-v1.0', provenance:'CODE_RULES'});
      expect(r.featuredIds).toEqual(composeFeed(s.profile, DEMO_OPPORTUNITIES, opts).feed.featured.map(c => c.opportunityId));
      // Shared archetypes across every profile: closed, unreviewed sources.
      expect(reasonOf(r, 'SYN-OPP-012')).toBe('DEADLINE_PASSED');
      expect(reasonOf(r, 'SYN-OPP-025')).toBe('SOURCE_NEEDS_REVIEW');
      expect(reasonOf(r, 'SYN-OPP-039')).toBe('SOURCE_NEEDS_REVIEW');
      for (const i of r.items) expect(i.text.length).toBeGreaterThan(0);
    }
  });

  it('S01 table is stable (regression snapshot of the reason counts)', () => {
    const r = explainNotFeatured(S01.profile, DEMO_OPPORTUNITIES, opts);
    const count = (reason:string) => r.items.filter(i => i.reason === reason).length;
    expect(r.featuredIds).toEqual(['SYN-OPP-002', 'SYN-OPP-029', 'SYN-OPP-008']);
    expect([count('OUTRANKED'), count('LOW_RELEVANCE'), count('SOURCE_NEEDS_REVIEW'), count('ELIGIBILITY_NOT_MET'), count('DEADLINE_PASSED')])
      .toEqual([6, 25, 2, 2, 1]);
    // The trap posting stays visible below with an honest reason, not silently dropped.
    expect(reasonOf(r, 'SYN-OPP-033')).toBe('OUTRANKED');
    const failed = r.items.find(i => i.opportunityId === 'SYN-OPP-005')!;
    expect(failed).toMatchObject({reason:'ELIGIBILITY_NOT_MET', placement:'INELIGIBLE_AREA'});
    expect(failed.fields.length).toBeGreaterThan(0);
    expect(failed.evidenceRefs.every(e => e.startsWith('EV-SYN-'))).toBe(true);
  });

  it('never contradicts the #41 positive reasons', () => {
    for (const s of DEMO_STUDENTS) {
      const composed = composeFeed(s.profile, DEMO_OPPORTUNITIES, opts);
      const byId = new Map(composed.all.map(x => [x.opportunity.id, x]));
      for (const i of explainNotFeatured(s.profile, DEMO_OPPORTUNITIES, opts).items) {
        const ranked = byId.get(i.opportunityId);
        if (!ranked) continue;
        const codes = explainRecommendation(ranked).reasons.map(x => x.code);
        if (i.reason === 'OUTRANKED' || i.reason === 'GROUP_CAP' || i.reason === 'DIVERSITY') expect(codes.some(c => c === 'JOB_MATCH' || c === 'INTEREST_MATCH' || c === 'EXPERIENCE_MATCH')).toBe(true);
        if (i.reason === 'LOW_RELEVANCE') expect(codes[0]).toBe('NO_PERSONAL_MATCH');
      }
    }
  });

  it('is byte-stable and independent of input order', () => {
    const a = explainNotFeatured(S01.profile, DEMO_OPPORTUNITIES, opts);
    const b = explainNotFeatured(S01.profile, [...DEMO_OPPORTUNITIES].reverse(), opts);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('#86 negative cases', () => {
  it('source cancel / extend: deadline moves change the reason, not a stale cached one', () => {
    const cancelled = explainNotFeatured(S01.profile, withOpp('SYN-OPP-002', {applyClosesAt:shift(-1)}), opts);
    expect(cancelled.featuredIds).not.toContain('SYN-OPP-002');
    expect(reasonOf(cancelled, 'SYN-OPP-002')).toBe('DEADLINE_PASSED');
    const extended = explainNotFeatured(S01.profile, withOpp('SYN-OPP-012', {applyClosesAt:shift(10)}), opts);
    expect(reasonOf(extended, 'SYN-OPP-012')).not.toBe('DEADLINE_PASSED');
    // Withdrawn from the source entirely: no row and no count.
    const removed = explainNotFeatured(S01.profile, DEMO_OPPORTUNITIES.filter(o => o.id !== 'SYN-OPP-019'), opts);
    expect(removed.items.map(i => i.opportunityId)).not.toContain('SYN-OPP-019');
    expect(removed.items).toHaveLength(35);
  });

  it('asOf change: a later view moves an open item to DEADLINE_PASSED; an earlier view hides later postings', () => {
    const deadline = DEMO_OPPORTUNITIES.find(o => o.id === 'SYN-OPP-002')!.applyClosesAt!;
    const later = explainNotFeatured(S01.profile, DEMO_OPPORTUNITIES, {...opts, asOf:new Date(Date.parse(deadline) + DAY).toISOString()});
    expect(reasonOf(later, 'SYN-OPP-002')).toBe('DEADLINE_PASSED');
    const earlierAsOf = shift(-30);
    const earlier = explainNotFeatured(S01.profile, DEMO_OPPORTUNITIES, {...opts, asOf:earlierAsOf});
    const all = [...earlier.featuredIds, ...earlier.items.map(i => i.opportunityId)];
    for (const [snap, at] of Object.entries(DEMO_PUBLISHED_AT)) {
      if (Date.parse(at) <= Date.parse(earlierAsOf)) continue;
      const id = DEMO_OPPORTUNITIES.find(o => o.sourceSnapshotId === snap)!.id;
      expect(all).not.toContain(id);
    }
  });

  it('user hide: HIDDEN_BY_USER with no evaluated details; a hidden future item stays absent', () => {
    const r = explainNotFeatured(S01.profile, DEMO_OPPORTUNITIES, {...opts, hiddenOpportunityIds:['SYN-OPP-002', 'SYN-OPP-038']});
    const hidden = r.items.filter(i => i.reason === 'HIDDEN_BY_USER');
    expect(hidden).toEqual([{opportunityId:'SYN-OPP-002', reason:'HIDDEN_BY_USER', notes:[], placement:'HIDDEN',
      text:hidden[0]!.text, fields:[], evidenceRefs:[]}]);
    expect(r.featuredIds).not.toContain('SYN-OPP-002');
    expect(r.items.map(i => i.opportunityId)).not.toContain('SYN-OPP-038');
  });

  it('scope reduction: unshared experience collapses "no match" into NOT_EVALUATED, never naming the section', () => {
    const scoped = scopeInputsToGrant(S01.profile, S01.noticeStudent, ['FEED', 'NOTICES', 'ACADEMICS']);
    expect(scoped.withheld).toContain('EXPERIENCE_TOPICS');
    const r = explainNotFeatured(scoped.profile!, DEMO_OPPORTUNITIES, {...opts, withheld:scoped.withheld});
    expect(r.items.some(i => i.reason === 'LOW_RELEVANCE')).toBe(false);
    const ne = r.items.filter(i => i.reason === 'NOT_EVALUATED');
    expect(ne.length).toBeGreaterThan(0);
    // No evaluation is attached to an unevaluated candidate (aligned with the #120 wire rule).
    for (const i of ne) expect([i.notes, i.evidenceRefs]).toEqual([[], []]);
    for (const i of r.items) expect(i.text).not.toMatch(/경험 섹션|EXPERIENCE|학업 섹션|ACADEMICS/);
  });

  it('withheld facts: no ELIGIBILITY_NOT_MET from hidden values, and unknown eligibility is a neutral NOT_EVALUATED note', () => {
    const scoped = scopeInputsToGrant(S01.profile, S01.noticeStudent, ['FEED', 'NOTICES', 'EXPERIENCE']);
    expect(scoped.withheld.some(w => w.startsWith('FACT:'))).toBe(true);
    const full = explainNotFeatured(S01.profile, DEMO_OPPORTUNITIES, opts);
    const r = explainNotFeatured(scoped.profile!, DEMO_OPPORTUNITIES, {...opts, withheld:scoped.withheld});
    expect(full.items.some(i => i.reason === 'ELIGIBILITY_NOT_MET')).toBe(true);
    expect(r.items.some(i => i.reason === 'ELIGIBILITY_NOT_MET')).toBe(false);
    expect(r.items.flatMap(i => i.notes)).not.toContain('ELIGIBILITY_UNKNOWN');
    expect(r.items.flatMap(i => i.notes)).toContain('NOT_EVALUATED');
  });

  it('unknown applicability: a missing fact adds ELIGIBILITY_UNKNOWN, never ELIGIBILITY_NOT_MET', () => {
    const {campus: _c, ...facts} = S01.profile.facts;
    const r = explainNotFeatured({...S01.profile, facts}, DEMO_OPPORTUNITIES, opts);
    const unknown = r.items.filter(i => i.notes.includes('ELIGIBILITY_UNKNOWN'));
    expect(unknown.length).toBeGreaterThan(explainNotFeatured(S01.profile, DEMO_OPPORTUNITIES, opts).items.filter(i => i.notes.includes('ELIGIBILITY_UNKNOWN')).length);
    for (const i of unknown) expect(i.reason).not.toBe('ELIGIBILITY_NOT_MET');
  });

  it('no personal inputs: shown items are NO_PERSONAL_INPUT (not "unshared"), not LOW_RELEVANCE or OUTRANKED', () => {
    const blank:RecommendationProfile = {...S01.profile, interestTopics:[], desiredJobTopics:[], approvedExperienceTopics:[]};
    const r = explainNotFeatured(blank, DEMO_OPPORTUNITIES, opts);
    expect(r.featuredIds).toEqual([]);
    expect(r.items.filter(i => i.placement === 'COMPACT_LIST' || i.placement === 'MORE_LIST')
      .every(i => i.reason === 'NO_PERSONAL_INPUT' || i.reason === 'SOURCE_NEEDS_REVIEW')).toBe(true);
    expect(r.items.some(i => i.reason === 'NOT_EVALUATED')).toBe(false);
    // Copy differs from the unshared case, so the student is told to add preferences, not to change sharing.
    const np = r.items.find(i => i.reason === 'NO_PERSONAL_INPUT')!;
    expect(np.text).toMatch(/입력하지 않아/);
    expect(np.text).not.toMatch(/공유/);
  });
});

// #117 review: "outranked" must be literally true for the selection composeFeed made.
const D = (d:number) => new Date(Date.parse(DEMO_AS_OF) + d * DAY).toISOString();
function opp(id:string, organization:string, topicCodes:TopicCode[]):Opportunity {
  return OpportunitySchema.parse({
    id, version:'v1', sourceSnapshotId:`SYN-SRC-${id}`, title:`가상 공고 ${id}`, organization, kind:'CONTEST', topicCodes,
    languageCodes:[], applyClosesAt:D(10), eventSessions:[], actualApplicationRoute:'DEMO_DISABLED', conditions:[], roleSteps:[],
    prioritySelection:[], completionRules:[], dataMode:'SYNTHETIC', dataQuality:'COMPLETE',
  });
}
const base:RecommendationProfile = {
  interestTopics:[], desiredJobTopics:[], approvedExperienceTopics:[], approvedLanguageCodes:[], officialMajorTopics:[], facts:{},
};
const synOpts = {asOf:DEMO_AS_OF};

describe('#117 review: truthful reasons for the kind+organization cap and topic diversity', () => {
  it('rank A(100) A(95) A(90) B(80): cards A,A,B; the third A is GROUP_CAP, never OUTRANKED', () => {
    const profile = {...base, desiredJobTopics:['DATA_ANALYTICS', 'AI_ML'] as TopicCode[], interestTopics:['DATA_ANALYTICS'] as TopicCode[]};
    const opps = [
      opp('SYN-A1', '시연가상기관 A', ['DATA_ANALYTICS', 'AI_ML']),
      opp('SYN-A2', '시연가상기관 A', ['DATA_ANALYTICS', 'AI_ML']),
      opp('SYN-A3', '시연가상기관 A', ['DATA_ANALYTICS', 'AI_ML']),
      opp('SYN-B1', '시연가상기관 B', ['AI_ML']),
      opp('SYN-C1', '시연가상기관 C', ['AI_ML']),
    ];
    const composed = composeFeed(profile, opps, synOpts);
    const score = (id:string) => composed.all.find(r => r.opportunity.id === id)!.score.total;
    expect(score('SYN-A3')).toBeGreaterThan(score('SYN-B1')); // A3 really ranks above a featured card
    const r = explainNotFeatured(profile, opps, synOpts);
    expect(r.featuredIds).toEqual(['SYN-A1', 'SYN-A2', 'SYN-B1']);
    expect(reasonOf(r, 'SYN-A3')).toBe('GROUP_CAP');
    // C1 ranks below all three cards: that one is honestly OUTRANKED.
    expect(reasonOf(r, 'SYN-C1')).toBe('OUTRANKED');
    expect(r.items.find(i => i.opportunityId === 'SYN-A3')!.text).not.toMatch(/점수가 높은/);
    // Tie: C1 has the same score as the featured B1 and is behind only by the id tie-break.
    // The copy must speak of recommendation order, never claim a higher score (#117 UI review).
    expect(score('SYN-C1')).toBe(score('SYN-B1'));
    const c1 = r.items.find(i => i.opportunityId === 'SYN-C1')!;
    expect(c1.text).toMatch(/추천 순서가 앞선/);
    expect(c1.text).not.toMatch(/점수/);
  });

  it('opt-in rank-v1.1 topic diversity: a skipped higher-ranked item is DIVERSITY; v1.0 calls it OUTRANKED', () => {
    const profile = {...base, desiredJobTopics:['DATA_ANALYTICS'] as TopicCode[], interestTopics:['DATA_ANALYTICS', 'MARKETING_BRAND'] as TopicCode[]};
    const opps = [
      opp('SYN-X1', '시연가상기관 X1', ['DATA_ANALYTICS']),
      opp('SYN-X2', '시연가상기관 X2', ['DATA_ANALYTICS']),
      opp('SYN-X3', '시연가상기관 X3', ['DATA_ANALYTICS']),
      opp('SYN-Y1', '시연가상기관 Y1', ['MARKETING_BRAND']),
    ];
    const v11 = explainNotFeatured(profile, opps, {...synOpts, config:RANK_CONFIG_V1_1});
    expect(v11.rankConfigVersion).toBe('rank-v1.1');
    expect(v11.featuredIds).toEqual(['SYN-X1', 'SYN-X2', 'SYN-Y1']);
    expect(reasonOf(v11, 'SYN-X3')).toBe('DIVERSITY');
    const v10 = explainNotFeatured(profile, opps, synOpts);
    expect(v10.featuredIds).toEqual(['SYN-X1', 'SYN-X2', 'SYN-X3']);
    expect(reasonOf(v10, 'SYN-Y1')).toBe('OUTRANKED');
  });

  it('unshared experience with no other preferences is NOT_EVALUATED, not NO_PERSONAL_INPUT, and names no section', () => {
    const profile = {...base, approvedExperienceTopics:['DATA_ANALYTICS'] as TopicCode[]};
    const scoped = scopeInputsToGrant(profile, {openRequirementIds:null, courseIds:[], interestTopics:[]}, ['FEED', 'NOTICES']);
    const r = explainNotFeatured(scoped.profile!, [opp('SYN-X1', '시연가상기관 X1', ['DATA_ANALYTICS'])], {...synOpts, withheld:scoped.withheld});
    expect(r.items.map(i => i.reason)).toEqual(['NOT_EVALUATED']);
    expect(r.items[0]!.text).not.toMatch(/경험|학업|EXPERIENCE|ACADEMICS/);
  });
});
