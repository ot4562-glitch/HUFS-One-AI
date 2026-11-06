import {resolveDeadlineClaims, type ClaimRecord, type ResolvedDates} from '../normalization/claims.js';
import {gateBySourceRevision, selectCurrentRevisions, type RevisionRecord} from '../normalization/revisions.js';
import {DEMO_AS_OF} from '../opportunities/demo-corpus.js';
import {DEMO_NOTICES} from './demo-notices.js';
import type {Notice} from './notice.js';

/**
 * #10 SYNTHETIC revision overlay for the 10 demo academic notices. DEMO_NOTICES (all r1) is unchanged.
 * Five notices get an r2. The corrected student deadline of SYN-NOT-001 is not hard-coded: it is
 * resolved from mock claims (resolveDeadlineClaims), so only a VERIFIED, reviewer-checked, exactly
 * quoted STUDENT claim on the current revision can set it. Dates are relative to DEMO_AS_OF.
 */
const DAY = 86_400_000;
const at = (days:number, hours = 0) => new Date(Date.parse(DEMO_AS_OF) + days * DAY + hours * 3_600_000).toISOString();
const byId = new Map(DEMO_NOTICES.map(n => [n.id, n]));
const rev = (n:string, r:number) => `SYN-NSRC-${n}-r${r}`;

export type DemoNoticeScenario = 'DEADLINE_CORRECTED'|'RIGHTS_BLOCKED'|'UNREVIEWED_CHANGE'|'CANCELLED'|'CORRECTION_AFTER_AS_OF';
export interface DemoNoticeRevisionCase {noticeId:string; scenario:DemoNoticeScenario; r1:string; r2:string}

interface Spec {n:string; scenario:DemoNoticeScenario; fetched:number; verified?:number;
  status:RevisionRecord['status']; changeKind:RevisionRecord['changeKind']}
const SPECS:readonly Spec[] = [
  // Student deadline 4 → 9 days (≤7 → >7): CRITICAL_DUE becomes ACADEMIC_REQUIRED; admin deadline unchanged.
  {n:'001', scenario:'DEADLINE_CORRECTED', fetched:-1, verified:-1, status:'ACTIVE', changeKind:'CORRECTED'},
  // GPA scholarship: rights withdrawn on the new revision. Neither revision may be shown.
  {n:'005', scenario:'RIGHTS_BLOCKED', fetched:-1, verified:-1, status:'BLOCKED_RIGHTS', changeKind:'CORRECTED'},
  // Course notice changed but waiting for review: the superseded r1 must not come back.
  {n:'008', scenario:'UNREVIEWED_CHANGE', fetched:-1, verified:-1, status:'NEEDS_REVIEW', changeKind:'CORRECTED'},
  {n:'006', scenario:'CANCELLED', fetched:-1, verified:-1, status:'ACTIVE', changeKind:'CANCELLED'},
  // Exam notice corrected after DEMO_AS_OF: unknowable in a past view, r1 stays current.
  {n:'003', scenario:'CORRECTION_AFTER_AS_OF', fetched:1, verified:1, status:'ACTIVE', changeKind:'CORRECTED'},
];

export const DEMO_NOTICE_REVISION_CASES:readonly DemoNoticeRevisionCase[] = SPECS.map(s => ({
  noticeId:`SYN-NOT-${s.n}`, scenario:s.scenario, r1:rev(s.n, 1), r2:rev(s.n, 2),
}));

/** Trusted paragraph of SYN-NOT-001 r2 that the mock claims quote. */
export const SYN_NOT_001_R2_PARAGRAPH = {revisionId:rev('001', 2), paragraphId:'p1',
  text:'졸업인증 서류 제출 기한을 연장합니다. 학생 제출 마감은 공지일로부터 9일 후 09시이며 학과 보고 일정은 변동 없습니다.'};
const quote = '학생 제출 마감은 공지일로부터 9일 후 09시';
const QUOTE_START = Array.from(SYN_NOT_001_R2_PARAGRAPH.text.slice(0, SYN_NOT_001_R2_PARAGRAPH.text.indexOf(quote))).length;
/** Exact code-point TEXT span of `quote` in the r2 paragraph, attributed to `sourceRevisionId`. */
const span = (sourceRevisionId:string) => ({kind:'TEXT' as const, sourceRevisionId, paragraphId:'p1',
  startCodePoint:QUOTE_START, endCodePoint:QUOTE_START + Array.from(quote).length, quote});

