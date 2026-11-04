import type {Opportunity} from '@hufs-one/contracts';
import {byCodeUnit, findDuplicateCandidates} from './dedupe.js';
import {gateBySourceRevision, selectCurrentRevisions, type RevisionRecord, type RevisionSelection} from './revisions.js';

/**
 * #201 reproducible synthetic normalization benchmark.
 *
 * Pure: no clock, randomness, I/O or hashing of its own. The runner injects `now()` and `digest()`,
 * so the same seed/size always yields byte-identical inputs and outputs. Timings are only a trend
 * signal for one machine; they are never a production p95 and CI must not fail on wall-clock alone.
 * Every record is SYNTHETIC and carries no real student, notice or institution data.
 */

export const NORMALIZATION_BENCHMARK_VERSION = 'normalization-benchmark-v1';
export const NORMALIZATION_BENCHMARK_AS_OF = '2026-11-03T00:00:00.000Z';

export interface NormalizationCorpus {
  seed:number;
  size:number;
  asOf:string;
  revisions:readonly RevisionRecord[];
  opportunities:readonly Opportunity[];
  sourceUrlBySnapshotId:Readonly<Record<string, string|undefined>>;
  /** What the generator built, so tests can check outputs against independent expectations. */
  shape:CorpusShape;
}

export interface CorpusShape {
  longChainLength:number;
  independentSources:number;
  forkedSources:number;
  lateRevisions:number;
  duplicateGroupSize:number;
  repeatedOpportunityIds:number;
  delimiterLookalikePairs:number;
  uniqueOpportunities:number;
}

/** mulberry32: tiny deterministic PRNG, identical on every JS engine. */
function prng(seed:number):() => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n:number) => String(n).padStart(6, '0');
const DAY = 86_400_000;
const iso = (ms:number) => new Date(ms).toISOString();
const AS_OF_MS = Date.parse(NORMALIZATION_BENCHMARK_AS_OF);

