import {describe, expect, it} from 'vitest';
import {gateBySourceRevision, selectCurrentRevisions} from '../normalization/revisions.js';
import {DEMO_AS_OF} from '../opportunities/demo-corpus.js';
import {DEMO_STUDENTS} from '../opportunities/demo-profiles.js';
import {DEMO_NOTICES} from './demo-notices.js';
import {
  DEMO_ALL_NOTICE_REVISIONS, DEMO_NOTICE_REVISION_CASES, DEMO_NOTICE_REVISIONS, SYN_NOT_001_CLAIMS, correctedNotice001, gatedDemoNotices,
} from './demo-notice-revisions.js';
import {composeNotices} from './notice.js';

const at = (days:number, hours = 0) => new Date(Date.parse(DEMO_AS_OF) + days * 86_400_000 + hours * 3_600_000).toISOString();
const student = (s:string) => DEMO_STUDENTS.find(x => x.subject === s)!.noticeStudent;

describe('#10 notice counter-examples through synthetic SourceRevision / asOf', () => {
  const g = gatedDemoNotices();
  const q = new Map(g.quarantined.map(x => [x.revisionId, x.reason]));

  it('keeps DEMO_NOTICES unchanged and gates every scenario with the expected reason', () => {
    expect(DEMO_NOTICES).toHaveLength(10);
    expect(DEMO_NOTICE_REVISIONS).toHaveLength(15);
    expect(Object.fromEntries(g.quarantined.map(x => [x.revisionId, x.reason]))).toEqual({
      'SYN-NSRC-001-r1':'SUPERSEDED',
      'SYN-NSRC-003-r2':'NOT_KNOWN_AT_ASOF',
      'SYN-NSRC-005-r1':'SUPERSEDED', 'SYN-NSRC-005-r2':'NOT_ACTIVE',
      'SYN-NSRC-006-r1':'SUPERSEDED', 'SYN-NSRC-006-r2':'CANCELLED',
      'SYN-NSRC-008-r1':'SUPERSEDED', 'SYN-NSRC-008-r2':'NOT_ACTIVE',
    });
    expect(g.usable.map(n => n.id).sort()).toEqual(['SYN-NOT-001', 'SYN-NOT-002', 'SYN-NOT-003', 'SYN-NOT-004', 'SYN-NOT-007', 'SYN-NOT-009', 'SYN-NOT-010']);
    expect(g.usable.find(n => n.id === 'SYN-NOT-003')?.sourceSnapshotId).toBe('SYN-NSRC-003-r1');
    expect(q.size).toBe(8);
  });

  it('the corrected student deadline comes only from the VERIFIED, quoted STUDENT claim on r2', () => {
    const {notice, resolved} = correctedNotice001();
    expect(resolved).toEqual({dates:{studentDeadline:at(9, 9)}, conflicts:[], ignored:[
      {claimId:'SYN-CLM-001-admin', reason:'WRONG_DATE_KIND'},
      {claimId:'SYN-CLM-001-candidate', reason:'NOT_VERIFIED'},
      {claimId:'SYN-CLM-001-old', reason:'OTHER_REVISION'},
    ]});
    expect(notice.studentDeadline).toBe(at(9, 9));
    expect(notice.adminReportDeadline).toBe(DEMO_NOTICES.find(n => n.id === 'SYN-NOT-001')!.adminReportDeadline);
  });

  it('conflicting, late-checked or misquoted claims leave the deadline UNKNOWN instead of guessing', () => {
    const ok = SYN_NOT_001_CLAIMS[0]!;
    const conflict = correctedNotice001([ok, {...ok, claimId:'SYN-CLM-001-b', value:at(10, 9)}]);
    expect(conflict.resolved.conflicts).toEqual(['studentDeadline']);
    expect(conflict.notice.studentDeadline).toBeUndefined();
    const late = correctedNotice001([{...ok, claimCheckedAt:at(1)}]);
    expect(late.resolved.ignored).toEqual([{claimId:'SYN-CLM-001-ok', reason:'CHECKED_AFTER_ASOF'}]);
    const misquoted = correctedNotice001([{...ok, evidence:[{...(ok.evidence[0] as object), quote:'학생 제출 마감은 공지일로부터 3일 후 09시'} as typeof ok.evidence[number]]}]);
    expect(misquoted.resolved.ignored).toEqual([{claimId:'SYN-CLM-001-ok', reason:'EVIDENCE_MISMATCH'}]);
    // No deadline → a linked required notice is ACADEMIC_REQUIRED, never CRITICAL_DUE.
    const ev = composeNotices(student('S01'), [conflict.notice], {asOf:DEMO_AS_OF}).evaluations[0]!;
    expect([ev.priority, ev.studentDeadline]).toEqual(['ACADEMIC_REQUIRED', undefined]);
  });
});

