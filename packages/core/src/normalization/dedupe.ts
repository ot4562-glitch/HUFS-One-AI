import type {Opportunity} from '@hufs-one/contracts';
import {canonicalTerm} from './topics.js';

function canonicalUrl(raw:string|undefined):string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/u, '')}${u.search}`;
  } catch {
    return canonicalTerm(raw).toLowerCase();
  }
}

/**
 * A05.1 dedupeKey: normalized sourceURL / organizer / title / apply dates.
 * Apply dates are part of the key, so a re-posted notice with changed dates is NOT a duplicate.
 */
export function opportunityDedupeKey(opportunity:Opportunity, sourceUrl?:string):string {
  return [
    canonicalUrl(sourceUrl),
    canonicalTerm(opportunity.organization).toLowerCase(),
    canonicalTerm(opportunity.title).toLowerCase(),
    opportunity.applyOpensAt ?? '',
    opportunity.applyClosesAt ?? '',
  ].join('|');
}

/**
 * Suggests duplicate groups (ids sorted) for human review. Never merges or drops anything.
 * `sourceUrlBySnapshotId` maps Opportunity.sourceSnapshotId → SourceSnapshot.sourceUrl.
 */
export function findDuplicateCandidates(
  opportunities:readonly Opportunity[],
  sourceUrlBySnapshotId:Readonly<Record<string, string|undefined>> = {},
):string[][] {
  const groups = new Map<string, string[]>();
  for (const o of opportunities) {
    const key = opportunityDedupeKey(o, sourceUrlBySnapshotId[o.sourceSnapshotId]);
    const ids = groups.get(key) ?? [];
    if (!ids.includes(o.id)) ids.push(o.id);
    groups.set(key, ids);
  }
  return [...groups.values()]
    .filter(ids => ids.length > 1)
    .map(ids => [...ids].sort(byCodeUnit))
    .sort((a, b) => byCodeUnit(a[0]!, b[0]!));
}

/** Locale-independent ordering so results are byte-stable on every machine. */
export function byCodeUnit(a:string, b:string):number {
  return a < b ? -1 : a > b ? 1 : 0;
}
