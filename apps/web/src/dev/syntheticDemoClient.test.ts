import {describe, expect, it} from 'vitest';
import {isSnapshotCurrent, type DemoSnapshot, type SubjectAlias} from '@hufs-one/contracts';
import {DEMO_AS_OF} from '../../../../packages/core/src/opportunities/index.js';
import {DemoController, type DemoClientPort} from '../app/index.js';
import {SyntheticDemoClient} from './syntheticDemoClient.js';
import {buildSyntheticSubjects} from './syntheticCorpus.js';

const ids = (s: DemoSnapshot) => [...s.feed.featured, ...s.feed.compact].map(c => c.opportunityId);

describe('synthetic dev client: each subject has its own generated data (#68 review P1)', () => {
  const subjects = buildSyntheticSubjects();

  it('S01–S05 snapshots are distinct per subject, all at the single DEMO_AS_OF', () => {
    const all = [...subjects.entries()];
    expect(all.map(([s]) => s)).toEqual(['S01', 'S02', 'S03', 'S04', 'S05']);
    for (const [subject, d] of all) {
      expect(d.snapshot.demoSubjectId).toBe(subject);
      expect(d.snapshot.datasetMode).toBe('SYNTHETIC');
      expect(d.snapshot.asOf).toBe(DEMO_AS_OF);
      expect(d.calendar.asOf).toBe(DEMO_AS_OF);
      expect(d.snapshot.versions.profile.endsWith(':' + subject)).toBe(true);
    }
    const s1 = subjects.get('S01')!.snapshot, s2 = subjects.get('S02')!.snapshot;
    expect(ids(s1)).not.toEqual(ids(s2));
    expect(s1.feed.featured[0]!.opportunityId).not.toBe(s2.feed.featured[0]!.opportunityId);
    expect(JSON.stringify(s1.notices)).not.toBe(JSON.stringify(s2.notices));
  });

  it('a context is bound to one subject: its snapshot is that subject\'s content, never another\'s', async () => {
    const client = new SyntheticDemoClient({delayMs: 0});
    const c1 = await client.createContext('S01', 'RUN', undefined);
    const c2 = await client.createContext('S02', 'RUN', undefined);
    const [r1, r2] = [await client.getSnapshot(c1.contextId), await client.getSnapshot(c2.contextId)];
    expect(r1.demoSubjectId).toBe('S01');
    expect(r2.demoSubjectId).toBe('S02');
    expect(ids(r2)).toEqual(ids(subjects.get('S02')!.snapshot));
    expect(ids(r2)).not.toEqual(ids(r1));
    for (const [ctx, snap] of [[c1, r1], [c2, r2]] as const)
      expect(isSnapshotCurrent(snap, {context: ctx, selectionEpoch: 1, currentSelectionEpoch: 1})).toBe(true);
    // Cross-pairing fails the client-side guard.
    expect(isSnapshotCurrent(r1, {context: c2, selectionEpoch: 1, currentSelectionEpoch: 1})).toBe(false);
  });

  it('labels come from each subject; S05 stays PENDING and not selectable', async () => {
    const profiles = await new SyntheticDemoClient({delayMs: 0}).listProfiles();
    expect(profiles.map(p => p.displayLabel)).toEqual([...subjects.values()].map(s => s.label));
    expect(profiles[4]!.readiness).toBe('PENDING');
    expect(profiles[4]!.allowedSections).toEqual([]);
  });

  it('DemoController rejects a snapshot from a stale dataset/projection version for the context', async () => {
    class StaleClient extends SyntheticDemoClient {
      override async getSnapshot(contextId: string): Promise<DemoSnapshot> {
        const s = await super.getSnapshot(contextId);
        return {...s, versions: {...s.versions, dataset: 'syn-corpus-v0'}};
      }
    }
    const controller = new DemoController(new StaleClient({delayMs: 0}) as DemoClientPort, 'RUN');
    await controller.loadProfiles();
    await controller.select('S02' as SubjectAlias);
    expect(controller.getState().status).toBe('CONFLICT');
    expect(controller.getState().snapshot).toBeNull();
  });

  it("each context's calendar is that subject's own (S01 ≠ S02), at the snapshot asOf", async () => {
    const client = new SyntheticDemoClient({delayMs: 0});
    const c1 = await client.createContext('S01', 'RUN'), c2 = await client.createContext('S02', 'RUN');
    const [k1, k2] = [await client.getCalendar(c1.contextId), await client.getCalendar(c2.contextId)];
    expect(k1).toEqual(subjects.get('S01')!.calendar);
    expect(k2).toEqual(subjects.get('S02')!.calendar);
    expect(k1.entries.map(e => e.id)).not.toEqual(k2.entries.map(e => e.id));
    expect(k1.asOf).toBe((await client.getSnapshot(c1.contextId)).asOf);
  });

  it('unknown or cleared contexts are refused (403), e.g. after logout', async () => {
    const client = new SyntheticDemoClient({delayMs: 0});
    const c = await client.createContext('S01', 'RUN');
    await client.logout();
    await expect(client.getSnapshot(c.contextId)).rejects.toMatchObject({code: 'FORBIDDEN'});
  });
});
