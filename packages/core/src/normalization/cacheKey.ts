import {byCodeUnit} from './dedupe.js';

/**
 * Every version a feed/notice result depends on (A05.3, A13.3, #10 vNext). Changing any of them must
 * produce a different key, so a source correction, claim review or retrieval-config change can never
 * serve a cached result. `projection` + `profile` scope the key to one student's approved view, so
 * two students never share an entry by accident.
 */
export interface ResultCacheParts {
  kind:'FEED'|'NOTICES';
  asOf:string;
  profile:string;
  projection:string;
  consent:string;
  overlay:string;
  topics:string;
  rankConfig:string;
  /** Sorted inside the key; pass the current revisionIds actually used. */
  sourceRevisionIds:readonly string[];
  claimVersion:string;
  retrievalConfigVersion:string;
  /** Academic deficits version for notices (rules/ledger); use 'none' for the feed. */
  academics:string;
}

const REQUIRED = ['kind', 'asOf', 'profile', 'projection', 'consent', 'overlay', 'topics', 'rankConfig',
  'claimVersion', 'retrievalConfigVersion', 'academics'] as const;

/** Deterministic, order-independent key. Throws on a missing version instead of silently sharing. */
export function resultCacheKey(parts:ResultCacheParts):string {
  for (const k of REQUIRED) {
    const v = parts[k];
    if (typeof v !== 'string' || v.trim() === '' || /[|=]/u.test(v)) throw new RangeError(`cache key part '${k}' missing or invalid`);
  }
  const revisions = [...new Set(parts.sourceRevisionIds)].sort(byCodeUnit);
  if (revisions.some(r => r === '' || /[|=,]/u.test(r))) throw new RangeError('invalid sourceRevisionId');
  return [...REQUIRED.map(k => `${k}=${parts[k]}`), `sources=${revisions.join(',')}`].join('|');
}
