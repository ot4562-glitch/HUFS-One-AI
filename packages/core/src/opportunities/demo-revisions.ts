import {OpportunitySchema, type Opportunity} from '@hufs-one/contracts';
import {gateBySourceRevision, selectCurrentRevisions, type RevisionRecord, type RevisionSelection} from '../normalization/revisions.js';
import {DEMO_AS_OF, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT} from './demo-corpus.js';

/**
 * #10 correction / cancel / extension chains for the 40-item SYNTHETIC corpus. DEMO_OPPORTUNITIES itself
 * stays unchanged (every r1); this overlay adds an r2 for five postings so feed and evaluation code can be
 * exercised on the same corpus through the SourceRevision gate. Dates are relative to DEMO_AS_OF.
 */
const DAY = 86_400_000;
const at = (days:number) => new Date(Date.parse(DEMO_AS_OF) + days * DAY).toISOString();
const byId = new Map(DEMO_OPPORTUNITIES.map(o => [o.id, o]));
const src = (n:number) => `SYN-SRC-${String(n).padStart(3, '0')}`;

export type DemoRevisionScenario = 'EXTENDED'|'CANCELLED'|'UNREVIEWED_CORRECTION'|'SHORTENED'|'CORRECTION_AFTER_AS_OF';
interface Spec {n:number; scenario:DemoRevisionScenario; fetched:number; verified?:number; changeKind:RevisionRecord['changeKind'];
  patch:(o:Opportunity) => Partial<Opportunity>}

const SPECS:readonly Spec[] = [
  // 18 → 25 days: still OPEN, later deadline must be the one shown.
  {n:2, scenario:'EXTENDED', fetched:-1, verified:-1, changeKind:'EXTENDED', patch:() => ({applyClosesAt:at(25)})},
  // Cancelled: neither r1 nor r2 may reach the feed.
  {n:7, scenario:'CANCELLED', fetched:-1, verified:-1, changeKind:'CANCELLED', patch:() => ({})},
  // Correction adds an enrollment condition but is not reviewed yet: quarantined, r1 never comes back.
  {n:14, scenario:'UNREVIEWED_CORRECTION', fetched:-1, changeKind:'CORRECTED',
    patch:o => ({conditions:[{field:'enrollment', operator:'EQ', value:'ENROLLED', evidenceId:`EV-${o.id}-C1`}]})},
  // 26 → -1 days: the corrected deadline has already passed, so the item is CLOSED.
  {n:21, scenario:'SHORTENED', fetched:-2, verified:-2, changeKind:'CORRECTED', patch:() => ({applyClosesAt:at(-1)})},
  // Fetched after DEMO_AS_OF: not knowable in a past view, r1 stays current.
  {n:24, scenario:'CORRECTION_AFTER_AS_OF', fetched:2, verified:2, changeKind:'EXTENDED', patch:() => ({applyClosesAt:at(30)})},
];

const r1 = (o:Opportunity):RevisionRecord => ({
  revisionId:o.sourceSnapshotId, sourceId:o.sourceSnapshotId.replace(/-r1$/u, ''), status:'ACTIVE', changeKind:'NEW',
  provenance:'SYNTHETIC', permissionRef:'SYN-PERMISSION', publishedAt:DEMO_PUBLISHED_AT[o.sourceSnapshotId]!,
  fetchedAt:DEMO_PUBLISHED_AT[o.sourceSnapshotId]!, lastVerifiedAt:DEMO_PUBLISHED_AT[o.sourceSnapshotId]!,
});

export interface DemoRevisionCase {opportunityId:string; scenario:DemoRevisionScenario; r1:string; r2:string}

export const DEMO_REVISION_CASES:readonly DemoRevisionCase[] = SPECS.map(s => ({
  opportunityId:`SYN-OPP-${String(s.n).padStart(3, '0')}`, scenario:s.scenario, r1:`${src(s.n)}-r1`, r2:`${src(s.n)}-r2`,
}));

/** r2 Opportunity objects (same id, new version/sourceSnapshotId). */
export const DEMO_REVISED_OPPORTUNITIES:readonly Opportunity[] = SPECS.map(s => {
  const o = byId.get(`SYN-OPP-${String(s.n).padStart(3, '0')}`)!;
  return OpportunitySchema.parse({...o, ...s.patch(o), version:'v2', sourceSnapshotId:`${src(s.n)}-r2`});
});

/** r1 for all 40 postings plus the r2 of each scenario. */
export const DEMO_REVISIONS:readonly RevisionRecord[] = [
  ...DEMO_OPPORTUNITIES.map(r1),
  ...SPECS.map((s):RevisionRecord => ({
    revisionId:`${src(s.n)}-r2`, sourceId:src(s.n), supersedes:`${src(s.n)}-r1`, status:'ACTIVE', changeKind:s.changeKind,
    provenance:'SYNTHETIC', permissionRef:'SYN-PERMISSION', publishedAt:at(s.fetched), fetchedAt:at(s.fetched),
    ...(s.verified === undefined ? {} : {lastVerifiedAt:at(s.verified)}),
  })),
];

/** r1 and r2 objects together, keyed by sourceSnapshotId = revisionId (one snapshot = one immutable revision). */
export const DEMO_ALL_REVISION_OPPORTUNITIES:readonly Opportunity[] = [...DEMO_OPPORTUNITIES, ...DEMO_REVISED_OPPORTUNITIES];

/** Publication times for r1 and r2 snapshots, for ranking freshness. */
export const DEMO_REVISION_PUBLISHED_AT:Readonly<Record<string, string>> = Object.fromEntries(
  DEMO_REVISIONS.map(r => [r.revisionId, r.publishedAt!]));

/** The corpus as seen at `asOf` through the SourceRevision gate: usable items and quarantined revisions. */
export function gatedDemoCorpus(asOf:string = DEMO_AS_OF):{selection:RevisionSelection; usable:Opportunity[]; quarantined:{id:string; revisionId:string; reason:string}[]} {
  const selection = selectCurrentRevisions(DEMO_REVISIONS, asOf);
  const gated = gateBySourceRevision(DEMO_ALL_REVISION_OPPORTUNITIES, selection);
  return {selection, usable:gated.usable, quarantined:gated.quarantined};
}
