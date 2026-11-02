import {describe, it, expect} from 'vitest';
import {createHash} from 'node:crypto';
import {
  OpportunityComparisonRevisionSchema, OpportunityRevisionComparisonResponseSchema, OpportunitySchema,
  compareReviewedOpportunityRevisionClaims,
  type OpportunityComparisonRevision, type OpportunityRevisionComparisonClaim, type Opportunity,
} from '@hufs-one/contracts';
import {gateBySourceRevision, selectCurrentRevisions, type RevisionRecord} from './index.js';
import {composeFeed, confirmedDeadline, explainRecommendation, opportunityLifecycle, type RecommendationProfile} from '../opportunities/index.js';

/**
 * #119 (김채윤 · 추천 소비): the 정정 전/후 comparison and the feed must tell the same story.
 * Claims are derived from the same reviewed revision the feed uses, so a deadline shown as "11/25" on the card
 * is the "정정 후" value; reorderings are not changes; a missing value is UNKNOWN (확인 필요), never a change;
 * an unreviewed correction is NEEDS_REVIEW with no content and does not revive the old posting.
 * SYNTHETIC only. These are core-side regressions; the HTTP route and DB reset are the API track's evidence.
 */
const ASOF = '2026-11-18T00:00:00.000Z';
const KST = (md:string) => `2026-${md}T23:59:00+09:00`;
const D = (d:number) => new Date(Date.parse(ASOF) + d * 86_400_000).toISOString();

const rec = (revisionId:string, over:Partial<RevisionRecord> = {}):RevisionRecord => ({
  revisionId, sourceId:'SYN-SRC-CMP', status:'ACTIVE', changeKind:'NEW', provenance:'SYNTHETIC', permissionRef:'synthetic-ref',
  publishedAt:D(-10), fetchedAt:D(-10), lastVerifiedAt:D(-9), ...over,
});
const R1 = rec('SYN-REV-C1');
const R2 = (over:Partial<RevisionRecord> = {}) =>
  rec('SYN-REV-C2', {supersedes:'SYN-REV-C1', changeKind:'CORRECTED', fetchedAt:D(-2), lastVerifiedAt:D(-1), ...over});

type Cond = Opportunity['conditions'][number];
const opp = (revisionId:string, over:Partial<Opportunity> = {}):Opportunity => OpportunitySchema.parse({
  id:'SYN-OPP-CMP', version:revisionId, sourceSnapshotId:revisionId, title:'가상 데이터 분석 공모전', organization:'시연가상기관 비교',
  kind:'CONTEST', topicCodes:['DATA_ANALYTICS'], languageCodes:[], applyClosesAt:KST('11-20'), eventSessions:[],
  actualApplicationRoute:'DEMO_DISABLED', conditions:[], roleSteps:[], prioritySelection:[], completionRules:[],
  dataMode:'SYNTHETIC', dataQuality:'COMPLETE', ...over,
});
const cond = (field:Cond['field'], operator:Cond['operator'], value:Cond['value'], n:string):Cond => ({field, operator, value, evidenceId:`EV-SYN-CMP-${n}`});

