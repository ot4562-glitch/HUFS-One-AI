import {CalendarResultSchema, type CalendarResult, type DemoSnapshot, type SubjectAlias} from '@hufs-one/contracts';
import {
  DEMO_AS_OF, DEMO_OPPORTUNITIES, DEMO_PUBLISHED_AT, DEMO_STUDENTS,
  buildCalendar, buildDemoSnapshot, composeFeed, scopeInputsToGrant,
} from '../../../../packages/core/src/opportunities/index.js';
import {DEMO_NOTICES, composeNotices} from '../../../../packages/core/src/notices/index.js';

/**
 * Per-subject SYNTHETIC data for the dev-only client, derived from the single demo corpus (#61/#67):
 * each S01–S05 gets its own snapshot (feed, notices, versions, asOf) and its own calendar computed at
 * the same DEMO_AS_OF. No subject ever reuses another subject's content. Dev/test only — this module
 * is never reached from a production build.
 */
export interface SyntheticSubject {
  readonly label: string;
  readonly snapshot: DemoSnapshot;
  readonly calendar: CalendarResult;
}

const ALL = ['FEED', 'NOTICES', 'EXPERIENCE', 'ACADEMICS', 'FORECAST'] as const;

export function buildSyntheticSubjects(): ReadonlyMap<SubjectAlias, SyntheticSubject> {
  const out = new Map<SubjectAlias, SyntheticSubject>();
  for (const student of DEMO_STUDENTS) {
    const snapshot = buildDemoSnapshot(student);
    const scoped = scopeInputsToGrant(student.profile, student.noticeStudent, ALL);
    if (!scoped.profile || !scoped.noticeStudent) throw new RangeError('synthetic subject needs FEED and NOTICES');
    const feed = composeFeed(scoped.profile, DEMO_OPPORTUNITIES, {asOf: DEMO_AS_OF, publishedAtBySnapshotId: DEMO_PUBLISHED_AT});
    const notices = composeNotices(scoped.noticeStudent, DEMO_NOTICES, {asOf: DEMO_AS_OF});
    const calendar = CalendarResultSchema.parse(buildCalendar(feed, notices, DEMO_NOTICES, {asOf: DEMO_AS_OF}));
    out.set(student.subject, {label: student.label, snapshot, calendar});
  }
  return out;
}
