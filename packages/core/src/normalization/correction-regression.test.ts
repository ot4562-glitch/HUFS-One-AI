import {describe, it, expect} from 'vitest';
import {OpportunitySchema, type Opportunity} from '@hufs-one/contracts';
import {gateBySourceRevision, resultCacheKey, selectCurrentRevisions, type ResultCacheParts, type RevisionRecord} from './index.js';
import {composeFeed, explainRecommendation, type RecommendationProfile} from '../opportunities/index.js';
import {composeNotices, type Notice, type NoticeStudent} from '../notices/index.js';

/**
 * #119 (추천 소비 측): when a posting is corrected, only the current reviewed revision reaches the feed/notices.
 * The superseded revision never comes back — not when the new one is cancelled, unreviewed or rights-blocked —
 * and the cache key moves with the revision. SYNTHETIC dates only (가상 11/20 → 11/25 연장 예시).
 */
const ASOF = '2026-11-18T00:00:00.000Z';
const KST = (md:string) => `2026-${md}T23:59:00+09:00`;
const D = (d:number) => new Date(Date.parse(ASOF) + d * 86_400_000).toISOString();

const rev = (revisionId:string, over:Partial<RevisionRecord> = {}):RevisionRecord => ({
  revisionId, sourceId:'SYN-SRC-CORR', status:'ACTIVE', changeKind:'NEW', provenance:'SYNTHETIC', permissionRef:'synthetic-ref',
  publishedAt:D(-10), fetchedAt:D(-10), lastVerifiedAt:D(-9), ...over,
});
const r1 = rev('SYN-REV-1');
const r2 = (over:Partial<RevisionRecord> = {}) =>
  rev('SYN-REV-2', {supersedes:'SYN-REV-1', changeKind:'EXTENDED', fetchedAt:D(-2), lastVerifiedAt:D(-1), ...over});

const opp = (revisionId:string, applyClosesAt:string):Opportunity => OpportunitySchema.parse({
  id:'SYN-OPP-CORR', version:revisionId, sourceSnapshotId:revisionId, title:'가상 데이터 분석 공모전', organization:'시연가상기관 정정',
  kind:'CONTEST', topicCodes:['DATA_ANALYTICS'], languageCodes:[], applyClosesAt, eventSessions:[], actualApplicationRoute:'DEMO_DISABLED',
  conditions:[], roleSteps:[], prioritySelection:[], completionRules:[], dataMode:'SYNTHETIC', dataQuality:'COMPLETE',
});
/** The correction exists but has not been reviewed yet (no lastVerifiedAt). */
const unreviewed = ():RevisionRecord => {
  const {lastVerifiedAt:_drop, ...rest} = r2();
  return rest;
};
const OLD = opp('SYN-REV-1', KST('11-20'));
const NEW = opp('SYN-REV-2', KST('11-25'));
const profile:RecommendationProfile = {
  interestTopics:['DATA_ANALYTICS'], desiredJobTopics:[], approvedExperienceTopics:[], approvedLanguageCodes:[], officialMajorTopics:[], facts:{},
};

function feedFor(revisions:RevisionRecord[], items:Opportunity[], asOf = ASOF) {
  const selection = selectCurrentRevisions(revisions, asOf);
  const gated = gateBySourceRevision(items, selection);
  const feed = composeFeed(profile, gated.usable, {asOf});
  return {selection, gated, feed, ids:[...feed.all, ...feed.closed, ...feed.ineligible].map(r => `${r.opportunity.id}@${r.opportunity.sourceSnapshotId}`)};
}