/** Reviewed claim values derived from the same revision the feed uses (deadline, status, conditions). */
function comparisonRevision(o:Opportunity, r:RevisionRecord):OpportunityComparisonRevision {
  const ev = (f:string) => [`EV-SYN-${r.revisionId}-${f}`];
  const at = confirmedDeadline(o);
  const life = opportunityLifecycle(o, ASOF);
  const claims:OpportunityRevisionComparisonClaim[] = [
    {field:'DEADLINE', value:at !== undefined ? {kind:'FIXED', at} : o.deadlineKind === 'ROLLING' ? {kind:'ROLLING'} : {kind:'UNKNOWN'}, evidenceRefs:ev('deadline')},
    {field:'STATUS', value:r.changeKind === 'CANCELLED' ? 'CANCELLED' : life === 'CLOSED' ? 'CLOSED' : life === 'OPEN' ? 'OPEN' : 'UNKNOWN', evidenceRefs:ev('status')},
    {field:'ELIGIBILITY', value:o.conditions.map(c => ({field:c.field, operator:c.operator, value:c.value})), evidenceRefs:ev('eligibility')},
  ];
  return OpportunityComparisonRevisionSchema.parse({
    revisionId:r.revisionId, sourceId:r.sourceId, opportunityId:o.id,
    capturedAt:r.fetchedAt, checkedAt:r.lastVerifiedAt ?? r.fetchedAt, verifiedAt:r.lastVerifiedAt ?? r.fetchedAt,
    contentSha256:createHash('sha256').update(JSON.stringify(o)).digest('hex'),
    dataMode:'SYNTHETIC', deliveryMode:'REPLAY', claims,
  });
}
function compare(before:[Opportunity, RevisionRecord], after:[Opportunity, RevisionRecord]) {
  const b = comparisonRevision(...before), a = comparisonRevision(...after);
  const derived = compareReviewedOpportunityRevisionClaims(b, a);
  const response = OpportunityRevisionComparisonResponseSchema.parse({
    opportunityId:'SYN-OPP-CMP', beforeRevisionId:b.revisionId, afterRevisionId:a.revisionId, asOf:ASOF,
    state:'READY', before:b, after:a, ...derived,
  });
  const state = Object.fromEntries(derived.comparisons.map(c => [c.field, c.state]));
  return {response, state, changes:derived.changes, after:a};
}
const profile:RecommendationProfile = {
  interestTopics:['DATA_ANALYTICS'], desiredJobTopics:[], approvedExperienceTopics:[], approvedLanguageCodes:[], officialMajorTopics:[], facts:{},
};
function feedFor(revisions:RevisionRecord[], items:Opportunity[]) {
  const usable = gateBySourceRevision(items, selectCurrentRevisions(revisions, ASOF)).usable;
  return composeFeed(profile, usable, {asOf:ASOF});
}