describe('#10 every student sees only current revisions; grades and pins follow the correction', () => {
  const g = gatedDemoNotices();
  const view = (s:string) => composeNotices(student(s), g.usable, {asOf:DEMO_AS_OF});

  it('S01: 9-day correction moves SYN-NOT-001 from CRITICAL_DUE to ACADEMIC_REQUIRED; the unreviewed course change drops its pin', () => {
    const before = composeNotices(student('S01'), DEMO_NOTICES, {asOf:DEMO_AS_OF});
    expect(before.result.pinnedIds).toEqual(['SYN-NOT-008', 'SYN-NOT-001']);
    const after = view('S01');
    const e001 = after.evaluations.find(e => e.noticeId === 'SYN-NOT-001')!;
    expect([e001.priority, e001.studentDeadline, e001.adminReportDeadline]).toEqual(['ACADEMIC_REQUIRED', at(9, 9), at(2)]);
    expect(after.result.pinnedIds).toEqual(['SYN-NOT-001']);
  });

  it('S04: losing the only CRITICAL course notice leaves no pin; S03 keeps the r1 exam notice pinned', () => {
    expect(composeNotices(student('S04'), DEMO_NOTICES, {asOf:DEMO_AS_OF}).result.pinnedIds).toEqual(['SYN-NOT-008']);
    expect(view('S04').result.pinnedIds).toEqual([]);
    expect(view('S03').result.pinnedIds).toEqual(['SYN-NOT-003']);
  });

  for (const s of DEMO_STUDENTS) {
    it(`${s.subject}: rights-blocked, cancelled and unreviewed notices never appear; nothing is excluded silently`, () => {
      const r = view(s.subject);
      const ids = r.result.items.map(i => i.noticeId);
      for (const c of DEMO_NOTICE_REVISION_CASES.filter(c => c.scenario !== 'DEADLINE_CORRECTED' && c.scenario !== 'CORRECTION_AFTER_AS_OF')) {
        expect(ids).not.toContain(c.noticeId);
      }
      expect(r.excluded).toEqual([]);
      const e001 = r.evaluations.find(e => e.noticeId === 'SYN-NOT-001');
      if (e001) expect(e001.studentDeadline).toBe(at(9, 9));
    });
  }

  it('without the gate both revisions share an id and composeNotices excludes every copy (DUPLICATE_ID)', () => {
    const r = composeNotices(student('S01'), DEMO_ALL_NOTICE_REVISIONS, {asOf:DEMO_AS_OF});
    expect(r.excluded.filter(x => x.reason === 'DUPLICATE_ID').map(x => x.noticeId).sort())
      .toEqual(['SYN-NOT-001', 'SYN-NOT-001', 'SYN-NOT-003', 'SYN-NOT-003', 'SYN-NOT-005', 'SYN-NOT-005', 'SYN-NOT-006', 'SYN-NOT-006', 'SYN-NOT-008', 'SYN-NOT-008']);
  });

  it('a view after the late correction is fetched uses SYN-NOT-003 r2; input order never changes the gate', () => {
    expect(gatedDemoNotices(at(2)).usable.find(n => n.id === 'SYN-NOT-003')?.sourceSnapshotId).toBe('SYN-NSRC-003-r2');
    const rev = gateBySourceRevision([...DEMO_ALL_NOTICE_REVISIONS].reverse(), selectCurrentRevisions([...DEMO_NOTICE_REVISIONS].reverse(), DEMO_AS_OF));
    expect(JSON.stringify(rev.quarantined)).toBe(JSON.stringify(g.quarantined));
  });
});