describe('#119 correction regressions: the current reviewed revision only, never the old one', () => {
  it('11/20 → 11/25 extension: the feed shows only the new revision and its new deadline', () => {
    const {feed, gated, ids} = feedFor([r1, r2()], [OLD, NEW]);
    expect(ids).toEqual(['SYN-OPP-CORR@SYN-REV-2']);
    expect(gated.quarantined).toEqual([{id:'SYN-OPP-CORR', revisionId:'SYN-REV-1', reason:'SUPERSEDED'}]);
    expect(feed.explanations.find(e => e.opportunityId === 'SYN-OPP-CORR')?.deadline.iso).toBe(KST('11-25'));
  });

  it('shortened to before asOf: the corrected revision moves to the closed history, the old open one is not kept', () => {
    const SHORT = opp('SYN-REV-2', KST('11-15'));
    const {feed, ids} = feedFor([r1, r2({changeKind:'CORRECTED'})], [OLD, SHORT]);
    expect(ids).toEqual(['SYN-OPP-CORR@SYN-REV-2']);
    expect(feed.closed.map(r => r.opportunity.sourceSnapshotId)).toEqual(['SYN-REV-2']);
    // The deadline shown for the corrected posting is the shortened one, not the old 11/20 (#122 UI review).
    expect(explainRecommendation(feed.closed[0]!).deadline.iso).toBe(KST('11-15'));
    expect(feed.feed.featured).toEqual([]);
  });

  it('cancelled: nothing is shown, and the superseded open revision is not revived', () => {
    const {ids, selection} = feedFor([r1, r2({changeKind:'CANCELLED', status:'RETRACTED'})], [OLD, NEW]);
    expect(ids).toEqual([]);
    expect(selection.current.size).toBe(0);
  });

  for (const [name, head] of [
    ['new revision still in review (unverified)', unreviewed()],
    ['new revision NEEDS_REVIEW', r2({status:'NEEDS_REVIEW'})],
    ['new revision rights withdrawn', r2({status:'BLOCKED_RIGHTS'})],
    ['new revision expired', r2({validUntil:D(-1)})],
  ] as const) {
    it(`${name}: the old revision is not reactivated as the current posting`, () => {
      const {ids, gated} = feedFor([r1, head], [OLD, NEW]);
      expect(ids).toEqual([]);
      expect(gated.quarantined.map(q => q.revisionId).sort()).toEqual(['SYN-REV-1', 'SYN-REV-2']);
    });
  }

  it('asOf replay before the correction was known: the old revision and old deadline, no future leakage', () => {
    const before = D(-5);
    const {feed, ids} = feedFor([r1, r2()], [OLD, NEW], before);
    expect(ids).toEqual(['SYN-OPP-CORR@SYN-REV-1']);
    expect(feed.explanations[0]?.deadline.iso).toBe(KST('11-20'));
  });

  it('the result cache key changes with the revision, so a cached pre-correction feed is never served', () => {
    const parts = (sourceRevisionIds:string[]):ResultCacheParts => ({
      kind:'FEED', asOf:ASOF, profile:'P1', projection:'SYN-PR1', consent:'C1', overlay:'OV1', topics:'topics-v1', rankConfig:'rank-v1.0',
      sourceRevisionIds, claimVersion:'cl-1', retrievalConfigVersion:'keyword-v1', permissionPolicyVersion:'policy-v1', academics:'none',
    });
    const before = feedFor([r1], [OLD]).gated.usable.map(o => o.sourceSnapshotId);
    const after = feedFor([r1, r2()], [OLD, NEW]).gated.usable.map(o => o.sourceSnapshotId);
    expect(resultCacheKey(parts(before))).not.toBe(resultCacheKey(parts(after)));
    // An all-quarantined source is an empty revision set: still a distinct key from the pre-correction one.
    const blocked = feedFor([r1, r2({status:'BLOCKED_RIGHTS'})], [OLD, NEW]).gated.usable.map(o => o.sourceSnapshotId);
    expect(resultCacheKey(parts(blocked))).not.toBe(resultCacheKey(parts(before)));
  });

  it('notices follow the same rule: an unreviewed correction does not bring back the old notice', () => {
    const student:NoticeStudent = {openRequirementIds:['SYN-REQ-1'], courseIds:[], interestTopics:[]};
    const n = (revisionId:string):Notice => ({id:'SYN-NOT-CORR', sourceSnapshotId:revisionId, title:'가상 졸업서류 제출 안내', issuer:'시연가상학과',
      category:'ACADEMIC', requirementRefs:['SYN-REQ-1'], verificationState:'VERIFIED', evidenceRefs:['EV-SYN-NOT-CORR'], studentDeadline:KST('11-25')});
    // Returns the revision behind each shown notice, so "one notice shown" cannot hide the OLD one (#122 UI review).
    const show = (revisions:RevisionRecord[]) => {
      const usable = gateBySourceRevision([n('SYN-REV-1'), n('SYN-REV-2')], selectCurrentRevisions(revisions, ASOF)).usable;
      const shown = new Set(composeNotices(student, usable, {asOf:ASOF}).result.items.map(i => i.noticeId));
      return usable.filter(x => shown.has(x.id)).map(x => x.sourceSnapshotId);
    };
    expect(show([r1, r2()])).toEqual(['SYN-REV-2']);
    expect(show([r1, unreviewed()])).toEqual([]);
    expect(show([r1, r2({changeKind:'CANCELLED', status:'RETRACTED'})])).toEqual([]);
  });
});
