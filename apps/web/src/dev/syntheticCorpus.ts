import {CalendarResultSchema, DemoSnapshotSchema, type CalendarResult, type DemoSnapshot, type SubjectAlias} from '@hufs-one/contracts';
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

/**
 * The corpus leaves academics/forecast PENDING (academics track owns them). For the 졸업 screen demo,
 * S01 alone gets a small hand-written SYNTHETIC summary; every other subject stays PENDING.
 */
const S01_ACADEMICS = {
  state: 'NEEDS_REVIEW', rulePackVersion: 'SYN-RULE-DEMO-1', asOf: DEMO_AS_OF,
  earnedCreditUnits: 190, inProgressCreditUnits: 36, plannedCreditUnits: 24,
  deficits: [
    {requirementId: 'SYN-REQ-MAJOR-CORE', missingCreditUnits: 6, state: 'MISSING', evidenceRefs: ['EV-SYN-RULE-1']},
    {requirementId: 'SYN-REQ-GRAD-CERT', state: 'NEEDS_REVIEW', evidenceRefs: ['EV-SYN-RULE-2']},
  ],
  caveats: ['시연용 가상 규칙입니다. 실제 학칙이 아닙니다.'],
} as const;
const S01_FORECAST = {
  asOf: DEMO_AS_OF, status: 'PARTIAL',
  items: [
    {courseId: 'SYN-C-STAT301', targetTerm: '2027-1', signal: 'HISTORICAL_PATTERN', asOf: DEMO_AS_OF, coverage: 'COMPLETE_TERM_CATALOG',
      sameSeasonObservedTerms: 4, sameSeasonOfferedTerms: 3, evidenceRefs: ['EV-SYN-OUTLOOK-1'], caveat: '과거 패턴일 뿐 개설 확정이 아닙니다.'},
    {courseId: 'SYN-C-DATA210', targetTerm: '2027-1', signal: 'INSUFFICIENT_DATA', asOf: DEMO_AS_OF, coverage: 'PARTIAL',
      sameSeasonObservedTerms: 1, sameSeasonOfferedTerms: 1, evidenceRefs: [], caveat: '확인된 학기가 적어 전망을 내지 않습니다.'},
  ],
} as const;

export function buildSyntheticSubjects(): ReadonlyMap<SubjectAlias, SyntheticSubject> {
  const out = new Map<SubjectAlias, SyntheticSubject>();
  for (const student of DEMO_STUDENTS) {
    const generated = buildDemoSnapshot(student);
    const snapshot = student.subject === 'S01'
      ? DemoSnapshotSchema.parse({...generated, academics: S01_ACADEMICS, forecast: S01_FORECAST})
      : generated;
    const scoped = scopeInputsToGrant(student.profile, student.noticeStudent, ALL);
    if (!scoped.profile || !scoped.noticeStudent) throw new RangeError('synthetic subject needs FEED and NOTICES');
    const feed = composeFeed(scoped.profile, DEMO_OPPORTUNITIES, {asOf: DEMO_AS_OF, publishedAtBySnapshotId: DEMO_PUBLISHED_AT});
    const notices = composeNotices(scoped.noticeStudent, DEMO_NOTICES, {asOf: DEMO_AS_OF});
    const calendar = CalendarResultSchema.parse(buildCalendar(feed, notices, DEMO_NOTICES, {asOf: DEMO_AS_OF}));
    out.set(student.subject, {label: student.label, snapshot, calendar});
  }
  return out;
}
