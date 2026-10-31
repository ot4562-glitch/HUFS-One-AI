import {byCodeUnit} from './dedupe.js';

/**
 * Structural subset of contracts vNext `SourceRevisionVNext` (TASK-18, PR #33). Declared here so the
 * core does not depend on an unmerged contract; a parsed SourceRevisionVNext satisfies it as-is.
 * The core cannot check permission, reviewer authority or truth — the API must pass only revisions
 * it loaded from the permission-checked source ledger (#19/#27).
 */
export interface RevisionRecord {
  revisionId:string;
  sourceId:string;
  supersedes?:string;
  status:'ACTIVE'|'NEEDS_REVIEW'|'STALE'|'RETRACTED'|'BLOCKED_RIGHTS';
  changeKind:'NEW'|'CORRECTED'|'EXTENDED'|'CANCELLED'|'UNKNOWN';
  provenance:'REAL_APPROVED'|'SYNTHETIC'|'RESEARCH_ONLY';
  permissionRef:string;
  publishedAt?:string;
  fetchedAt:string;
  lastVerifiedAt?:string;
  validFrom?:string;
  validUntil?:string;
}

export type RevisionReason =
  | 'NOT_KNOWN_AT_ASOF'   // fetched after asOf: the system could not have known it
  | 'SUPERSEDED'          // an older revision: its claims are never republished
  | 'FORKED_CHAIN'        // two current heads for one source: conflict, quarantine the source
  | 'NOT_ACTIVE'          // NEEDS_REVIEW / STALE / RETRACTED / BLOCKED_RIGHTS
  | 'CANCELLED'
  | 'UNVERIFIED'          // no independent verification at or before asOf
  | 'RESEARCH_ONLY'
  | 'FUTURE_PUBLICATION'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'INVALID_TIME';

export interface RevisionQuarantine {revisionId:string; sourceId:string; reason:RevisionReason; status?:RevisionRecord['status']}

export interface RevisionSelection {
  /** sourceId → the single usable current revision at asOf. */
  current:ReadonlyMap<string, RevisionRecord>;
  /** Every revision not usable at asOf, with the first failing reason (sorted, byte-stable). */
  quarantined:RevisionQuarantine[];
}

const t = (iso:string|undefined) => (iso === undefined ? undefined : Date.parse(iso));
const bad = (iso:string|undefined) => iso !== undefined && !Number.isFinite(Date.parse(iso));

function headReason(r:RevisionRecord, now:number):RevisionReason|undefined {
  if ([r.publishedAt, r.lastVerifiedAt, r.validFrom, r.validUntil].some(bad)) return 'INVALID_TIME';
  if (r.changeKind === 'CANCELLED') return 'CANCELLED';
  if (r.status !== 'ACTIVE') return 'NOT_ACTIVE';
  if (r.provenance === 'RESEARCH_ONLY') return 'RESEARCH_ONLY';
  const verified = t(r.lastVerifiedAt);
  if (verified === undefined || verified > now) return 'UNVERIFIED';
  const published = t(r.publishedAt);
  if (published !== undefined && published > now) return 'FUTURE_PUBLICATION';
  const from = t(r.validFrom);
  if (from !== undefined && from > now) return 'NOT_YET_VALID';
  const until = t(r.validUntil);
  if (until !== undefined && until <= now) return 'EXPIRED';
  return undefined;
}

/**
 * Picks, per source, the latest revision known at asOf and keeps it only if it is ACTIVE, verified,
 * not cancelled and inside its validity window. Pure: no clock, network or randomness.
 */
export function selectCurrentRevisions(revisions:readonly RevisionRecord[], asOf:string):RevisionSelection {
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) throw new RangeError('asOf must be an ISO datetime');
  const quarantined:RevisionQuarantine[] = [];
  const known:RevisionRecord[] = [];
  for (const r of revisions) {
    const fetched = Date.parse(r.fetchedAt);
    if (!Number.isFinite(fetched)) quarantined.push({revisionId:r.revisionId, sourceId:r.sourceId, reason:'INVALID_TIME'});
    else if (fetched > now) quarantined.push({revisionId:r.revisionId, sourceId:r.sourceId, reason:'NOT_KNOWN_AT_ASOF'});
    else known.push(r);
  }
  const bySource = new Map<string, RevisionRecord[]>();
  for (const r of known) bySource.set(r.sourceId, [...(bySource.get(r.sourceId) ?? []), r]);

  const current = new Map<string, RevisionRecord>();
  for (const [sourceId, list] of bySource) {
    const superseded = new Set(list.map(r => r.supersedes).filter((x):x is string => x !== undefined));
    const heads = list.filter(r => !superseded.has(r.revisionId));
    for (const r of list) if (superseded.has(r.revisionId)) quarantined.push({revisionId:r.revisionId, sourceId, reason:'SUPERSEDED'});
    if (heads.length !== 1) {
      for (const r of heads) quarantined.push({revisionId:r.revisionId, sourceId, reason:'FORKED_CHAIN'});
      continue;
    }
    const head = heads[0]!;
    const reason = headReason(head, now);
    if (reason) quarantined.push({revisionId:head.revisionId, sourceId, reason, status:head.status});
    else current.set(sourceId, head);
  }
  quarantined.sort((a, b) => byCodeUnit(a.sourceId, b.sourceId) || byCodeUnit(a.revisionId, b.revisionId));
  return {current, quarantined};
}

export interface Gated<T> {usable:T[]; quarantined:{id:string; revisionId:string; reason:RevisionReason|'UNKNOWN_REVISION'}[]}

/**
 * Keeps only items whose revision is the usable current one. Opportunity.sourceSnapshotId /
 * Notice.sourceSnapshotId must carry the revisionId (one snapshot = one immutable revision).
 * An unknown revision is quarantined, never assumed current.
 */
export function gateBySourceRevision<T extends {id:string; sourceSnapshotId:string}>(
  items:readonly T[], selection:RevisionSelection,
):Gated<T> {
  const usableIds = new Set([...selection.current.values()].map(r => r.revisionId));
  const reasonById = new Map(selection.quarantined.map(q => [q.revisionId, q.reason]));
  const usable:T[] = [];
  const quarantined:Gated<T>['quarantined'] = [];
  for (const item of items) {
    if (usableIds.has(item.sourceSnapshotId)) usable.push(item);
    else quarantined.push({id:item.id, revisionId:item.sourceSnapshotId, reason:reasonById.get(item.sourceSnapshotId) ?? 'UNKNOWN_REVISION'});
  }
  quarantined.sort((a, b) => byCodeUnit(a.id, b.id));
  return {usable, quarantined};
}
