import {describe, expect, it} from 'vitest';
import {DEMO_AS_OF, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT} from './demo-corpus.js';
import {DEMO_STUDENTS} from './demo-profiles.js';
import {
  DEMO_ALL_REVISION_OPPORTUNITIES, DEMO_REVISED_OPPORTUNITIES, DEMO_REVISION_CASES, DEMO_REVISION_PUBLISHED_AT, DEMO_REVISIONS, gatedDemoCorpus,
} from './demo-revisions.js';
import {opportunityLifecycle} from './evaluate.js';
import {composeFeed} from './feed.js';
import {corpusCoverage} from './corpus-coverage.js';
import {DEMO_NOTICES} from '../notices/demo-notices.js';
import {gateBySourceRevision, selectCurrentRevisions} from '../normalization/revisions.js';

const caseOf = (scenario:string) => DEMO_REVISION_CASES.find(c => c.scenario === scenario)!;

describe('#10 correction / cancel / extension chains on the 40-item corpus (SYNTHETIC overlay)', () => {
  const g = gatedDemoCorpus();
  const usable = new Map(g.usable.map(o => [o.id, o]));
  const quarantine = new Map(g.quarantined.map(q => [q.revisionId, q.reason]));

  it('leaves DEMO_OPPORTUNITIES unchanged and adds exactly five r2 revisions', () => {
    expect(DEMO_OPPORTUNITIES).toHaveLength(40);
    expect(DEMO_OPPORTUNITIES.every(o => o.sourceSnapshotId.endsWith('-r1'))).toBe(true);
    expect(DEMO_REVISED_OPPORTUNITIES.map(o => o.sourceSnapshotId)).toEqual(DEMO_REVISION_CASES.map(c => c.r2));
    expect(DEMO_REVISIONS).toHaveLength(45);
    expect(DEMO_REVISED_OPPORTUNITIES.every(o => o.dataMode === 'SYNTHETIC')).toBe(true);
  });

  it('EXTENDED: r2 is current with the later deadline; r1 is SUPERSEDED', () => {
    const c = caseOf('EXTENDED');
    expect(usable.get(c.opportunityId)?.sourceSnapshotId).toBe(c.r2);
    expect(usable.get(c.opportunityId)?.applyClosesAt).toBe(new Date(Date.parse(DEMO_AS_OF) + 25 * 86_400_000).toISOString());
    expect(quarantine.get(c.r1)).toBe('SUPERSEDED');
  });

  it('CANCELLED: neither revision is usable', () => {
    const c = caseOf('CANCELLED');
    expect(usable.has(c.opportunityId)).toBe(false);
    expect([quarantine.get(c.r1), quarantine.get(c.r2)]).toEqual(['SUPERSEDED', 'CANCELLED']);
  });

  it('UNREVIEWED_CORRECTION: the correction is UNVERIFIED and the superseded r1 never comes back', () => {
    const c = caseOf('UNREVIEWED_CORRECTION');
    expect(usable.has(c.opportunityId)).toBe(false);
    expect([quarantine.get(c.r1), quarantine.get(c.r2)]).toEqual(['SUPERSEDED', 'UNVERIFIED']);
  });

  it('SHORTENED: the corrected deadline already passed, so the current item is CLOSED', () => {
    const c = caseOf('SHORTENED');
    const current = usable.get(c.opportunityId)!;
    expect(current.sourceSnapshotId).toBe(c.r2);
    expect(opportunityLifecycle(current, DEMO_AS_OF)).toBe('CLOSED');
  });

  it('CORRECTION_AFTER_AS_OF: not knowable at DEMO_AS_OF, so r1 stays current; a later view sees r2', () => {
    const c = caseOf('CORRECTION_AFTER_AS_OF');
    expect(usable.get(c.opportunityId)?.sourceSnapshotId).toBe(c.r1);
    expect(quarantine.get(c.r2)).toBe('NOT_KNOWN_AT_ASOF');
    const later = gatedDemoCorpus(new Date(Date.parse(DEMO_AS_OF) + 3 * 86_400_000).toISOString());
    expect(later.usable.find(o => o.id === c.opportunityId)?.sourceSnapshotId).toBe(c.r2);
  });

  it('every opportunity id appears at most once after the gate', () => {
    expect(new Set(g.usable.map(o => o.id)).size).toBe(g.usable.length);
    // 40 ids − CANCELLED − UNREVIEWED − future-published SYN-OPP-038 (its r1 is not known at asOf).
    expect(g.usable).toHaveLength(37);
    expect(quarantine.get('SYN-SRC-038-r1')).toBe('NOT_KNOWN_AT_ASOF');
  });
});

