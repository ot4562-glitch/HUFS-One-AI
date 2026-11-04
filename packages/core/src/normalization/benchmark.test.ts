import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {OpportunitySchema} from '@hufs-one/contracts';
import {
  NORMALIZATION_STAGES, canonicalCorpusInput, createNormalizationCorpus, measureNormalization,
  runNormalizationStage, seededShuffle, summarizeDurations,
} from './benchmark.js';
import {findDuplicateCandidates} from './dedupe.js';
import {selectCurrentRevisions} from './revisions.js';

const sha = (text:string) => createHash('sha256').update(text).digest('hex');

describe('#201 seeded normalization corpus', () => {
  it('is byte-identical for the same seed/size and differs for another seed', () => {
    const a = createNormalizationCorpus({seed:7, size:400});
    const b = createNormalizationCorpus({seed:7, size:400});
    const c = createNormalizationCorpus({seed:8, size:400});
    expect(canonicalCorpusInput(a)).toBe(canonicalCorpusInput(b));
    expect(JSON.stringify(a.revisions)).toBe(JSON.stringify(b.revisions));
    expect(canonicalCorpusInput(a)).not.toBe(canonicalCorpusInput(c));
    expect(a.revisions).toHaveLength(400);
    expect(a.opportunities).toHaveLength(400);
  });

  it('builds only schema-valid SYNTHETIC opportunities and frozen inputs', () => {
    const corpus = createNormalizationCorpus({seed:1, size:120});
    for (const o of corpus.opportunities) expect(OpportunitySchema.parse(o).dataMode).toBe('SYNTHETIC');
    expect(corpus.revisions.every(r => r.provenance === 'SYNTHETIC')).toBe(true);
    expect(Object.isFrozen(corpus.revisions)).toBe(true);
    expect(Object.isFrozen(corpus.opportunities[0])).toBe(true);
  });

  it('rejects unbounded or malformed sizes and seeds', () => {
    for (const size of [0, 39, 1.5, 200_001]) expect(() => createNormalizationCorpus({seed:1, size})).toThrow(RangeError);
    for (const seed of [-1, 0.5, Number.NaN]) expect(() => createNormalizationCorpus({seed, size:100})).toThrow(RangeError);
  });
});

describe('#201 outputs match independent expectations from the corpus shape', () => {
  const corpus = createNormalizationCorpus({seed:42, size:600});
  const {shape} = corpus;

  it('keeps only the chain head, quarantines forks and revisions unknown at asOf', () => {
    const s = selectCurrentRevisions(corpus.revisions, corpus.asOf);
    const reasons = (prefix:string) => s.quarantined.filter(q => q.revisionId.startsWith(prefix));
    expect(s.current.get('SYN-CHAIN')?.revisionId).toBe(`CHAIN-${String(shape.longChainLength - 1).padStart(6, '0')}`);
    expect(reasons('CHAIN-').every(q => q.reason === 'SUPERSEDED')).toBe(true);
    expect(reasons('CHAIN-')).toHaveLength(shape.longChainLength - 1);
    expect(reasons('FORK-').filter(q => q.reason === 'FORKED_CHAIN')).toHaveLength(2 * shape.forkedSources);
    expect(reasons('FORK-').filter(q => q.reason === 'SUPERSEDED')).toHaveLength(shape.forkedSources);
    expect(reasons('LATE-').map(q => q.reason)).toEqual(Array(shape.lateRevisions).fill('NOT_KNOWN_AT_ASOF'));
    expect([...s.current.keys()].some(k => k.startsWith('SYN-FORK-') || k.startsWith('SYN-LATE-'))).toBe(false);
    // Every revision is accounted for exactly once: usable head or quarantined with one reason.
    expect(s.current.size + s.quarantined.length).toBe(corpus.revisions.length);
  });

  it('never promotes a non-ACTIVE, cancelled, unverified or out-of-window head', () => {
    const s = selectCurrentRevisions(corpus.revisions, corpus.asOf);
    for (const r of s.current.values()) {
      expect(r.status).toBe('ACTIVE');
      expect(r.changeKind).not.toBe('CANCELLED');
      expect(r.lastVerifiedAt).toBeDefined();
      expect(r.validUntil).toBeUndefined();
      expect(r.validFrom).toBeUndefined();
    }
  });

  it('finds the one large duplicate group, merges repeated IDs and keeps delimiter look-alikes apart', () => {
    const groups = findDuplicateCandidates(corpus.opportunities, corpus.sourceUrlBySnapshotId);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(shape.duplicateGroupSize);
    expect(groups[0]!.every(id => id.startsWith('DUP-'))).toBe(true);
    expect(groups.flat().some(id => id.startsWith('LOOK-') || id.startsWith('UNI-'))).toBe(false);
  });
});

describe('#201 determinism is a functional property, not a timing threshold', () => {
  it('produces the same stage outputs for any seeded input order', () => {
    const corpus = createNormalizationCorpus({seed:3, size:300});
    for (const shuffleSeed of [11, 12, 13]) {
      const reordered = {...corpus, revisions:seededShuffle(corpus.revisions, shuffleSeed), opportunities:seededShuffle(corpus.opportunities, shuffleSeed)};
      for (const stage of NORMALIZATION_STAGES) {
        expect(runNormalizationStage(stage, reordered)).toBe(runNormalizationStage(stage, corpus));
      }
    }
  });

  it('measures with an injected clock and reports equality checks with digests', () => {
    let tick = 0;
    const result = measureNormalization({seed:5, size:200, warmup:1, repetitions:3, now:() => (tick += 2), digest:sha});
    const again = measureNormalization({seed:5, size:200, warmup:0, repetitions:1, now:() => 0, digest:sha});
    expect(result.inputDigest).toBe(again.inputDigest);
    for (const stage of NORMALIZATION_STAGES) {
      expect(result.stages[stage]).toMatchObject({stableAcrossRepetitions:true, orderInvariant:true});
      expect(result.stages[stage].outputDigest).toBe(again.stages[stage].outputDigest);
      expect(result.stages[stage].timing).toEqual({samples:3, minMs:2, medianMs:2, p90Ms:2, maxMs:2});
    }
  });

  it('summarizes durations by nearest rank and rejects invalid samples', () => {
    expect(summarizeDurations([5, 1, 3, 2])).toEqual({samples:4, minMs:1, medianMs:2.5, p90Ms:5, maxMs:5});
    expect(summarizeDurations([0.12345])).toMatchObject({medianMs:0.123});
    for (const bad of [[], [Number.NaN], [-1]]) expect(() => summarizeDurations(bad)).toThrow(RangeError);
    expect(() => measureNormalization({seed:1, size:100, warmup:-1, repetitions:1, now:() => 0, digest:sha})).toThrow(RangeError);
    expect(() => measureNormalization({seed:1, size:100, warmup:0, repetitions:0, now:() => 0, digest:sha})).toThrow(RangeError);
  });
});