describe('#119 정정 전/후 comparison agrees with the feed', () => {
  it('11/20 → 11/25 extension: DEADLINE EXTENDED, others UNCHANGED, and the card shows the "after" deadline', () => {
    const OLD = opp('SYN-REV-C1'), NEW = opp('SYN-REV-C2', {applyClosesAt:KST('11-25')});
    const c = compare([OLD, R1], [NEW, R2({changeKind:'EXTENDED'})]);
    expect(c.state).toEqual({DEADLINE:'CHANGED', STATUS:'UNCHANGED', ELIGIBILITY:'UNCHANGED'});
    expect(c.changes).toEqual([{field:'DEADLINE', kind:'EXTENDED'}]);
    const feed = feedFor([R1, R2({changeKind:'EXTENDED'})], [OLD, NEW]);
    const card = feed.explanations.find(e => e.opportunityId === 'SYN-OPP-CMP')!;
    const afterDeadline = c.after.claims.find(x => x.field === 'DEADLINE')!.value;
    expect(afterDeadline).toEqual({kind:'FIXED', at:card.deadline.iso});
  });

  it('shortened past asOf: DEADLINE SHORTENED and STATUS OPEN → CLOSED; the feed moves it to history', () => {
    const OLD = opp('SYN-REV-C1'), SHORT = opp('SYN-REV-C2', {applyClosesAt:KST('11-15')});
    const c = compare([OLD, R1], [SHORT, R2()]);
    expect(c.state).toEqual({DEADLINE:'CHANGED', STATUS:'CHANGED', ELIGIBILITY:'UNCHANGED'});
    expect(c.changes).toEqual([{field:'DEADLINE', kind:'SHORTENED'}, {field:'STATUS', kind:'CHANGED'}]);
    const feed = feedFor([R1, R2()], [OLD, SHORT]);
    expect(feed.closed.map(r => r.opportunity.sourceSnapshotId)).toEqual(['SYN-REV-C2']);
    expect(explainRecommendation(feed.closed[0]!).deadline.iso).toBe(KST('11-15'));
  });

  it('cancelled: STATUS CANCELLED in the comparison, and nothing (old or new) in the feed', () => {
    const OLD = opp('SYN-REV-C1');
    const cancelledRec = R2({changeKind:'CANCELLED', status:'RETRACTED'});
    const c = compare([OLD, R1], [opp('SYN-REV-C2'), cancelledRec]);
    expect(c.changes).toContainEqual({field:'STATUS', kind:'CANCELLED'});
    const feed = feedFor([R1, cancelledRec], [OLD, opp('SYN-REV-C2')]);
    expect([...feed.all, ...feed.closed]).toEqual([]);
  });

  it('eligibility: reordered conditions / IN sets are UNCHANGED; a real condition change is CHANGED', () => {
    const a = [cond('enrollment', 'EQ', 'ENROLLED', '1'), cond('campus', 'IN', ['SEOUL', 'GLOBAL'], '2')];
    const reordered = [cond('campus', 'IN', ['GLOBAL', 'SEOUL'], '2'), cond('enrollment', 'EQ', 'ENROLLED', '1')];
    const tightened = [cond('enrollment', 'EQ', 'ENROLLED', '1'), cond('campus', 'IN', ['SEOUL'], '2')];
    expect(compare([opp('SYN-REV-C1', {conditions:a}), R1], [opp('SYN-REV-C2', {conditions:reordered}), R2()]).state.ELIGIBILITY).toBe('UNCHANGED');
    const c = compare([opp('SYN-REV-C1', {conditions:a}), R1], [opp('SYN-REV-C2', {conditions:tightened}), R2()]);
    expect(c.state.ELIGIBILITY).toBe('CHANGED');
    expect(c.changes).toEqual([{field:'ELIGIBILITY', kind:'CHANGED'}]);
  });

  it('a deadline the corrected revision does not confirm is UNKNOWN (확인 필요), never SHORTENED/EXTENDED', () => {
    const {applyClosesAt:_drop, ...rest} = opp('SYN-REV-C2');
    const noDeadline = OpportunitySchema.parse(rest);
    const c = compare([opp('SYN-REV-C1'), R1], [noDeadline, R2()]);
    expect(c.state.DEADLINE).toBe('UNKNOWN');
    expect(c.changes.some(x => x.field === 'DEADLINE')).toBe(false);
    // ROLLING is a real, reviewed kind: FIXED → ROLLING is a CHANGE, not UNKNOWN.
    const rolling = OpportunitySchema.parse({...rest, deadlineKind:'ROLLING'});
    expect(compare([opp('SYN-REV-C1'), R1], [rolling, R2()]).changes).toContainEqual({field:'DEADLINE', kind:'CHANGED'});
  });

  it('an unreviewed correction is NEEDS_REVIEW with no content, and the feed does not fall back to the old revision', () => {
    const {lastVerifiedAt:_x, ...pending} = R2();
    const OLD = opp('SYN-REV-C1'), NEW = opp('SYN-REV-C2', {applyClosesAt:KST('11-25')});
    expect(selectCurrentRevisions([R1, pending], ASOF).current.size).toBe(0);
    const feed = feedFor([R1, pending], [OLD, NEW]);
    expect([...feed.all, ...feed.closed]).toEqual([]);
    const binding = {opportunityId:'SYN-OPP-CMP', beforeRevisionId:'SYN-REV-C1', afterRevisionId:'SYN-REV-C2', asOf:ASOF};
    expect(OpportunityRevisionComparisonResponseSchema.safeParse({...binding, state:'NEEDS_REVIEW', reason:'REVISION_NOT_REVIEWED'}).success).toBe(true);
    // Content must not ride along with NEEDS_REVIEW.
    const before = comparisonRevision(OLD, R1);
    expect(OpportunityRevisionComparisonResponseSchema.safeParse({...binding, state:'NEEDS_REVIEW', reason:'REVISION_NOT_REVIEWED', before}).success).toBe(false);
  });

  it('identical content hash cannot carry a "changed" claim (no invented correction)', () => {
    const OLD = opp('SYN-REV-C1');
    const b = comparisonRevision(OLD, R1);
    const a = {...comparisonRevision(opp('SYN-REV-C2', {applyClosesAt:KST('11-25')}), R2()), contentSha256:b.contentSha256};
    const derived = compareReviewedOpportunityRevisionClaims(b, a);
    expect(OpportunityRevisionComparisonResponseSchema.safeParse({
      opportunityId:'SYN-OPP-CMP', beforeRevisionId:b.revisionId, afterRevisionId:a.revisionId, asOf:ASOF,
      state:'READY', before:b, after:a, ...derived,
    }).success).toBe(false);
  });
});