/** Deterministic Fisher–Yates using the seeded PRNG; returns a new array. */
export function seededShuffle<T>(items:readonly T[], seed:number):T[] {
  const out = [...items];
  const next = prng(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function syntheticOpportunity(id:string, snapshot:string, organization:string, title:string, closesAt:string):Opportunity {
  return {
    id, version:'v1', sourceSnapshotId:snapshot, title, organization, kind:'CONTEST',
    topicCodes:[], languageCodes:[], applyClosesAt:closesAt, eventSessions:[],
    actualApplicationRoute:'DEMO_DISABLED', conditions:[], roleSteps:[], prioritySelection:[], completionRules:[],
    dataMode:'SYNTHETIC', dataQuality:'COMPLETE',
  } as Opportunity;
}

/**
 * Builds `size` revisions and `size` opportunities with the distinct shapes #201 asks for:
 * one long correction chain, many independent sources (with retracted/stale/cancelled/expired/
 * unverified/not-yet-valid heads), forked chains, revisions fetched after asOf, one large duplicate
 * group, repeated IDs, delimiter look-alikes that must not collide, and unique notices.
 */
export function createNormalizationCorpus(options:{seed:number; size:number}):NormalizationCorpus {
  const {seed, size} = options;
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('seed must be a non-negative safe integer');
  if (!Number.isSafeInteger(size) || size < 40 || size > 200_000) throw new RangeError('size must be an integer in [40, 200000]');
  const next = prng(seed);
  const pick = <T>(xs:readonly T[]):T => xs[Math.floor(next() * xs.length)]!;

  // ---- revisions: chain 1/3, forks 1/20 (two heads each), late 1/20, rest independent sources.
  const revisions:RevisionRecord[] = [];
  const base = {provenance:'SYNTHETIC', permissionRef:'SYN-PERMISSION'} as const;
  const longChainLength = Math.floor(size / 3);
  for (let i = 0; i < longChainLength; i += 1) {
    revisions.push({
      ...base, revisionId:`CHAIN-${pad(i)}`, sourceId:'SYN-CHAIN',
      ...(i ? {supersedes:`CHAIN-${pad(i - 1)}`} : {}),
      status:'ACTIVE', changeKind:i ? 'CORRECTED' : 'NEW',
      fetchedAt:iso(AS_OF_MS - (longChainLength - i) * 60_000), lastVerifiedAt:iso(AS_OF_MS - DAY / 2),
    });
  }
  const forkedSources = Math.floor(size / 40);
  for (let i = 0; i < forkedSources; i += 1) {
    const sourceId = `SYN-FORK-${pad(i)}`;
    const root = `FORK-${pad(i)}-R`;
    revisions.push({...base, revisionId:root, sourceId, status:'ACTIVE', changeKind:'NEW', fetchedAt:iso(AS_OF_MS - 3 * DAY), lastVerifiedAt:iso(AS_OF_MS - 2 * DAY)});
    for (const side of ['A', 'B']) {
      revisions.push({...base, revisionId:`FORK-${pad(i)}-${side}`, sourceId, supersedes:root, status:'ACTIVE', changeKind:'CORRECTED', fetchedAt:iso(AS_OF_MS - DAY), lastVerifiedAt:iso(AS_OF_MS - DAY)});
    }
  }
  const lateRevisions = Math.floor(size / 20);
  for (let i = 0; i < lateRevisions; i += 1) {
    revisions.push({...base, revisionId:`LATE-${pad(i)}`, sourceId:`SYN-LATE-${pad(i)}`, status:'ACTIVE', changeKind:'NEW', fetchedAt:iso(AS_OF_MS + (i + 1) * 60_000), lastVerifiedAt:iso(AS_OF_MS + DAY)});
  }
  const independentSources = size - revisions.length;
  const variants = ['OK', 'OK', 'OK', 'RETRACTED', 'STALE', 'CANCELLED', 'EXPIRED', 'UNVERIFIED', 'NOT_YET_VALID'] as const;
  for (let i = 0; i < independentSources; i += 1) {
    const v = pick(variants);
    revisions.push({
      ...base, revisionId:`IND-${pad(i)}`, sourceId:`SYN-IND-${pad(i)}`,
      status:v === 'RETRACTED' ? 'RETRACTED' : v === 'STALE' ? 'STALE' : 'ACTIVE',
      changeKind:v === 'CANCELLED' ? 'CANCELLED' : 'NEW',
      // Equal fetchedAt across many sources exercises tie ordering.
      fetchedAt:iso(AS_OF_MS - (1 + (i % 7)) * DAY),
      ...(v === 'UNVERIFIED' ? {} : {lastVerifiedAt:iso(AS_OF_MS - DAY)}),
      ...(v === 'EXPIRED' ? {validUntil:iso(AS_OF_MS - 1)} : {}),
      ...(v === 'NOT_YET_VALID' ? {validFrom:iso(AS_OF_MS + DAY)} : {}),
    });
  }

  // ---- opportunities: duplicate group 1/3, repeated IDs 1/20, look-alike pairs 1/20, rest unique.
  const opportunities:Opportunity[] = [];
  const sourceUrlBySnapshotId:Record<string, string|undefined> = {};
  const closes = '2026-12-01T00:00:00.000Z';
  const duplicateGroupSize = Math.floor(size / 3);
  for (let i = 0; i < duplicateGroupSize; i += 1) {
    const snapshot = `SNAP-DUP-${pad(i)}`;
    // Cosmetic URL/whitespace/case differences must still normalize to one key.
    sourceUrlBySnapshotId[snapshot] = i % 2 ? 'https://EXAMPLE.org/demo/dup/#top' : 'https://example.org/demo/dup';
    opportunities.push(syntheticOpportunity(`DUP-${pad(i)}`, snapshot, i % 3 ? '시연가상기관 A' : ' 시연가상기관   A ', '가상 데이터 공모전', closes));
  }
  const repeatedOpportunityIds = Math.floor(size / 20);
  for (let i = 0; i < repeatedOpportunityIds; i += 1) {
    opportunities.push(syntheticOpportunity(`DUP-${pad(i)}`, `SNAP-DUP-${pad(i)}`, '시연가상기관 A', '가상 데이터 공모전', closes));
  }
  const delimiterLookalikePairs = Math.floor(size / 40);
  for (let i = 0; i < delimiterLookalikePairs; i += 1) {
    opportunities.push(syntheticOpportunity(`LOOK-${pad(i)}-A`, `SNAP-LOOK-${pad(i)}-A`, `가상기관 ${i}|랩`, '공모', closes));
    opportunities.push(syntheticOpportunity(`LOOK-${pad(i)}-B`, `SNAP-LOOK-${pad(i)}-B`, `가상기관 ${i}`, '랩|공모', closes));
  }
  const uniqueOpportunities = size - opportunities.length;
  for (let i = 0; i < uniqueOpportunities; i += 1) {
    const day = 1 + Math.floor(next() * 28);
    opportunities.push(syntheticOpportunity(`UNI-${pad(i)}`, `SNAP-UNI-${pad(i)}`, `가상기관 ${pad(i)}`, `가상 공고 ${pad(i)}`, `2026-12-${String(day).padStart(2, '0')}T00:00:00.000Z`));
  }

  return {
    seed, size, asOf:NORMALIZATION_BENCHMARK_AS_OF,
    revisions:Object.freeze(seededShuffle(revisions, seed ^ 0x5EED).map(r => Object.freeze(r))),
    opportunities:Object.freeze(seededShuffle(opportunities, seed ^ 0xD0D0).map(o => Object.freeze(o))),
    sourceUrlBySnapshotId:Object.freeze(sourceUrlBySnapshotId),
    shape:{longChainLength, independentSources, forkedSources, lateRevisions, duplicateGroupSize, repeatedOpportunityIds, delimiterLookalikePairs, uniqueOpportunities},
  };
}

/** Canonical, order-independent text of a corpus input (for the input digest). */
export function canonicalCorpusInput(corpus:NormalizationCorpus):string {
  const revisions = [...corpus.revisions].map(r => JSON.stringify(Object.entries(r).sort(([a], [b]) => byCodeUnit(a, b)))).sort(byCodeUnit);
  const opportunities = [...corpus.opportunities].map(o => JSON.stringify([o.id, o.sourceSnapshotId, o.organization, o.title, o.applyOpensAt ?? null, o.applyClosesAt ?? null])).sort(byCodeUnit);
  const urls = Object.entries(corpus.sourceUrlBySnapshotId).sort(([a], [b]) => byCodeUnit(a, b));
  return JSON.stringify({v:NORMALIZATION_BENCHMARK_VERSION, asOf:corpus.asOf, revisions, opportunities, urls});
}

export const canonicalRevisionSelection = (s:RevisionSelection):string => JSON.stringify({
  current:[...s.current.entries()].map(([sourceId, r]) => [sourceId, r.revisionId]).sort((a, b) => byCodeUnit(a[0]!, b[0]!)),
  quarantined:s.quarantined,
});

export type NormalizationStage = 'revisionSelection'|'revisionGate'|'duplicateCandidates';
export const NORMALIZATION_STAGES:readonly NormalizationStage[] = ['revisionSelection', 'revisionGate', 'duplicateCandidates'];

/** Runs one stage and returns its canonical output text. Inputs are never mutated (they are frozen). */
export function runNormalizationStage(stage:NormalizationStage, corpus:NormalizationCorpus, selection?:RevisionSelection):string {
  switch (stage) {
    case 'revisionSelection':
      return canonicalRevisionSelection(selectCurrentRevisions(corpus.revisions, corpus.asOf));
    case 'revisionGate': {
      const gated = gateBySourceRevision(
        corpus.revisions.map(r => ({id:`ITEM-${r.revisionId}`, sourceSnapshotId:r.revisionId})),
        selection ?? selectCurrentRevisions(corpus.revisions, corpus.asOf),
      );
      return JSON.stringify({usable:gated.usable.map(i => i.id).sort(byCodeUnit), quarantined:gated.quarantined});
    }
    case 'duplicateCandidates':
      return JSON.stringify(findDuplicateCandidates(corpus.opportunities, corpus.sourceUrlBySnapshotId));
  }
}

export interface Distribution {samples:number; minMs:number; medianMs:number; p90Ms:number; maxMs:number}

/** Nearest-rank summary of durations; deterministic for a given list. */
export function summarizeDurations(durations:readonly number[]):Distribution {
  if (!durations.length || durations.some(d => !Number.isFinite(d) || d < 0)) throw new RangeError('durations must be non-empty finite non-negative numbers');
  const s = [...durations].sort((a, b) => a - b);
  const rank = (q:number) => s[Math.max(0, Math.ceil(q * s.length) - 1)]!;
  const mid = s.length >> 1;
  const median = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  const r = (x:number) => Math.round(x * 1000) / 1000;
  return {samples:s.length, minMs:r(s[0]!), medianMs:r(median), p90Ms:r(rank(0.9)), maxMs:r(s.at(-1)!)};
}

export interface StageMeasurement {outputDigest:string; orderInvariant:boolean; stableAcrossRepetitions:boolean; timing:Distribution}
export interface SizeMeasurement {seed:number; size:number; asOf:string; shape:CorpusShape; inputDigest:string; stages:Record<NormalizationStage, StageMeasurement>}

/**
 * Measures every stage after `warmup` untimed runs. A stage is reported as correct only when every
 * repetition produced the same output and a seeded re-ordering of the input produced it as well;
 * a speed number without that equality is not comparable and the runner must reject it.
 */
export function measureNormalization(options:{
  seed:number; size:number; warmup:number; repetitions:number;
  now:() => number; digest:(text:string) => string;
}):SizeMeasurement {
  const {seed, size, warmup, repetitions, now, digest} = options;
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new RangeError('warmup must be a non-negative integer');
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) throw new RangeError('repetitions must be a positive integer');
  const corpus = createNormalizationCorpus({seed, size});
  const reordered:NormalizationCorpus = {
    ...corpus,
    revisions:Object.freeze(seededShuffle(corpus.revisions, seed + 1)),
    opportunities:Object.freeze(seededShuffle(corpus.opportunities, seed + 2)),
  };
  const selection = selectCurrentRevisions(corpus.revisions, corpus.asOf);
  const stages = {} as Record<NormalizationStage, StageMeasurement>;
  for (const stage of NORMALIZATION_STAGES) {
    for (let i = 0; i < warmup; i += 1) runNormalizationStage(stage, corpus, selection);
    const durations:number[] = [];
    const outputs = new Set<string>();
    for (let i = 0; i < repetitions; i += 1) {
      const start = now();
      const out = runNormalizationStage(stage, corpus, stage === 'revisionGate' ? selection : undefined);
      durations.push(now() - start);
      outputs.add(out);
    }
    const [first] = outputs;
    const reorderedOut = runNormalizationStage(stage, reordered);
    stages[stage] = {
      outputDigest:digest(first!),
      stableAcrossRepetitions:outputs.size === 1,
      orderInvariant:reorderedOut === first,
      timing:summarizeDurations(durations),
    };
  }
  return {seed, size, asOf:corpus.asOf, shape:corpus.shape, inputDigest:digest(canonicalCorpusInput(corpus)), stages};
}