describe('#10 the gated corpus drives every student feed: no superseded, cancelled or unreviewed item', () => {
  const g = gatedDemoCorpus();
  const opts = {asOf:DEMO_AS_OF, publishedAtBySnapshotId:DEMO_REVISION_PUBLISHED_AT};
  for (const s of DEMO_STUDENTS) {
    it(`${s.subject}: feed shows only current revisions`, () => {
      const feed = composeFeed(s.profile, g.usable, opts);
      const shown = [...feed.all, ...feed.ineligible].map(r => r.opportunity);
      const snapshots = new Set(shown.map(o => o.sourceSnapshotId));
      for (const c of DEMO_REVISION_CASES) {
        if (c.scenario === 'EXTENDED') expect(snapshots.has(c.r1)).toBe(false);
        if (c.scenario === 'CANCELLED' || c.scenario === 'UNREVIEWED_CORRECTION') {
          expect(shown.some(o => o.id === c.opportunityId)).toBe(false);
        }
        if (c.scenario === 'SHORTENED') expect(shown.some(o => o.id === c.opportunityId)).toBe(false);
        if (c.scenario === 'CORRECTION_AFTER_AS_OF') expect(snapshots.has(c.r2)).toBe(false);
      }
      expect(feed.closed.map(r => r.opportunity.sourceSnapshotId)).toContain(caseOf('SHORTENED').r2);
    });
  }

  it('without the gate the feed fails closed on repeated ids, so even the valid extension disappears (why the gate is required)', () => {
    const ungated = composeFeed(DEMO_STUDENTS[0]!.profile, DEMO_ALL_REVISION_OPPORTUNITIES, {asOf:DEMO_AS_OF, publishedAtBySnapshotId:{...DEMO_PUBLISHED_AT, ...DEMO_REVISION_PUBLISHED_AT}});
    const revisedIds = DEMO_REVISION_CASES.map(c => c.opportunityId).sort();
    expect(ungated.excludedDuplicateIds).toEqual(revisedIds);
    const all = [...ungated.all, ...ungated.ineligible, ...ungated.closed].map(r => r.opportunity.id);
    for (const id of revisedIds) expect(all).not.toContain(id);
    // With the gate the EXTENDED posting is shown again (its r2).
    const gated = composeFeed(DEMO_STUDENTS[0]!.profile, g.usable, opts);
    expect([...gated.all, ...gated.ineligible].map(r => r.opportunity.sourceSnapshotId)).toContain(caseOf('EXTENDED').r2);
  });

  it('corpus coverage now reports the five chains instead of 0', () => {
    const c = corpusCoverage({asOf:DEMO_AS_OF, corpusVersion:'syn-corpus-v1+revisions', opportunities:DEMO_ALL_REVISION_OPPORTUNITIES,
      publishedAtBySnapshotId:DEMO_REVISION_PUBLISHED_AT, notices:DEMO_NOTICES, students:[]});
    expect(c.opportunities.revisionChains).toBe(5);
  });

  it('is independent of revision and item input order', () => {
    const selection = selectCurrentRevisions([...DEMO_REVISIONS].reverse(), DEMO_AS_OF);
    const a = gateBySourceRevision([...DEMO_ALL_REVISION_OPPORTUNITIES].reverse(), selection);
    expect(JSON.stringify(a.quarantined)).toBe(JSON.stringify(g.quarantined));
    expect(a.usable.map(o => o.sourceSnapshotId).sort()).toEqual(g.usable.map(o => o.sourceSnapshotId).sort());
  });
});