/** Mock claims for SYN-NOT-001 r2: one valid, plus the ways a claim must be refused. */
export const SYN_NOT_001_CLAIMS:readonly ClaimRecord[] = [
  {claimId:'SYN-CLM-001-ok', sourceRevisionId:rev('001', 2), field:'studentDeadline', value:at(9, 9), state:'VERIFIED',
    dateKind:'STUDENT', claimCheckedAt:at(-1), reviewerId:'SYN-REVIEWER-1', evidence:[span(rev('001', 2))]},
  // An AI candidate with an earlier date: not VERIFIED, never used.
  {claimId:'SYN-CLM-001-candidate', sourceRevisionId:rev('001', 2), field:'studentDeadline', value:at(3, 9), state:'CANDIDATE',
    dateKind:'STUDENT', evidence:[span(rev('001', 2))]},
  // The department report date offered as the student deadline: wrong date kind.
  {claimId:'SYN-CLM-001-admin', sourceRevisionId:rev('001', 2), field:'studentDeadline', value:at(2), state:'VERIFIED',
    dateKind:'ADMIN', claimCheckedAt:at(-1), reviewerId:'SYN-REVIEWER-1', evidence:[span(rev('001', 2))]},
  // A claim checked on the superseded r1.
  {claimId:'SYN-CLM-001-old', sourceRevisionId:rev('001', 1), field:'studentDeadline', value:at(4, 9), state:'VERIFIED',
    dateKind:'STUDENT', claimCheckedAt:at(-6), reviewerId:'SYN-REVIEWER-1', evidence:[span(rev('001', 1))]},
];

/** r2 of SYN-NOT-001 with dates taken only from resolved claims; an unresolved date is left unset (UNKNOWN). */
export function correctedNotice001(claims:readonly ClaimRecord[] = SYN_NOT_001_CLAIMS, asOf:string = DEMO_AS_OF):{notice:Notice; resolved:ResolvedDates} {
  const r1 = byId.get('SYN-NOT-001')!;
  const resolved = resolveDeadlineClaims(claims, {currentRevisionId:rev('001', 2), asOf, paragraphs:[SYN_NOT_001_R2_PARAGRAPH]});
  const {studentDeadline:_old, ...base} = r1;
  return {resolved, notice:{...base, sourceSnapshotId:rev('001', 2), evidenceRefs:['EV-SYN-NOT-001-r2'],
    ...(resolved.dates.studentDeadline === undefined ? {} : {studentDeadline:resolved.dates.studentDeadline})}};
}

const r2Notice = (s:Spec):Notice => s.n === '001'
  ? correctedNotice001().notice
  : {...byId.get(`SYN-NOT-${s.n}`)!, sourceSnapshotId:rev(s.n, 2)};

export const DEMO_NOTICE_REVISIONS:readonly RevisionRecord[] = [
  ...DEMO_NOTICES.map((n):RevisionRecord => ({revisionId:n.sourceSnapshotId, sourceId:n.sourceSnapshotId.replace(/-r1$/u, ''),
    status:'ACTIVE', changeKind:'NEW', provenance:'SYNTHETIC', permissionRef:'SYN-PERMISSION',
    publishedAt:n.publishedAt!, fetchedAt:n.publishedAt!, lastVerifiedAt:n.publishedAt!})),
  ...SPECS.map((s):RevisionRecord => ({revisionId:rev(s.n, 2), sourceId:`SYN-NSRC-${s.n}`, supersedes:rev(s.n, 1),
    status:s.status, changeKind:s.changeKind, provenance:'SYNTHETIC', permissionRef:'SYN-PERMISSION',
    publishedAt:at(s.fetched), fetchedAt:at(s.fetched), ...(s.verified === undefined ? {} : {lastVerifiedAt:at(s.verified)})})),
];

export const DEMO_ALL_NOTICE_REVISIONS:readonly Notice[] = [...DEMO_NOTICES, ...SPECS.map(r2Notice)];

/** Notices usable at asOf through the SourceRevision gate (one current revision per notice). */
export function gatedDemoNotices(asOf:string = DEMO_AS_OF):{usable:Notice[]; quarantined:{id:string; revisionId:string; reason:string}[]} {
  const g = gateBySourceRevision(DEMO_ALL_NOTICE_REVISIONS, selectCurrentRevisions(DEMO_NOTICE_REVISIONS, asOf));
  return {usable:g.usable, quarantined:g.quarantined};
}
