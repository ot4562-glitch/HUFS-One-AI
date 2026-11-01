import {describe, it, expect} from 'vitest';
import {DemoSnapshotSchema} from '@hufs-one/contracts';
import {DEMO_AS_OF, DEMO_STUDENTS, buildDemoSnapshot, buildDemoSnapshots} from './index.js';

// The REVIEWER client (apps/web api-client) only renders SYN-* ids with EV-SYN-* evidence.
const synthetic = (refs:readonly string[]) => refs.every(r => r.startsWith('EV-SYN-'));

describe('generated SYNTHETIC DemoSnapshot views of the demo corpus (#61)', () => {
  const snaps = buildDemoSnapshots();

  it('builds one schema-valid snapshot per student at the single DEMO_AS_OF', () => {
    expect(snaps.map(s => s.demoSubjectId)).toEqual(['S01', 'S02', 'S03', 'S04', 'S05']);
    for (const s of snaps) {
      expect(DemoSnapshotSchema.safeParse(JSON.parse(JSON.stringify(s))).success).toBe(true);
      expect(s).toMatchObject({datasetMode:'SYNTHETIC', asOf:DEMO_AS_OF, aiProvenance:'NONE'});
      expect([s.feed.asOf, s.notices.asOf]).toEqual([DEMO_AS_OF, DEMO_AS_OF]);
      expect(s.versions.rankConfig).toBe('rank-v1.0');
      expect(s.academics).toEqual({state:'PENDING'}); // academics track owns real summaries
    }
  });

  it('passes the REVIEWER synthetic-only rendering rules (SYN-* ids, EV-SYN-* evidence)', () => {
    for (const s of snaps) {
      const cards = [...s.feed.featured, ...s.feed.compact];
      expect(cards.length).toBeGreaterThan(0);
      for (const c of cards) {
        expect(c.opportunityId.startsWith('SYN-')).toBe(true);
        expect(c.dataMode).toBe('SYNTHETIC');
        expect(synthetic(c.evidenceRefs)).toBe(true);
      }
      for (const n of s.notices.items) {
        expect(n.noticeId.startsWith('SYN-')).toBe(true);
        expect(synthetic(n.evidenceRefs)).toBe(true);
      }
    }
  });

  it('students differ by their inputs, not by hard-coding', () => {
    const top = snaps.map(s => s.feed.featured.map(c => c.opportunityId).join(','));
    expect(new Set(top).size).toBe(5);
  });

  it('is byte-stable across calls', () => {
    expect(JSON.stringify(buildDemoSnapshots())).toBe(JSON.stringify(snaps));
  });

  it('respects partial sharing: ACADEMICS / EXPERIENCE unshared change the scope and hide derived signals', () => {
    const s03 = DEMO_STUDENTS.find(s => s.subject === 'S03')!;
    const full = buildDemoSnapshot(s03);
    const partial = buildDemoSnapshot(s03, {sharedSections:['FEED', 'NOTICES']});
    expect(partial.academics).toEqual({state:'NOT_SHARED'});
    expect(partial.forecast).toEqual({state:'NOT_SHARED'});
    expect(partial.versions.projection).not.toBe(full.versions.projection);
    // S03's verified 2026-2 graduation-exam notice is applicable only when academics are shared.
    expect(full.notices.items.find(n => n.noticeId === 'SYN-NOT-003')?.appliesTo).toBe('YES');
    expect(partial.notices.items.find(n => n.noticeId === 'SYN-NOT-003')?.appliesTo).toBe('UNKNOWN');
    expect(() => buildDemoSnapshot(s03, {sharedSections:['FEED']})).toThrow(RangeError);
  });
});
